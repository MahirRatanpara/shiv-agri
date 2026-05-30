package com.shivagri.notification.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@Setter
@ConfigurationProperties(prefix = "notification.email")
public class EmailProperties {
    private String fromAddress;
    private String fromName;
    private String smtpHost;
    private int smtpPort;
    private OAuth oauth = new OAuth();

    @Getter
    @Setter
    public static class OAuth {
        private String clientId;
        private String clientSecret;
        private String refreshToken;
        private String tokenEndpoint;
    }
}
