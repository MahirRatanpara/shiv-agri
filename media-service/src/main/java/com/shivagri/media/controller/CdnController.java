package com.shivagri.media.controller;

import com.shivagri.media.cdn.StaticAsset;
import com.shivagri.media.cdn.StaticAssetService;
import com.shivagri.media.config.CdnProperties;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.ResourceRegion;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpRange;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
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

    private final StaticAssetService staticAssetService;
    private final CdnProperties properties;

    /**
     * Serve a static asset. Also answers HEAD (Spring derives it from the GET mapping),
     * which is what players use to probe size and Range support before streaming.
     *
     * @param key the CDN key — everything after /api/v1/cdn/, e.g. "videos/home-about.mov"
     */
    @GetMapping("/cdn/{*key}")
    public ResponseEntity<?> serve(
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
     * Hand the file off to nginx. The body stays empty — nginx replaces it with the file
     * contents and adds Content-Length/Accept-Ranges, honouring any Range header itself.
     */
    private ResponseEntity<Void> serveViaAccel(StaticAsset asset, String disposition, String rangeHeader) {
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
    private ResponseEntity<?> serveFromJava(StaticAsset asset, String disposition,
                                            String rangeHeader, HttpServletRequest request) {
        Resource resource = new FileSystemResource(asset.path());
        long length = asset.sizeBytes();

        if (rangeHeader == null || rangeHeader.isBlank()) {
            log.info("CDN stream(full): key={} size={} ua={}", asset.key(), length, userAgent(request));
            return baseHeaders(HttpStatus.OK, asset, disposition)
                    .contentLength(length)
                    .body(resource);
        }

        List<HttpRange> ranges;
        try {
            ranges = HttpRange.parseRanges(rangeHeader);
        } catch (IllegalArgumentException e) {
            log.warn("CDN malformed Range '{}' for key={}", rangeHeader, asset.key());
            return ResponseEntity.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                    .header(HttpHeaders.CONTENT_RANGE, "bytes */" + length)
                    .build();
        }

        if (ranges.isEmpty()) {
            return baseHeaders(HttpStatus.OK, asset, disposition).contentLength(length).body(resource);
        }

        // Only the first range is served. Multipart/byteranges is legal but no browser
        // media element needs it, and a single region keeps the response simple.
        HttpRange range = ranges.get(0);
        long start = range.getRangeStart(length);
        long end = range.getRangeEnd(length);

        if (start >= length) {
            log.warn("CDN unsatisfiable Range start={} size={} key={}", start, length, asset.key());
            return ResponseEntity.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                    .header(HttpHeaders.CONTENT_RANGE, "bytes */" + length)
                    .build();
        }

        // Cap the slice: an open-ended "bytes=0-" on a 51 MB file would otherwise tie up
        // one servlet thread for the entire transfer. Returning less than asked for is
        // allowed — the client simply issues another Range request for the remainder.
        long requested = end - start + 1;
        long served = Math.min(requested, properties.getChunkSizeBytes());
        ResourceRegion region = new ResourceRegion(resource, start, served);

        log.info("CDN stream(range): key={} bytes={}-{}/{} served={}",
                asset.key(), start, start + served - 1, length, served);

        // Content-Range is written by ResourceRegionHttpMessageConverter from the region.
        return baseHeaders(HttpStatus.PARTIAL_CONTENT, asset, disposition)
                .body(region);
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
