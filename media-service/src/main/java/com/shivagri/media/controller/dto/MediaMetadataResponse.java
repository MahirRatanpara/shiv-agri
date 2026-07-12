package com.shivagri.media.controller.dto;

import com.shivagri.media.model.MediaStatus;
import com.shivagri.media.model.StatusChange;

import java.time.Instant;
import java.util.List;

public record MediaMetadataResponse(
        String id,
        String originalName,
        String mimeType,
        long sizeBytes,
        String checksumSha256,
        String altText,
        List<String> tags,
        String storageBackend,
        MediaStatus status,
        List<StatusChange> statusHistory,
        String contentUrl,
        String uploadedBy,
        Instant createdAt,
        Instant updatedAt
) {
}
