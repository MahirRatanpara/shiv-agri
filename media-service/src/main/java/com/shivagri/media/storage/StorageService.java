package com.shivagri.media.storage;

import java.io.InputStream;

public interface StorageService {

    StorageResult store(InputStream inputStream, String key, long contentLength);

    InputStream retrieve(String key);

    void delete(String key);

    boolean exists(String key);

    String generateUploadUrl(String mediaId, String key);

    String generateDownloadUrl(String mediaId, String key);
}
