package com.shivagri.media.cdn;

import java.nio.file.Path;

/**
 * A resolved, validated static asset.
 *
 * @param key          CDN key, i.e. the path relative to the static root ("videos/home-about.mov")
 * @param path         absolute path on disk, already confirmed to sit inside the static root
 * @param sizeBytes    file size
 * @param lastModified last-modified epoch millis
 * @param contentType  resolved MIME type
 * @param etag         strong ETag — the manifest checksum when available, else size+mtime.
 *                     Must be strong (not W/) because it is used to validate Range requests.
 */
public record StaticAsset(
        String key,
        Path path,
        long sizeBytes,
        long lastModified,
        String contentType,
        String etag
) {
}
