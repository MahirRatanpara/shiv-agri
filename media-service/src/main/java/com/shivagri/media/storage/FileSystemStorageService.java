package com.shivagri.media.storage;

import com.shivagri.media.config.StorageProperties;
import com.shivagri.media.exception.StorageException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.UUID;

@Slf4j
@Service
public class FileSystemStorageService implements StorageService {

    private final Path rootDir;

    public FileSystemStorageService(StorageProperties properties) {
        this.rootDir = Paths.get(properties.getFilesystem().getRootDir()).toAbsolutePath().normalize();
        try {
            Files.createDirectories(this.rootDir);
            log.info("Filesystem storage root: {}", this.rootDir);
        } catch (IOException e) {
            throw new StorageException("Could not create storage directory: " + this.rootDir, e);
        }
    }

    @Override
    public StorageResult store(InputStream inputStream, String key, long contentLength) {
        Path targetPath = resolveAndValidate(key);

        try {
            Files.createDirectories(targetPath.getParent());

            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long bytesWritten;

            try (DigestInputStream dis = new DigestInputStream(inputStream, digest)) {
                bytesWritten = Files.copy(dis, targetPath, StandardCopyOption.REPLACE_EXISTING);
            }

            String checksum = HexFormat.of().formatHex(digest.digest());

            log.info("Stored file: key={}, size={}, checksum={}", key, bytesWritten, checksum);
            return new StorageResult(key, bytesWritten, checksum, Instant.now());

        } catch (IOException | NoSuchAlgorithmException e) {
            log.error("Failed to store file: key={}", key, e);
            throw new StorageException("Failed to store file: " + key, e);
        }
    }

    @Override
    public InputStream retrieve(String key) {
        Path filePath = resolveAndValidate(key);

        if (!Files.exists(filePath)) {
            throw new StorageException("File not found: " + key);
        }

        try {
            log.debug("Retrieving file: key={}", key);
            return Files.newInputStream(filePath);
        } catch (IOException e) {
            throw new StorageException("Failed to retrieve file: " + key, e);
        }
    }

    @Override
    public void delete(String key) {
        Path filePath = resolveAndValidate(key);

        try {
            if (Files.deleteIfExists(filePath)) {
                log.info("Deleted file: key={}", key);
            } else {
                log.warn("File not found for deletion: key={}", key);
            }
        } catch (IOException e) {
            throw new StorageException("Failed to delete file: " + key, e);
        }
    }

    @Override
    public boolean exists(String key) {
        Path filePath = resolveAndValidate(key);
        return Files.exists(filePath);
    }

    @Override
    public String generateUploadUrl(String mediaId, String key) {
        return "/api/v1/media/" + mediaId + "/upload";
    }

    @Override
    public String generateDownloadUrl(String mediaId, String key) {
        return "/api/v1/media/" + mediaId + "/content";
    }

    public static String generateStorageKey(String originalFilename) {
        LocalDate now = LocalDate.now();
        String datePath = now.format(DateTimeFormatter.ofPattern("yyyy/MM"));
        String extension = extractExtension(originalFilename);
        String uuid = UUID.randomUUID().toString();
        return datePath + "/" + uuid + (extension.isEmpty() ? "" : "." + extension);
    }

    private Path resolveAndValidate(String key) {
        Path resolved = rootDir.resolve(key).normalize();
        if (!resolved.startsWith(rootDir)) {
            throw new StorageException("Path traversal attempt detected: " + key);
        }
        return resolved;
    }

    private static String extractExtension(String filename) {
        if (filename == null || !filename.contains(".")) {
            return "";
        }
        return filename.substring(filename.lastIndexOf('.') + 1).toLowerCase();
    }
}
