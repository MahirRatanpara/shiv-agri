package com.shivagri.notification.controller.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Channel-agnostic OTP send request. The notification-service decides whether to deliver
 * over WhatsApp or SMS based on the {@code notification.otp.channel} property.
 */
public record OtpRequest(
        @NotBlank(message = "to is required")
        String to,

        @NotBlank(message = "code is required")
        String code
) {
}
