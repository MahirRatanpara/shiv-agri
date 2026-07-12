package com.shivagri.notification.controller.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public record EmailRequest(
        @NotEmpty(message = "to must contain at least one recipient")
        List<@Email(message = "to entries must be valid email addresses") String> to,

        List<@Email(message = "cc entries must be valid email addresses") String> cc,

        List<@Email(message = "bcc entries must be valid email addresses") String> bcc,

        @NotBlank(message = "subject is required")
        String subject,

        @NotBlank(message = "body is required")
        String body,

        Boolean html
) {
}
