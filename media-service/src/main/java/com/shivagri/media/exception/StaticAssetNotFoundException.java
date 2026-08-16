package com.shivagri.media.exception;

/**
 * Raised when a CDN key does not resolve to a servable file — missing, a directory,
 * a disallowed extension, or a path-traversal attempt. All of these surface to the
 * client as a plain 404 so the endpoint never leaks what exists on disk.
 */
public class StaticAssetNotFoundException extends RuntimeException {

    public StaticAssetNotFoundException(String message) {
        super(message);
    }
}
