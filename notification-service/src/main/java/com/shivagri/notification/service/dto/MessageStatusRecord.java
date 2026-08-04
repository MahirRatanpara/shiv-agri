package com.shivagri.notification.service.dto;

import java.time.Instant;

/**
 * One delivery-status transition for a single outbound WhatsApp message.
 *
 * <p>Meta reports these out of band via webhook — there is no API to query a wamid
 * directly — so this is the only record of what actually happened to a message
 * after the send call returned.
 */
public record MessageStatusRecord(
        String wamid,
        String status,
        String recipient,
        String conversationCategory,
        Integer errorCode,
        String errorTitle,
        String errorDetails,
        String errorHint,
        Instant statusTimestamp,
        Instant receivedAt
) {
    public boolean isFailure() {
        return "failed".equalsIgnoreCase(status);
    }
}
