package com.shivagri.notification.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * OTP delivery configuration. The {@code channel} property is the single switch that
 * decides whether OTPs go out over WhatsApp or SMS (MSG91) — flip it without touching code.
 */
@Getter
@Setter
@ConfigurationProperties(prefix = "notification.otp")
public class OtpProperties {

    /** Delivery channel for OTPs: "whatsapp" or "sms". */
    private String channel = "whatsapp";

    private Whatsapp whatsapp = new Whatsapp();

    /** WhatsApp template settings used when channel = whatsapp. */
    @Getter
    @Setter
    public static class Whatsapp {
        private String templateName;
        private String languageCode = "en";
        /** Whether the approved template has a URL "copy code" button. */
        private boolean hasButton = true;
    }
}
