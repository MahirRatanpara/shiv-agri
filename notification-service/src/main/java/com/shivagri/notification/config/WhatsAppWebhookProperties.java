package com.shivagri.notification.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@Setter
@ConfigurationProperties(prefix = "notification.whatsapp.webhook")
public class WhatsAppWebhookProperties {

    /** Token echoed back to Meta during the one-time GET subscription handshake. */
    private String verifyToken;

    /**
     * Meta app secret, used to verify the X-Hub-Signature-256 HMAC on every POST.
     * When blank, signature checking is skipped and a warning is logged at startup —
     * acceptable for local tunnelling, never for production.
     */
    private String appSecret;
}
