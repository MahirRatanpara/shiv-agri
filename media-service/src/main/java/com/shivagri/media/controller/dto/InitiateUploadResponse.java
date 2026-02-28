package com.shivagri.media.controller.dto;

import com.shivagri.media.model.MediaStatus;

import java.time.Instant;

public record InitiateUploadResponse(
        String id,
        String filename,
        String mimeType,
        long sizeBytes,
        String uploadUrl,
        MediaStatus status,
        Instant createdAt
) {
}
