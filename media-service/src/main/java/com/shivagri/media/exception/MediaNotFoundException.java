package com.shivagri.media.exception;

public class MediaNotFoundException extends RuntimeException {

    public MediaNotFoundException(String id) {
        super("Media not found: " + id);
    }
}
