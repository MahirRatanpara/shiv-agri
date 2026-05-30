package com.shivagri.notification.controller.dto;

import jakarta.validation.constraints.NotBlank;

import java.util.List;

public record WhatsAppTemplateRequest(
        @NotBlank(message = "to is required")
        String to,

        @NotBlank(message = "templateName is required")
        String templateName,

        String languageCode,

        List<String> bodyParameters,

        String buttonOtpCode
) {
}
