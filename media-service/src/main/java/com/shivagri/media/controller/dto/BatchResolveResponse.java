package com.shivagri.media.controller.dto;

import com.shivagri.media.model.MediaStatus;

import java.util.List;

public record BatchResolveResponse(
        List<MediaItem> media,
        List<String> notFound
) {
    public record MediaItem(
            String id,
            String originalName,
            String mimeType,
            long sizeBytes,
            String contentUrl,
            MediaStatus status
    ) {
    }
}
