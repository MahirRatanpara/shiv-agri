package com.shivagri.media.storage;

import java.time.Instant;

public record StorageResult(String key, long sizeBytes, String checksum, Instant storedAt) {
}
