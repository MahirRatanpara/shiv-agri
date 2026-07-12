package com.shivagri.media.controller;

import com.shivagri.media.controller.dto.*;
import com.shivagri.media.model.MediaDocument;
import com.shivagri.media.service.MediaService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.Duration;

@Slf4j
@RestController
@RequestMapping("/api/v1/media")
@RequiredArgsConstructor
public class MediaController {

    private final MediaService mediaService;

    @PostMapping
    public ResponseEntity<InitiateUploadResponse> initiateUpload(
            @Valid @RequestBody InitiateUploadRequest request) {
        InitiateUploadResponse response = mediaService.initiateUpload(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping(value = "/{id}/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<UploadResponse> completeUpload(
            @PathVariable String id,
            @RequestParam("file") MultipartFile file) {
        UploadResponse response = mediaService.completeUpload(id, file);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}/content")
    public ResponseEntity<Resource> getContent(@PathVariable String id) {
        MediaDocument doc = mediaService.getMediaDocument(id);
        Resource resource = mediaService.getContent(id);

        String etag = doc.getChecksumSha256() != null
                ? "\"" + doc.getChecksumSha256() + "\""
                : null;

        ResponseEntity.BodyBuilder builder = ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(doc.getMimeType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + doc.getOriginalName() + "\"")
                .cacheControl(CacheControl.maxAge(Duration.ofDays(7)).cachePublic());

        if (doc.getSizeBytes() > 0) {
            builder.contentLength(doc.getSizeBytes());
        }
        if (etag != null) {
            builder.eTag(etag);
        }

        return builder.body(resource);
    }

    @GetMapping("/{id}")
    public ResponseEntity<MediaMetadataResponse> getMetadata(@PathVariable String id) {
        MediaMetadataResponse response = mediaService.getMetadata(id);
        return ResponseEntity.ok(response);
    }

    @PatchMapping("/{id}/status")
    public ResponseEntity<MediaMetadataResponse> updateStatus(
            @PathVariable String id,
            @Valid @RequestBody StatusUpdateRequest request) {
        MediaMetadataResponse response = mediaService.updateStatus(id, request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/batch-resolve")
    public ResponseEntity<BatchResolveResponse> batchResolve(
            @Valid @RequestBody BatchResolveRequest request) {
        BatchResolveResponse response = mediaService.batchResolve(request.ids());
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        mediaService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
