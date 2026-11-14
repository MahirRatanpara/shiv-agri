package com.shivagri.notification.controller.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;

/**
 * @param providerErrorCode Meta / provider error code (e.g. 131026 "receiver incapable"), when the
 *                          failure came from the provider. Callers use it to decide whether a retry
 *                          can ever succeed — retrying a permanently undeliverable number is pointless.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ErrorResponse(String error, String message, Instant timestamp, Integer providerErrorCode) {

    public ErrorResponse(String error, String message, Instant timestamp) {
        this(error, message, timestamp, null);
    }
}
