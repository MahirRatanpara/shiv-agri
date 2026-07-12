package com.shivagri.media.controller.dto;

import com.shivagri.media.model.MediaStatus;

import java.time.Instant;

public record UploadResponse(
        String id,
        String filename,
        String mimeType,
        long sizeBytes,
        String contentUrl,
        String checksum,
        MediaStatus status,
        Instant createdAt
) {
}
