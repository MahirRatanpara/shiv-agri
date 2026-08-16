package com.shivagri.media.controller;

import com.shivagri.media.cdn.StaticAsset;
import com.shivagri.media.cdn.StaticAssetService;
import com.shivagri.media.config.CdnProperties;
import com.shivagri.media.controller.dto.CdnRefreshResponse;
import com.shivagri.media.exception.StaticAssetNotFoundException;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpRange;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.IOException;
import java.nio.channels.Channels;
import java.nio.channels.FileChannel;
import java.nio.channels.WritableByteChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Public CDN surface for static assets.
 *
 * <p>Two serving modes, chosen by {@code media.cdn.accel.enabled}:
 * <ul>
 *   <li><b>X-Accel-Redirect (prod)</b> — this controller only resolves and validates the
 *       key, then hands nginx an internal redirect. nginx serves the bytes with sendfile
 *       and handles Range itself. A 51 MB video costs the JVM nothing.</li>
 *   <li><b>Java streaming (dev / no nginx)</b> — streams from disk with full
 *       {@code Range}/206 support so a {@code <video>} tag fetches only what it plays
 *       instead of downloading the whole file up front.</li>
 * </ul>
 *
 * <p>Deliberately unauthenticated: this serves public marketing content that the
 * homepage renders before login. Nothing user-owned is reachable here — the static
 * root is a separate volume from the upload root.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class CdnController {

    /** Shared-secret header for the refresh endpoint. */
    static final String REFRESH_TOKEN_HEADER = "X-CDN-Refresh-Token";

    private final StaticAssetService staticAssetService;
    private final CdnProperties properties;

    /**
     * Serve a static asset. Also answers HEAD (Spring derives it from the GET mapping),
     * which is what players use to probe size and Range support before streaming.
     *
     * @param key the CDN key — everything after /api/v1/cdn/, e.g. "videos/home-about.mov"
     */
    // NOTE: the declared generic here is load-bearing. Spring resolves the handler's
    // declared return type to pick a message converter, so a wildcard (ResponseEntity<?>)
    // or Object leaves it unable to match anything for a body — which is exactly how the
    // earlier ResourceRegion attempt failed with "No converter for [ResourceRegion]".
    // StreamingResponseBody sidesteps converters entirely: we write the bytes ourselves.
    @GetMapping("/cdn/{*key}")
    public ResponseEntity<StreamingResponseBody> serve(
            @PathVariable("key") String key,
            @RequestHeader(value = HttpHeaders.RANGE, required = false) String rangeHeader,
            @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch,
            @RequestParam(value = "download", required = false, defaultValue = "false") boolean download,
            HttpServletRequest request) {

        StaticAsset asset = staticAssetService.resolve(key);

        // Conditional GET short-circuit. Runs before the accel handoff so a cache hit
        // never reaches the filesystem at all.
        if (matchesEtag(ifNoneMatch, asset.etag())) {
            log.debug("CDN 304: key={}", asset.key());
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED)
                    .eTag(asset.etag())
                    .cacheControl(cacheControl())
                    .build();
        }

        String disposition = (download ? "attachment" : "inline")
                + "; filename=\"" + filenameOf(asset.key()) + "\"";

        if (properties.getAccel().isEnabled()) {
            return serveViaAccel(asset, disposition, rangeHeader);
        }
        return serveFromJava(asset, disposition, rangeHeader, request);
    }

    /**
     * Sync-generated inventory of every available key. Lives on its own path rather than
     * under /cdn/ so it can never collide with a real asset key.
     */
    @GetMapping("/cdn-manifest")
    public ResponseEntity<Map<String, StaticAssetService.ManifestEntry>> manifest() {
        Map<String, StaticAssetService.ManifestEntry> manifest = staticAssetService.getManifest();
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic())
                .body(manifest);
    }

    /**
     * Force a re-read of manifest.json, ignoring the mtime check that gates the
     * automatic reload.
     *
     * <p>Scope, precisely: this refreshes the checksums and content-types this service
     * hands out, which is what determines the ETag on future responses. It does
     * <b>not</b> reach caches it does not own — a browser holding a copy under
     * {@code max-age} will not re-request the asset regardless of what this endpoint
     * does. Changing the bytes for an already-cached visitor needs a new URL, not a
     * server-side purge. There is no nginx {@code proxy_cache} on this path, so nothing
     * else is holding stale content either.
     *
     * <p>Normally unnecessary: rsync rewrites manifest.json with a fresh mtime, so the
     * sync workflow already triggers the automatic reload. This covers the cases mtime
     * cannot see — a manifest restored with a preserved timestamp, or edited directly
     * on the volume.
     *
     * <p>Guarded by a shared secret; 404s when {@code media.cdn.refresh-token} is unset.
     */
    @PostMapping("/cdn-refresh")
    public ResponseEntity<CdnRefreshResponse> refresh(
            @RequestHeader(value = REFRESH_TOKEN_HEADER, required = false) String token) {

        String expected = properties.getRefreshToken();
        if (expected == null || expected.isBlank()) {
            log.warn("CDN refresh rejected: no refresh token configured");
            throw new StaticAssetNotFoundException("Not found");
        }
        if (token == null || !MessageDigest.isEqual(
                token.getBytes(StandardCharsets.UTF_8), expected.getBytes(StandardCharsets.UTF_8))) {
            log.warn("CDN refresh rejected: bad or missing token");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        StaticAssetService.RefreshResult result = staticAssetService.refreshManifest();
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(new CdnRefreshResponse(
                        result.manifestPresent() ? "refreshed" : "manifest-missing",
                        result.manifestPresent(),
                        result.assetsBefore(),
                        result.assetsAfter(),
                        result.generatedAt(),
                        result.commit(),
                        Instant.now()));
    }

    /**
     * Hand the file off to nginx. The body stays empty — nginx replaces it with the file
     * contents and adds Content-Length/Accept-Ranges, honouring any Range header itself.
     */
    private ResponseEntity<StreamingResponseBody> serveViaAccel(StaticAsset asset, String disposition,
                                                                String rangeHeader) {
        String internalPath = properties.getAccel().getInternalPrefix()
                + staticAssetService.encodeForAccel(asset.key());

        log.info("CDN accel: key={} size={} range={}", asset.key(), asset.sizeBytes(),
                rangeHeader != null ? rangeHeader : "-");

        return ResponseEntity.ok()
                .header("X-Accel-Redirect", internalPath)
                .header(HttpHeaders.CONTENT_TYPE, asset.contentType())
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition)
                .eTag(asset.etag())
                .lastModified(asset.lastModified())
                .cacheControl(cacheControl())
                .build();
    }

    /** Stream from the JVM, honouring Range so playback starts without a full download. */
    private ResponseEntity<StreamingResponseBody> serveFromJava(StaticAsset asset, String disposition,
                                                                String rangeHeader, HttpServletRequest request) {
        long length = asset.sizeBytes();

        if (rangeHeader == null || rangeHeader.isBlank()) {
            log.info("CDN stream(full): key={} size={} ua={}", asset.key(), length, userAgent(request));
            return baseHeaders(HttpStatus.OK, asset, disposition)
                    .contentLength(length)
                    .body(slice(asset, 0, length));
        }

        List<HttpRange> ranges;
        try {
            ranges = HttpRange.parseRanges(rangeHeader);
        } catch (IllegalArgumentException e) {
            log.warn("CDN malformed Range '{}' for key={}", rangeHeader, asset.key());
            return unsatisfiable(length);
        }

        if (ranges.isEmpty()) {
            return baseHeaders(HttpStatus.OK, asset, disposition)
                    .contentLength(length)
                    .body(slice(asset, 0, length));
        }

        // Only the first range is served. Multipart/byteranges is legal but no browser
        // media element needs it, and a single region keeps the response simple.
        HttpRange range = ranges.get(0);
        long start = range.getRangeStart(length);
        long end = range.getRangeEnd(length);

        if (start >= length) {
            log.warn("CDN unsatisfiable Range start={} size={} key={}", start, length, asset.key());
            return unsatisfiable(length);
        }

        // Cap the slice: an open-ended "bytes=0-" on a 51 MB file would otherwise tie up
        // one connection for the entire transfer. Returning less than asked for is
        // allowed — the client simply issues another Range request for the remainder.
        long requested = end - start + 1;
        long served = Math.min(requested, properties.getChunkSizeBytes());

        log.info("CDN stream(range): key={} bytes={}-{}/{} served={}",
                asset.key(), start, start + served - 1, length, served);

        return baseHeaders(HttpStatus.PARTIAL_CONTENT, asset, disposition)
                .header(HttpHeaders.CONTENT_RANGE,
                        "bytes " + start + "-" + (start + served - 1) + "/" + length)
                .contentLength(served)
                .body(slice(asset, start, served));
    }

    private ResponseEntity<StreamingResponseBody> unsatisfiable(long length) {
        return ResponseEntity.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                .header(HttpHeaders.CONTENT_RANGE, "bytes */" + length)
                .build();
    }

    /**
     * Copies {@code count} bytes starting at {@code offset} straight to the response.
     *
     * <p>FileChannel.transferTo lets the kernel move the data without round-tripping it
     * through heap buffers — the closest equivalent to nginx's sendfile on the fallback
     * path. The output channel is intentionally not closed: the servlet container owns
     * the response stream.
     */
    private StreamingResponseBody slice(StaticAsset asset, long offset, long count) {
        return outputStream -> {
            try (FileChannel channel = FileChannel.open(asset.path(), StandardOpenOption.READ)) {
                WritableByteChannel target = Channels.newChannel(outputStream);
                long transferred = 0;
                while (transferred < count) {
                    long n = channel.transferTo(offset + transferred, count - transferred, target);
                    if (n <= 0) {
                        break;
                    }
                    transferred += n;
                }
                outputStream.flush();
            } catch (IOException e) {
                // Seeking or closing a video aborts the connection mid-transfer. That is
                // normal client behaviour, not a server fault — log quietly and move on.
                log.debug("CDN transfer aborted: key={} offset={} count={} ({})",
                        asset.key(), offset, count, e.getMessage());
            }
        };
    }

    private ResponseEntity.BodyBuilder baseHeaders(HttpStatus status, StaticAsset asset, String disposition) {
        return ResponseEntity.status(status)
                .contentType(MediaType.parseMediaType(asset.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition)
                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                .eTag(asset.etag())
                .lastModified(asset.lastModified())
                .cacheControl(cacheControl());
    }

    private CacheControl cacheControl() {
        return CacheControl.maxAge(Duration.ofSeconds(properties.getCacheMaxAgeSeconds())).cachePublic();
    }

    /** RFC 7232: If-None-Match may carry a list, "*", or weak forms of the tag. */
    private static boolean matchesEtag(String ifNoneMatch, String etag) {
        if (ifNoneMatch == null || ifNoneMatch.isBlank()) {
            return false;
        }
        String header = ifNoneMatch.trim();
        if ("*".equals(header)) {
            return true;
        }
        for (String candidate : header.split(",")) {
            String normalized = candidate.trim();
            if (normalized.startsWith("W/")) {
                normalized = normalized.substring(2);
            }
            if (normalized.equals(etag)) {
                return true;
            }
        }
        return false;
    }

    private static String filenameOf(String key) {
        int slash = key.lastIndexOf('/');
        String name = slash >= 0 ? key.substring(slash + 1) : key;
        // Quotes would terminate the header value early.
        return name.replace("\"", "");
    }

    private static String userAgent(HttpServletRequest request) {
        String ua = request.getHeader(HttpHeaders.USER_AGENT);
        if (ua == null) {
            return "-";
        }
        return ua.length() > 60 ? ua.substring(0, 60) : ua;
    }
}
