package com.shivagri.media.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.Map;

@Getter
@Setter
@ConfigurationProperties(prefix = "media.security")
public class SecurityConfig {

    private Map<String, byte[]> magicBytes = Map.of();

    // Magic bytes are validated in FileValidationService with hardcoded values
    // This config is reserved for future extensibility
}
