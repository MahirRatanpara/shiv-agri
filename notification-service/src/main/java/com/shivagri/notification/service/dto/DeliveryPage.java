package com.shivagri.notification.service.dto;

import com.shivagri.notification.repository.WhatsAppMessageStatus;

import java.util.List;

/** A page of delivery rows plus the counters the UI needs to render pagination controls. */
public record DeliveryPage(
        List<WhatsAppMessageStatus> messages,
        long total,
        int page,
        int limit,
        int pages
) {
}
