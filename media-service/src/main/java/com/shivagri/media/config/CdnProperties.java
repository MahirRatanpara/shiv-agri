package com.shivagri.media.config;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.util.List;
import java.util.Map;

/**
 * Configuration for the static CDN surface (/api/v1/cdn/**).
 *
 * <p>Static assets are plain files on the VPS, synced there by the
 * "Sync CDN Static Assets" GitHub Action. Unlike uploaded media they have no
 * MongoDB record — the key IS the relative path under {@link #rootDir}, so
 * "videos/home-about.mov" resolves to "<rootDir>/videos/home-about.mov".
 */
@Getter
@Setter
@Validated
@ConfigurationProperties(prefix = "media.cdn")
public class CdnProperties {

    /** Absolute path to the static asset root on disk (bind-mounted from the VPS). */
    @NotBlank
    private String rootDir = "/var/media/static";

    /** Name of the sync-generated manifest file inside {@link #rootDir}. */
    @NotBlank
    private String manifestFile = "manifest.json";

    /**
     * Only files with these extensions are servable. Anything else 404s even if
     * it exists on disk, so a stray .env or .sh in the static tree is never exposed.
     */
    private List<String> allowedExtensions = List.of(
            "mp4", "mov", "webm", "m4v", "ogv",
            "jpg", "jpeg", "png", "webp", "gif", "svg", "avif", "ico",
            "woff", "woff2", "ttf", "otf", "eot",
            "pdf", "json", "txt", "vtt", "srt",
            "css", "js", "map",
            "m3u8", "ts", "mpd", "m4s"
    );

    /**
     * Extension → Content-Type. Files.probeContentType() is unreliable inside slim
     * containers (it leans on /etc/mime.types, which isn't always present), so the
     * mapping is explicit and probing is only the fallback.
     */
    private Map<String, String> mimeTypes = Map.ofEntries(
            Map.entry("mp4", "video/mp4"),
            Map.entry("m4v", "video/mp4"),
            Map.entry("mov", "video/quicktime"),
            Map.entry("webm", "video/webm"),
            Map.entry("ogv", "video/ogg"),
            Map.entry("jpg", "image/jpeg"),
            Map.entry("jpeg", "image/jpeg"),
            Map.entry("png", "image/png"),
            Map.entry("webp", "image/webp"),
            Map.entry("gif", "image/gif"),
            Map.entry("svg", "image/svg+xml"),
            Map.entry("avif", "image/avif"),
            Map.entry("ico", "image/x-icon"),
            Map.entry("woff", "font/woff"),
            Map.entry("woff2", "font/woff2"),
            Map.entry("ttf", "font/ttf"),
            Map.entry("otf", "font/otf"),
            Map.entry("eot", "application/vnd.ms-fontobject"),
            Map.entry("pdf", "application/pdf"),
            Map.entry("json", "application/json"),
            Map.entry("txt", "text/plain"),
            Map.entry("vtt", "text/vtt"),
            Map.entry("srt", "application/x-subrip"),
            Map.entry("css", "text/css"),
            Map.entry("js", "application/javascript"),
            Map.entry("map", "application/json"),
            Map.entry("m3u8", "application/vnd.apple.mpegurl"),
            Map.entry("ts", "video/mp2t"),
            Map.entry("mpd", "application/dash+xml"),
            Map.entry("m4s", "video/iso.segment")
    );

    /** Cache-Control max-age in seconds. Keys are stable, so revalidation rides on the ETag. */
    @Positive
    private long cacheMaxAgeSeconds = 604800; // 7 days

    /**
     * Largest slice returned for a single Range request on the Java streaming path.
     * A browser asking for "bytes=0-" on a 51 MB video gets this much and comes back
     * for more, which keeps a single request from pinning a servlet thread for the
     * whole file. Ignored on the X-Accel path (nginx does its own chunking).
     */
    @Positive
    private long chunkSizeBytes = 4L * 1024 * 1024; // 4MB

    private Accel accel = new Accel();

    /**
     * X-Accel-Redirect offload. When enabled, this service only resolves + validates
     * the key and then hands nginx an internal redirect; nginx serves the bytes with
     * sendfile and native Range handling, so video data never touches the JVM.
     *
     * <p>Requires the matching {@code internal} location in nginx.conf. Disabled by
     * default so local dev (no nginx in front) still streams from Java.
     */
    @Getter
    @Setter
    public static class Accel {
        private boolean enabled = false;

        /** Must match the {@code internal} location block in nginx.conf. */
        @NotBlank
        private String internalPrefix = "/internal-static/";
    }
}
