package com.shivagri.notification.controller.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record WhatsAppMediaRequest(
        @NotBlank(message = "to is required")
        String to,

        @NotBlank(message = "mediaUrl is required (publicly accessible HTTPS URL)")
        @Pattern(regexp = "^https?://.+", message = "mediaUrl must be a valid http(s) URL")
        String mediaUrl,

        @NotBlank(message = "mediaType is required (image, video, audio, or document)")
        @Pattern(regexp = "^(image|video|audio|document)$",
                message = "mediaType must be one of: image, video, audio, document")
        String mediaType,

        String caption,

        String filename
) {
}
