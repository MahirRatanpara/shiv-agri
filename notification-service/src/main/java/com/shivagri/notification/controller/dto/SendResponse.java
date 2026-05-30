package com.shivagri.notification.controller.dto;

import java.time.Instant;

public record SendResponse(
        String requestId,
        String status,
        String channel,
        String providerMessageId,
        String message,
        Instant timestamp
) {
    public static SendResponse accepted(String requestId, String channel) {
        return new SendResponse(requestId, "ACCEPTED", channel, null,
                "Send queued for asynchronous delivery", Instant.now());
    }

    public static SendResponse sent(String requestId, String channel, String providerMessageId) {
        return new SendResponse(requestId, "SENT", channel, providerMessageId,
                "Message delivered to provider", Instant.now());
    }
}
