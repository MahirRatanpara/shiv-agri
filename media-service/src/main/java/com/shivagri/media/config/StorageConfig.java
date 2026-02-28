package com.shivagri.media.config;

import com.shivagri.media.storage.StorageService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

@Slf4j
@Configuration
public class StorageConfig {

    @Bean
    CommandLineRunner storageStartupValidation(StorageService storageService, StorageProperties properties) {
        return args -> {
            log.info("Storage backend: {}", properties.getActiveBackend());
            log.info("Max file size: {} bytes", properties.getMaxFileSizeBytes());
            log.info("Allowed MIME types: {}", properties.getAllowedMimeTypes());

            String canaryKey = ".canary-test";
            byte[] canaryData = "storage-health-check".getBytes(StandardCharsets.UTF_8);

            try {
                storageService.store(new ByteArrayInputStream(canaryData), canaryKey, canaryData.length);
                boolean exists = storageService.exists(canaryKey);
                if (!exists) {
                    throw new IllegalStateException("Canary file not found after write");
                }
                storageService.delete(canaryKey);
                log.info("Storage canary write/read/delete — OK");
            } catch (Exception e) {
                log.error("Storage startup validation FAILED: {}", e.getMessage(), e);
                throw new IllegalStateException("Storage backend is not healthy", e);
            }
        };
    }
}
