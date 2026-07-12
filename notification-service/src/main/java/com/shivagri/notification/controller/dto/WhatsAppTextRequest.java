package com.shivagri.notification.controller.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record WhatsAppTextRequest(
        @NotBlank(message = "to is required (recipient phone number, e.g. 919876543210)")
        String to,

        @NotBlank(message = "message is required")
        @Size(max = 4096, message = "message must be 4096 characters or fewer")
        String message,

        Boolean previewUrl
) {
}
