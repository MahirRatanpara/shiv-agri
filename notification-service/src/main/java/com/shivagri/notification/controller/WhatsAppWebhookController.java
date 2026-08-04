package com.shivagri.notification.controller;

import com.shivagri.notification.repository.WhatsAppMessageStatus;
import com.shivagri.notification.service.WhatsAppStatusStore;
import com.shivagri.notification.service.WhatsAppWebhookService;
import com.shivagri.notification.service.dto.DeliveryPage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Receives delivery-status callbacks from the WhatsApp Cloud API and exposes them
 * for the admin dashboard.
 *
 * <p>The webhook path itself is unauthenticated by API key — Meta cannot send one —
 * and is instead authenticated by the X-Hub-Signature-256 HMAC. See
 * {@code ApiKeyAuthFilter.OPEN_PATHS}. Every other path here stays behind the API key.
 */
@Slf4j
@RestController
@RequestMapping("/api/notifications/whatsapp")
@RequiredArgsConstructor
public class WhatsAppWebhookController {

    public static final String WEBHOOK_PATH = "/api/notifications/whatsapp/webhook";

    private final WhatsAppWebhookService webhookService;
    private final WhatsAppStatusStore statusStore;

    /** One-time handshake: Meta calls this when the callback URL is saved in the App Dashboard. */
    @GetMapping("/webhook")
    public ResponseEntity<String> verify(
            @RequestParam(value = "hub.mode", required = false) String mode,
            @RequestParam(value = "hub.verify_token", required = false) String token,
            @RequestParam(value = "hub.challenge", required = false) String challenge) {

        if (webhookService.isValidVerification(mode, token)) {
            log.info("WhatsApp webhook verification succeeded");
            return ResponseEntity.ok(challenge);
        }
        log.warn("WhatsApp webhook verification FAILED (mode={}, token mismatch)", mode);
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Verification failed");
    }

    /**
     * Status callbacks. Always answers 200 once the signature is valid — a non-200 makes
     * Meta retry the same payload and eventually disable the subscription.
     */
    @PostMapping("/webhook")
    public ResponseEntity<Void> receive(
            @RequestBody(required = false) String rawBody,
            @RequestHeader(value = "X-Hub-Signature-256", required = false) String signature) {

        if (rawBody == null || rawBody.isBlank()) {
            return ResponseEntity.ok().build();
        }
        if (!webhookService.isValidSignature(rawBody, signature)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        webhookService.processPayload(rawBody);
        return ResponseEntity.ok().build();
    }

    /** Aggregate counters for the dashboard header tiles. */
    @GetMapping("/delivery/summary")
    public ResponseEntity<Map<String, Object>> summary() {
        return ResponseEntity.ok(statusStore.summary());
    }

    /** Server-side paginated rows for the dashboard table, most recent activity first. */
    @GetMapping("/delivery/messages")
    public ResponseEntity<DeliveryPage> messages(
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "limit", defaultValue = "25") int limit,
            @RequestParam(value = "status", required = false) String status,
            @RequestParam(value = "search", required = false) String search) {
        return ResponseEntity.ok(statusStore.page(page, limit, status, search));
    }

    /** Explains what happened to a single wamid returned by a send call. */
    @GetMapping("/delivery/messages/{wamid}")
    public ResponseEntity<Map<String, Object>> status(@PathVariable String wamid) {
        WhatsAppMessageStatus found = statusStore.find(wamid);
        if (found == null) {
            return ResponseEntity.ok(Map.of(
                    "wamid", wamid,
                    "found", false,
                    "message", "No status received for this message id. Either the webhook is not "
                            + "subscribed, or the status has not arrived yet."));
        }
        return ResponseEntity.ok(Map.of("wamid", wamid, "found", true, "message", found));
    }
}
