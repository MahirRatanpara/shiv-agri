package com.shivagri.notification.controller.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record AuthTemplateCreateRequest(
        @NotBlank(message = "name is required")
        @Pattern(regexp = "^[a-z0-9_]+$", message = "name must be lowercase letters, digits, and underscores only")
        String name,

        @NotBlank(message = "languageCode is required")
        String languageCode,

        boolean addSecurityRecommendation,

        @Min(value = 1, message = "codeExpirationMinutes must be between 1 and 90")
        @Max(value = 90, message = "codeExpirationMinutes must be between 1 and 90")
        Integer codeExpirationMinutes,

        String buttonText
) {
}
