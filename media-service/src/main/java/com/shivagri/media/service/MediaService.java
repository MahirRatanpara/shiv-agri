package com.shivagri.media.service;

import com.shivagri.media.config.StorageProperties;
import com.shivagri.media.controller.dto.*;
import com.shivagri.media.exception.MediaNotFoundException;
import com.shivagri.media.model.MediaDocument;
import com.shivagri.media.model.MediaStatus;
import com.shivagri.media.repository.MediaRepository;
import com.shivagri.media.storage.FileSystemStorageService;
import com.shivagri.media.storage.StorageResult;
import com.shivagri.media.storage.StorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class MediaService {

    private final MediaRepository mediaRepository;
    private final StorageService storageService;
    private final FileValidationService fileValidationService;
    private final StorageProperties storageProperties;

    private static final Map<MediaStatus, Set<MediaStatus>> ALLOWED_TRANSITIONS = Map.of(
            MediaStatus.UPLOADING, Set.of(MediaStatus.ACTIVE, MediaStatus.FAILED),
            MediaStatus.ACTIVE, Set.of(MediaStatus.DELETED),
            MediaStatus.FAILED, Set.of(MediaStatus.DELETED, MediaStatus.UPLOADING),
            MediaStatus.DELETED, Set.of()
    );

    public InitiateUploadResponse initiateUpload(InitiateUploadRequest request) {
        log.info("Initiate upload: filename={}, type={}, size={}",
                request.filename(), request.mimeType(), request.sizeBytes());

        fileValidationService.validateMetadata(request.filename(), request.mimeType(), request.sizeBytes());

        String storageKey = FileSystemStorageService.generateStorageKey(request.filename());

        MediaDocument doc = MediaDocument.builder()
                .storageKey(storageKey)
                .originalName(request.filename())
                .mimeType(request.mimeType())
                .sizeBytes(request.sizeBytes())
                .altText(request.altText())
                .tags(request.tags() != null ? request.tags() : List.of())
                .storageBackend(storageProperties.getActiveBackend())
                .build();
        doc.transitionStatus(MediaStatus.UPLOADING);

        doc = mediaRepository.save(doc);
        log.info("Created media document: id={}, status=UPLOADING", doc.getId());

        String uploadUrl = storageService.generateUploadUrl(doc.getId(), storageKey);

        return new InitiateUploadResponse(
                doc.getId(),
                doc.getOriginalName(),
                doc.getMimeType(),
                doc.getSizeBytes(),
                uploadUrl,
                doc.getStatus(),
                doc.getCreatedAt()
        );
    }

    public UploadResponse completeUpload(String id, MultipartFile file) {
        log.info("Complete upload: id={}, name={}, size={}", id, file.getOriginalFilename(), file.getSize());

        MediaDocument doc = mediaRepository.findById(id)
                .orElseThrow(() -> new MediaNotFoundException(id));

        if (doc.getStatus() != MediaStatus.UPLOADING) {
            throw new IllegalStateException(
                    "Media %s is in status %s, expected UPLOADING".formatted(id, doc.getStatus()));
        }

        fileValidationService.validate(file);

        try {
            InputStream inputStream = file.getInputStream();
            StorageResult result = storageService.store(inputStream, doc.getStorageKey(), file.getSize());

            doc.setChecksumSha256(result.checksum());
            doc.setSizeBytes(result.sizeBytes());
            String downloadUrl = storageService.generateDownloadUrl(doc.getId(), doc.getStorageKey());
            doc.setContentUrl(downloadUrl);
            doc.transitionStatus(MediaStatus.ACTIVE);

            doc = mediaRepository.save(doc);
            log.info("Upload complete: id={}, key={}, checksum={}", doc.getId(), doc.getStorageKey(), result.checksum());

            return new UploadResponse(
                    doc.getId(),
                    doc.getOriginalName(),
                    doc.getMimeType(),
                    doc.getSizeBytes(),
                    doc.getContentUrl(),
                    doc.getChecksumSha256(),
                    doc.getStatus(),
                    doc.getCreatedAt()
            );

        } catch (Exception e) {
            log.error("Upload failed for id={}: {}", doc.getId(), e.getMessage(), e);
            doc.transitionStatus(MediaStatus.FAILED);
            mediaRepository.save(doc);
            throw new com.shivagri.media.exception.StorageException("Upload failed: " + e.getMessage(), e);
        }
    }

    public MediaMetadataResponse updateStatus(String id, StatusUpdateRequest request) {
        log.info("Update status: id={}, newStatus={}, reason={}", id, request.status(), request.reason());

        MediaDocument doc = mediaRepository.findById(id)
                .orElseThrow(() -> new MediaNotFoundException(id));

        validateStatusTransition(doc.getStatus(), request.status());

        doc.transitionStatus(request.status());
        doc = mediaRepository.save(doc);

        log.info("Status updated: id={}, status={}", doc.getId(), doc.getStatus());
        return toMetadataResponse(doc);
    }

    public MediaMetadataResponse getMetadata(String id) {
        log.debug("Get metadata: id={}", id);
        MediaDocument doc = findActiveMedia(id);
        return toMetadataResponse(doc);
    }

    public MediaDocument getMediaDocument(String id) {
        return findActiveMedia(id);
    }

    public Resource getContent(String id) {
        log.debug("Get content: id={}", id);
        MediaDocument doc = findActiveMedia(id);
        InputStream stream = storageService.retrieve(doc.getStorageKey());
        return new InputStreamResource(stream);
    }

    public void delete(String id) {
        log.info("Delete request: id={}", id);
        MediaDocument doc = findActiveMedia(id);
        doc.transitionStatus(MediaStatus.DELETED);
        mediaRepository.save(doc);
        log.info("Soft deleted: id={}", id);
    }

    public BatchResolveResponse batchResolve(List<String> ids) {
        log.info("Batch resolve: ids={}", ids.size());

        List<MediaDocument> found = mediaRepository.findByIdInAndStatusNot(ids, MediaStatus.DELETED);
        Map<String, MediaDocument> foundMap = found.stream()
                .collect(Collectors.toMap(MediaDocument::getId, Function.identity()));

        List<BatchResolveResponse.MediaItem> media = found.stream()
                .map(doc -> new BatchResolveResponse.MediaItem(
                        doc.getId(),
                        doc.getOriginalName(),
                        doc.getMimeType(),
                        doc.getSizeBytes(),
                        doc.getStatus() == MediaStatus.ACTIVE
                                ? storageService.generateDownloadUrl(doc.getId(), doc.getStorageKey())
                                : null,
                        doc.getStatus()
                ))
                .toList();

        Set<String> foundIds = foundMap.keySet();
        List<String> notFound = ids.stream()
                .filter(id -> !foundIds.contains(id))
                .toList();

        log.info("Batch resolve result: found={}, notFound={}", media.size(), notFound.size());
        return new BatchResolveResponse(media, notFound);
    }

    private void validateStatusTransition(MediaStatus current, MediaStatus target) {
        Set<MediaStatus> allowed = ALLOWED_TRANSITIONS.getOrDefault(current, Set.of());
        if (!allowed.contains(target)) {
            throw new IllegalStateException(
                    "Cannot transition from %s to %s".formatted(current, target));
        }
    }

    private MediaDocument findActiveMedia(String id) {
        return mediaRepository.findByIdAndStatusNot(id, MediaStatus.DELETED)
                .orElseThrow(() -> new MediaNotFoundException(id));
    }

    private MediaMetadataResponse toMetadataResponse(MediaDocument doc) {
        String contentUrl = doc.getStatus() == MediaStatus.ACTIVE
                ? storageService.generateDownloadUrl(doc.getId(), doc.getStorageKey())
                : null;

        return new MediaMetadataResponse(
                doc.getId(),
                doc.getOriginalName(),
                doc.getMimeType(),
                doc.getSizeBytes(),
                doc.getChecksumSha256(),
                doc.getAltText(),
                doc.getTags(),
                doc.getStorageBackend(),
                doc.getStatus(),
                doc.getStatusHistory(),
                contentUrl,
                doc.getUploadedBy(),
                doc.getCreatedAt(),
                doc.getUpdatedAt()
        );
    }
}
