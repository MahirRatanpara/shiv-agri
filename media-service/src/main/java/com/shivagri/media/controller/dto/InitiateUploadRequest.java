package com.shivagri.media.controller.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

import java.util.List;

public record InitiateUploadRequest(
        @NotBlank String filename,
        @NotBlank String mimeType,
        @Positive long sizeBytes,
        String altText,
        List<String> tags
) {
}
