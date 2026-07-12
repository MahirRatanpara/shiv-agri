package com.shivagri.media.service;

import com.shivagri.media.config.StorageProperties;
import com.shivagri.media.exception.FileValidationException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class FileValidationService {

    private final StorageProperties storageProperties;

    private static final Map<String, byte[]> MAGIC_BYTES = Map.of(
            "image/jpeg", new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF},
            "image/png", new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47},
            "image/gif", new byte[]{0x47, 0x49, 0x46, 0x38}
    );

    // WebP: RIFF....WEBP (bytes 0-3 = RIFF, bytes 8-11 = WEBP)
    private static final byte[] RIFF_HEADER = new byte[]{0x52, 0x49, 0x46, 0x46};
    private static final byte[] WEBP_MARKER = new byte[]{0x57, 0x45, 0x42, 0x50};

    public void validateMetadata(String filename, String mimeType, long sizeBytes) {
        if (filename == null || !filename.contains(".")) {
            throw new FileValidationException("File must have an extension");
        }
        String ext = filename.substring(filename.lastIndexOf('.') + 1).toLowerCase();
        if (!storageProperties.getAllowedExtensions().contains(ext)) {
            throw new FileValidationException("File extension '%s' is not allowed".formatted(ext));
        }
        if (mimeType == null || !storageProperties.getAllowedMimeTypes().contains(mimeType)) {
            throw new FileValidationException("MIME type '%s' is not allowed".formatted(mimeType));
        }
        if (sizeBytes > storageProperties.getMaxFileSizeBytes()) {
            throw new FileValidationException(
                    "File size %d bytes exceeds maximum allowed %d bytes"
                            .formatted(sizeBytes, storageProperties.getMaxFileSizeBytes()));
        }
        log.info("Metadata validation passed: name={}, type={}, size={}", filename, mimeType, sizeBytes);
    }

    public void validate(MultipartFile file) {
        validateNotEmpty(file);
        validateSize(file);
        validateExtension(file);
        validateMimeType(file);
        validateMagicBytes(file);
        log.info("File validation passed: name={}, type={}, size={}",
                file.getOriginalFilename(), file.getContentType(), file.getSize());
    }

    private void validateNotEmpty(MultipartFile file) {
        if (file.isEmpty()) {
            throw new FileValidationException("File is empty");
        }
    }

    private void validateSize(MultipartFile file) {
        if (file.getSize() > storageProperties.getMaxFileSizeBytes()) {
            throw new FileValidationException(
                    "File size %d bytes exceeds maximum allowed %d bytes"
                            .formatted(file.getSize(), storageProperties.getMaxFileSizeBytes()));
        }
    }

    private void validateExtension(MultipartFile file) {
        String filename = file.getOriginalFilename();
        if (filename == null || !filename.contains(".")) {
            throw new FileValidationException("File must have an extension");
        }
        String ext = filename.substring(filename.lastIndexOf('.') + 1).toLowerCase();
        if (!storageProperties.getAllowedExtensions().contains(ext)) {
            throw new FileValidationException("File extension '%s' is not allowed".formatted(ext));
        }
    }

    private void validateMimeType(MultipartFile file) {
        String contentType = file.getContentType();
        if (contentType == null || !storageProperties.getAllowedMimeTypes().contains(contentType)) {
            throw new FileValidationException("MIME type '%s' is not allowed".formatted(contentType));
        }
    }

    private void validateMagicBytes(MultipartFile file) {
        try (InputStream is = file.getInputStream()) {
            byte[] header = is.readNBytes(12);

            String contentType = file.getContentType();
            if (contentType == null) {
                throw new FileValidationException("Content type is missing");
            }

            if ("image/webp".equals(contentType)) {
                if (header.length < 12
                        || !arrayStartsWith(header, RIFF_HEADER)
                        || !arrayContainsAt(header, 8, WEBP_MARKER)) {
                    throw new FileValidationException("File content does not match WebP format");
                }
                return;
            }

            byte[] expected = MAGIC_BYTES.get(contentType);
            if (expected != null && !arrayStartsWith(header, expected)) {
                throw new FileValidationException(
                        "File content does not match declared type '%s'".formatted(contentType));
            }
        } catch (IOException e) {
            throw new FileValidationException("Failed to read file for validation", e);
        }
    }

    private static boolean arrayStartsWith(byte[] data, byte[] prefix) {
        if (data.length < prefix.length) return false;
        return Arrays.equals(data, 0, prefix.length, prefix, 0, prefix.length);
    }

    private static boolean arrayContainsAt(byte[] data, int offset, byte[] expected) {
        if (data.length < offset + expected.length) return false;
        return Arrays.equals(data, offset, offset + expected.length, expected, 0, expected.length);
    }
}
