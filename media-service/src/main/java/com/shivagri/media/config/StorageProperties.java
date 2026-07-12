package com.shivagri.media.config;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.util.List;

@Getter
@Setter
@Validated
@ConfigurationProperties(prefix = "media.storage")
public class StorageProperties {

    @NotBlank
    private String activeBackend = "filesystem";

    private Filesystem filesystem = new Filesystem();

    @Positive
    private long maxFileSizeBytes = 25 * 1024 * 1024; // 25MB

    private List<String> allowedMimeTypes = List.of(
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "video/mp4",
            "video/quicktime",
            "video/webm",
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "text/plain",
            "text/markdown"
    );

    private List<String> allowedExtensions = List.of(
            "jpg", "jpeg", "png", "webp", "gif",
            "mp4", "mov", "webm",
            "pdf", "doc", "docx", "txt", "md"
    );

    @Getter
    @Setter
    public static class Filesystem {
        @NotBlank
        private String rootDir = "/var/media/uploads";
    }
}
