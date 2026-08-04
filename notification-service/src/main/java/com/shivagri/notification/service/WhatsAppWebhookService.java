package com.shivagri.notification.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shivagri.notification.config.WhatsAppWebhookProperties;
import com.shivagri.notification.service.dto.MessageStatusRecord;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Map;

/**
 * Parses WhatsApp Cloud API webhook callbacks.
 *
 * <p>Meta accepts a send request and returns a wamid long before it knows whether the
 * message can be delivered. Filtering, frequency caps and opt-outs are all decided
 * afterwards and reported only here — so without this listener those outcomes are
 * invisible and the message looks like it vanished.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WhatsAppWebhookService {

    private static final Map<Integer, String> ERROR_HINTS = Map.of(
            131049, "Meta capped this user's marketing messages. Use an AUTHENTICATION template for OTPs.",
            130472, "Recipient is in Meta's marketing delivery experiment — marketing sends are intentionally withheld.",
            131050, "Recipient has opted out of marketing messages from this business.",
            131026, "Undeliverable — not a WhatsApp user, or the number cannot receive template messages.",
            131047, "Outside the 24-hour customer service window — free-form text requires a template instead.",
            132000, "Template parameter count does not match the approved template definition.",
            132001, "Template name or language does not exist / is not approved.",
            132012, "Template parameter format is invalid for the approved definition.",
            131048, "Spam rate limit hit — sending is throttled for this phone number.",
            131056, "Pair rate limit — too many messages to this same recipient too quickly."
    );

    private final WhatsAppWebhookProperties props;
    private final WhatsAppStatusStore statusStore;
    private final ObjectMapper objectMapper;

    @PostConstruct
    void warnIfUnsigned() {
        if (props.getAppSecret() == null || props.getAppSecret().isBlank()) {
            log.warn("WHATSAPP_WEBHOOK_APP_SECRET is not set — webhook payload signatures will NOT be verified. "
                    + "Set it before exposing this endpoint publicly.");
        }
    }

    /** @return true when the handshake token matches and Meta should be given the challenge. */
    public boolean isValidVerification(String mode, String token) {
        String expected = props.getVerifyToken();
        if (expected == null || expected.isBlank()) {
            log.error("Webhook verification attempted but WHATSAPP_WEBHOOK_VERIFY_TOKEN is not configured");
            return false;
        }
        return "subscribe".equals(mode) && expected.equals(token);
    }

    /**
     * Verifies the X-Hub-Signature-256 HMAC over the exact raw body.
     *
     * @return true when the signature matches, or when no app secret is configured
     *         (in which case verification is explicitly disabled and already warned about).
     */
    public boolean isValidSignature(String rawBody, String signatureHeader) {
        String secret = props.getAppSecret();
        if (secret == null || secret.isBlank()) {
            return true;
        }
        if (signatureHeader == null || !signatureHeader.startsWith("sha256=")) {
            log.warn("Webhook POST rejected: missing or malformed X-Hub-Signature-256 header");
            return false;
        }
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] digest = mac.doFinal(rawBody.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                hex.append(Character.forDigit((b >> 4) & 0xF, 16));
                hex.append(Character.forDigit(b & 0xF, 16));
            }
            return constantTimeEquals(hex.toString(), signatureHeader.substring("sha256=".length()));
        } catch (Exception ex) {
            log.error("Failed to compute webhook signature: {}", ex.getMessage(), ex);
            return false;
        }
    }

    /** Walks entry[].changes[].value.statuses[] and records every transition. */
    public void processPayload(String rawBody) {
        try {
            JsonNode root = objectMapper.readTree(rawBody);
            for (JsonNode entry : root.path("entry")) {
                for (JsonNode change : entry.path("changes")) {
                    JsonNode value = change.path("value");
                    handleStatuses(value.path("statuses"));
                    logInboundMessages(value.path("messages"));
                }
            }
        } catch (Exception ex) {
            // Never rethrow: a non-200 makes Meta retry, and a payload we cannot parse
            // will fail identically on every retry.
            log.error("Failed to parse WhatsApp webhook payload: {}", ex.getMessage(), ex);
        }
    }

    private void handleStatuses(JsonNode statuses) {
        if (!statuses.isArray()) return;
        for (JsonNode status : statuses) {
            String wamid = status.path("id").asText(null);
            if (wamid == null) continue;

            JsonNode errors = status.path("errors");
            JsonNode error = errors.isArray() && !errors.isEmpty() ? errors.get(0) : null;
            Integer code = error != null ? error.path("code").asInt() : null;

            MessageStatusRecord record = new MessageStatusRecord(
                    wamid,
                    status.path("status").asText(null),
                    status.path("recipient_id").asText(null),
                    status.path("conversation").path("origin").path("type").asText(null),
                    code,
                    error != null ? error.path("title").asText(null) : null,
                    error != null ? error.path("error_data").path("details").asText(null) : null,
                    code != null ? ERROR_HINTS.get(code) : null,
                    parseEpochSeconds(status.path("timestamp").asText(null)),
                    Instant.now()
            );
            statusStore.record(record);
            logStatus(record);
        }
    }

    private void logStatus(MessageStatusRecord r) {
        if (r.isFailure()) {
            log.error("WhatsApp message FAILED wamid={} to={} code={} title='{}' details='{}'{}",
                    r.wamid(), r.recipient(), r.errorCode(), r.errorTitle(), r.errorDetails(),
                    r.errorHint() != null ? " | " + r.errorHint() : "");
        } else {
            log.info("WhatsApp status wamid={} status={} to={} category={}",
                    r.wamid(), r.status(), r.recipient(), r.conversationCategory());
        }
    }

    private void logInboundMessages(JsonNode messages) {
        if (!messages.isArray()) return;
        for (JsonNode message : messages) {
            // Inbound messages open the 24-hour customer service window, which is why an
            // OTP suddenly lands after the user says "hi". Logged so that correlation is visible.
            log.info("WhatsApp inbound message from={} type={} — 24h service window now open",
                    message.path("from").asText(null), message.path("type").asText(null));
        }
    }

    private Instant parseEpochSeconds(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return Instant.ofEpochSecond(Long.parseLong(raw));
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private boolean constantTimeEquals(String a, String b) {
        if (a.length() != b.length()) return false;
        int diff = 0;
        for (int i = 0; i < a.length(); i++) {
            diff |= a.charAt(i) ^ b.charAt(i);
        }
        return diff == 0;
    }
}
