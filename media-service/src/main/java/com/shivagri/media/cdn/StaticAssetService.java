package com.shivagri.media.cdn;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.shivagri.media.config.CdnProperties;
import com.shivagri.media.exception.StaticAssetNotFoundException;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Collections;
import java.util.Locale;
import java.util.Map;

/**
 * Resolves CDN keys to files under the static root.
 *
 * <p>The contract is deliberately dumb: key == relative path. No UUIDs, no database
 * lookup, no indirection — "videos/home-about.mov" is literally that file on disk.
 * That is what makes the content replaceable by re-running the sync workflow without
 * rebuilding any Docker image.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class StaticAssetService {

    private final CdnProperties properties;
    private final ObjectMapper objectMapper;

    private Path rootDir;

    /** Cached manifest, refreshed whenever manifest.json's mtime changes on disk. */
    private volatile Map<String, ManifestEntry> manifest = Collections.emptyMap();
    private volatile long manifestLastModified = -1L;

    /** Provenance of the loaded manifest, echoed by the refresh endpoint. */
    private volatile String generatedAt;
    private volatile String commit;

    @PostConstruct
    void init() {
        this.rootDir = Paths.get(properties.getRootDir()).toAbsolutePath().normalize();
        if (!Files.isDirectory(rootDir)) {
            // Not fatal: the volume may simply not be populated yet on a fresh box.
            // Every lookup will 404 until the sync workflow runs, which is the correct
            // behaviour and is far better than refusing to start the whole service.
            log.warn("CDN static root does not exist yet: {} — /api/v1/cdn will 404 until assets are synced", rootDir);
        } else {
            log.info("CDN static root: {} (accel={}, maxAge={}s)",
                    rootDir, properties.getAccel().isEnabled(), properties.getCacheMaxAgeSeconds());
        }
        refreshManifestIfStale();
    }

    /**
     * Resolve a CDN key to a servable asset.
     *
     * @throws StaticAssetNotFoundException for every failure mode (missing, directory,
     *                                      disallowed extension, traversal) so callers
     *                                      cannot distinguish them from outside
     */
    public StaticAsset resolve(String rawKey) {
        String key = normalizeKey(rawKey);

        String extension = extensionOf(key);
        if (extension.isEmpty() || !properties.getAllowedExtensions().contains(extension)) {
            log.warn("CDN reject: disallowed extension key={}", key);
            throw new StaticAssetNotFoundException("Asset not found: " + key);
        }

        Path resolved = rootDir.resolve(key).normalize();
        if (!resolved.startsWith(rootDir)) {
            log.warn("CDN reject: path traversal attempt key={}", rawKey);
            throw new StaticAssetNotFoundException("Asset not found: " + key);
        }

        if (!Files.isRegularFile(resolved) || !Files.isReadable(resolved)) {
            log.debug("CDN miss: key={}", key);
            throw new StaticAssetNotFoundException("Asset not found: " + key);
        }

        long size;
        long lastModified;
        try {
            size = Files.size(resolved);
            lastModified = Files.getLastModifiedTime(resolved).toMillis();
        } catch (IOException e) {
            log.error("CDN read failure: key={}", key, e);
            throw new StaticAssetNotFoundException("Asset not found: " + key);
        }

        refreshManifestIfStale();
        ManifestEntry entry = manifest.get(key);

        String contentType = entry != null && entry.contentType() != null
                ? entry.contentType()
                : resolveContentType(extension, resolved);

        // Prefer the sync-computed checksum: it is stable across rsync runs that only
        // touch mtime, so browsers keep their cached copy when the bytes are unchanged.
        String etag = entry != null && entry.sha256() != null
                ? "\"" + entry.sha256() + "\""
                : "\"" + size + "-" + lastModified + "\"";

        return new StaticAsset(key, resolved, size, lastModified, contentType, etag);
    }

    /** Raw manifest for clients that want to discover available keys/variants. */
    public Map<String, ManifestEntry> getManifest() {
        refreshManifestIfStale();
        return manifest;
    }

    /**
     * Re-read manifest.json unconditionally, ignoring the mtime check.
     *
     * <p>The normal path already reloads on every mtime change, which covers the sync
     * workflow. This exists for the cases mtime cannot see: a manifest rewritten with a
     * preserved timestamp, a restored backup, or an edit made straight on the volume.
     *
     * <p>Note what this does <em>not</em> do: file bytes are never cached in this
     * service — {@link #resolve} stats the file on every request — and nothing purges
     * caches held by browsers or intermediaries. This refreshes checksums and
     * content-types, i.e. the ETags this service will hand out from now on.
     */
    public synchronized RefreshResult refreshManifest() {
        int before = manifest.size();
        loadManifest(true);
        boolean present = Files.isRegularFile(rootDir.resolve(properties.getManifestFile()));
        log.info("CDN manifest refresh requested: {} assets before, {} after (manifest present={})",
                before, manifest.size(), present);
        return new RefreshResult(present, before, manifest.size(), generatedAt, commit);
    }

    /**
     * Percent-encode a key for use in an X-Accel-Redirect header. nginx re-decodes the
     * URI before matching the internal location, so spaces and other unsafe characters
     * in filenames must be escaped or the redirect silently 404s.
     */
    public String encodeForAccel(String key) {
        StringBuilder sb = new StringBuilder(key.length() + 16);
        for (byte b : key.getBytes(java.nio.charset.StandardCharsets.UTF_8)) {
            int c = b & 0xFF;
            boolean unreserved = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
                    || (c >= '0' && c <= '9')
                    || c == '-' || c == '_' || c == '.' || c == '~' || c == '/';
            if (unreserved) {
                sb.append((char) c);
            } else {
                sb.append('%').append(String.format("%02X", c));
            }
        }
        return sb.toString();
    }

    private String normalizeKey(String rawKey) {
        if (rawKey == null || rawKey.isBlank()) {
            throw new StaticAssetNotFoundException("Asset key is required");
        }
        String key = rawKey.replace('\\', '/').trim();
        while (key.startsWith("/")) {
            key = key.substring(1);
        }
        // A NUL byte can truncate the path at the syscall layer; reject outright.
        if (key.indexOf('\0') >= 0 || key.contains("..")) {
            log.warn("CDN reject: illegal key={}", rawKey);
            throw new StaticAssetNotFoundException("Asset not found");
        }
        return key;
    }

    private String resolveContentType(String extension, Path path) {
        String mapped = properties.getMimeTypes().get(extension);
        if (mapped != null) {
            return mapped;
        }
        try {
            String probed = Files.probeContentType(path);
            if (probed != null) {
                return probed;
            }
        } catch (IOException e) {
            log.debug("probeContentType failed for {}", path, e);
        }
        return "application/octet-stream";
    }

    private static String extensionOf(String key) {
        int slash = key.lastIndexOf('/');
        int dot = key.lastIndexOf('.');
        if (dot < 0 || dot < slash || dot == key.length() - 1) {
            return "";
        }
        return key.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    private void refreshManifestIfStale() {
        loadManifest(false);
    }

    /**
     * @param force re-read even when mtime is unchanged. The mtime guard is what keeps
     *              this off the hot path — every {@link #resolve} call passes through
     *              here — so only the explicit refresh endpoint sets it.
     */
    private void loadManifest(boolean force) {
        Path manifestPath = rootDir.resolve(properties.getManifestFile());
        try {
            if (!Files.isRegularFile(manifestPath)) {
                if (manifestLastModified != -1L || !manifest.isEmpty()) {
                    log.info("CDN manifest removed, falling back to on-disk metadata");
                    clearManifest();
                }
                return;
            }
            long mtime = Files.getLastModifiedTime(manifestPath).toMillis();
            if (!force && mtime == manifestLastModified) {
                return;
            }
            Manifest parsed = objectMapper.readValue(manifestPath.toFile(), Manifest.class);
            manifest = parsed.assets() != null ? parsed.assets() : Collections.emptyMap();
            manifestLastModified = mtime;
            generatedAt = parsed.generatedAt();
            commit = parsed.commit();
            log.info("CDN manifest loaded: {} assets, generatedAt={}, commit={}",
                    manifest.size(), parsed.generatedAt(), parsed.commit());
        } catch (Exception e) {
            // A broken manifest must not take the CDN down — on-disk metadata is enough
            // to serve every file, we just lose checksum-based ETags until it is fixed.
            log.error("Failed to load CDN manifest at {} — serving without it", manifestPath, e);
            clearManifest();
        }
    }

    private void clearManifest() {
        manifest = Collections.emptyMap();
        manifestLastModified = -1L;
        generatedAt = null;
        commit = null;
    }

    /** Shape of manifest.json, written by the sync workflow. */
    public record Manifest(String generatedAt, String commit, Map<String, ManifestEntry> assets) {
    }

    /** Outcome of an explicit {@link #refreshManifest()}. */
    public record RefreshResult(boolean manifestPresent, int assetsBefore, int assetsAfter,
                                String generatedAt, String commit) {
    }

    public record ManifestEntry(long size, String sha256, String contentType) {
    }
}
