package com.shivagri.media.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "media")
@CompoundIndex(name = "status_created", def = "{'status': 1, 'createdAt': -1}")
public class MediaDocument {

    @Id
    private String id;

    private String storageKey;

    private String originalName;

    private String mimeType;

    private long sizeBytes;

    private String checksumSha256;

    private String altText;

    @Builder.Default
    private List<String> tags = new ArrayList<>();

    private String storageBackend;

    @Indexed
    private MediaStatus status;

    @Builder.Default
    private List<StatusChange> statusHistory = new ArrayList<>();

    private String contentUrl;

    private String uploadedBy;

    @CreatedDate
    private Instant createdAt;

    @LastModifiedDate
    private Instant updatedAt;

    private Instant deletedAt;

    public void transitionStatus(MediaStatus newStatus) {
        this.status = newStatus;
        this.statusHistory.add(new StatusChange(newStatus, Instant.now()));
        if (newStatus == MediaStatus.DELETED) {
            this.deletedAt = Instant.now();
        }
    }
}
