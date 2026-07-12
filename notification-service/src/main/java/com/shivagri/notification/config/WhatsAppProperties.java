package com.shivagri.notification.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@Setter
@ConfigurationProperties(prefix = "notification.whatsapp")
public class WhatsAppProperties {
    private String apiBaseUrl;
    private String apiVersion;
    private String phoneNumberId;
    private String accessToken;
    private String defaultCountryCode;
}
