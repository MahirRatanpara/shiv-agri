# MEDIA MANAGEMENT MICROSERVICE
## Architecture & Design Document

**Version:** 1.1  
**Date:** February 2026  
**Author:** Mahir (Senior Backend Engineer)  
**Stack:** Java 17+, Spring Boot 3.x, MongoDB  
**Status:** Draft for Review

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Package Structure](#3-package-structure)
4. [Core Interfaces & Design Patterns](#4-core-interfaces--design-patterns)
5. [API Contract Design](#5-api-contract-design)
6. [MongoDB Schema Design](#6-mongodb-schema-design)
7. [Embedding Media References in Domain Collections](#7-embedding-media-references-in-domain-collections)
8. [Security Considerations](#8-security-considerations)
9. [Performance Considerations](#9-performance-considerations)
10. [Image Serving Strategies](#10-image-serving-strategies)
11. [Configuration Strategy](#11-configuration-strategy)
12. [Migration Strategy: VPS to Cloud](#12-migration-strategy-vps-to-cloud)
13. [Testing Strategy](#13-testing-strategy)
14. [Deployment & Operations](#14-deployment--operations)
15. [Future Enhancements](#15-future-enhancements)

---

## 1. Executive Summary

This document describes the architecture for a dedicated **Media Management Microservice** responsible for image upload, retrieval, and lifecycle management within a web application ecosystem. The service is designed with a **storage-agnostic abstraction layer** that allows the underlying persistence mechanism to be swapped from a local VPS filesystem to any cloud object storage provider (S3, Cloudflare R2, GCS) with **zero breaking changes** to API consumers.

A key design goal is **seamless embedding of media references** into existing MongoDB domain collections (e.g., projects, soil test reports, farm records) so that when a user opens a project page, all associated images are immediately resolvable via embedded links and metadata IDs — with full status tracking of each media asset's lifecycle.

### Design Principles

- **Single Responsibility:** The service owns all media operations and nothing else.
- **Open/Closed Principle:** New storage backends are added by implementing an interface, not by modifying existing code.
- **Stream-First:** All I/O uses streaming to avoid loading entire files into heap memory.
- **Zero Consumer Impact:** Switching storage backends must not change any REST API contract, URL structure, or response shape.
- **Embedded References:** Domain documents embed lightweight media references (IDs + direct URLs) to avoid extra lookups when rendering pages.
- **Cost Efficiency:** VPS filesystem for initial deployment; cloud migration only when traffic or reliability demands justify it.

### Key Assumptions

| Parameter | Value |
|-----------|-------|
| Runtime | Java 17+, Spring Boot 3.2+ |
| Initial Traffic | Moderate (< 500 req/s) |
| Content Type | Mostly public images (JPEG, PNG, WebP, GIF); video support planned |
| Storage Phase 1 | Linux VPS local filesystem |
| Storage Phase 2 | S3-compatible / Cloudflare R2 / GCS |
| Database | MongoDB (metadata collection + embedded references in domain collections) |

---

## 2. High-Level Architecture

The system follows a classic layered architecture with a pluggable storage backend. The key insight is that the REST API layer and the metadata layer remain completely invariant regardless of which storage implementation is active. Domain collections in MongoDB embed lightweight media references that point to the media collection and include pre-computed direct URLs for zero-lookup rendering.

### Component Diagram

```
┌────────────────────────────────────────────────────────────────┐
│  CLIENT (Browser / Mobile App / API Consumer)                  │
└─────────────────────────────┬──────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │   NGINX (Reverse   │ ← Static file serving
                    │   Proxy + Static)  │   + rate limiting
                    └─────────┬─────────┘
                              │
              ┌───────────────┴──────────────┐
              │    MEDIA SERVICE (Spring Boot)│
              │                              │
              │  ┌────────────────────────┐  │
              │  │ MediaController (REST) │  │
              │  └───────────┬────────────┘  │
              │              │               │
              │  ┌───────────┴────────────┐  │
              │  │ MediaService (Business) │  │
              │  └──┬────────────────┬────┘  │
              │     │                │        │
              │  ┌──┴──────────┐  ┌─┴──────┐ │
              │  │StorageService│  │MongoDB │ │
              │  │ (Interface)  │  │        │ │
              │  └──┬──────┬───┘  │ media  │ │
              │     │      │      │ (meta) │ │
              │     │      │      │        │ │
              │     │      │      │projects│ │ ← Embedded media refs
              │     │      │      │reports │ │ ← with direct URLs
              │     │      │      │farms   │ │ ← and status tracking
              │     │      │      └────────┘ │
              └─────┼──────┼─────────────────┘
                    │      │
          ┌─────────┴──┐ ┌─┴────────────┐
          │ FileSystem  │ │Cloud Storage │
          │ StorageImpl │ │ Impl (S3/R2) │
          └──────┬──────┘ └───┬──────────┘
                 │            │
          ┌──────┴──────┐ ┌──┴───────────┐
          │ /var/media   │ │ S3 / R2 /    │
          │ (VPS Disk)   │ │ GCS Bucket   │
          └─────────────┘ └──────────────┘
```

### Component Responsibilities

| Component | Responsibility |
|---|---|
| **NGINX** | Reverse proxy, TLS termination, rate limiting, optional direct static file serving via X-Accel-Redirect |
| **MediaController** | REST endpoint definitions, request validation, multipart handling, response formatting |
| **MediaService** | Business logic: generates storage keys, manages metadata lifecycle, coordinates storage and DB operations, updates embedded references in domain collections |
| **StorageService** | Interface defining storage contract: store, retrieve, delete, generateUrl |
| **FileSystemStorage** | Phase 1 implementation: reads/writes to local VPS disk using java.nio streaming |
| **CloudStorageImpl** | Phase 2 implementation: delegates to S3/R2/GCS SDK using streaming transfers |
| **MediaRepository** | Spring Data MongoDB repository managing the `media` metadata collection |
| **MongoDB** | Stores media metadata collection + domain collections with embedded media references |

---

## 3. Package Structure

The package layout enforces clear separation between API, business logic, storage abstraction, and infrastructure concerns. Note the addition of `embedded` package for the media reference embedding logic.

```
com.app.media/
├── MediaServiceApplication.java
├── config/
│   ├── StorageConfig.java              // Bean wiring based on active profile
│   ├── StorageProperties.java           // @ConfigurationProperties for storage
│   ├── MongoConfig.java                 // MongoDB client, indexes, converters
│   ├── WebConfig.java                   // CORS, multipart config
│   └── SecurityConfig.java              // File validation rules
├── controller/
│   ├── MediaController.java             // REST endpoints
│   └── dto/
│       ├── UploadResponse.java           // Upload result DTO
│       ├── MediaMetadataResponse.java    // Metadata query DTO
│       ├── MediaReference.java           // Embeddable reference DTO
│       └── ErrorResponse.java            // Standardized errors
├── service/
│   ├── MediaService.java                // Business orchestration
│   ├── MediaEmbeddingService.java       // Manages embedded refs in domain docs
│   └── FileValidationService.java       // Magic bytes + extension checks
├── storage/
│   ├── StorageService.java              // INTERFACE (the abstraction)
│   ├── StorageResult.java               // Value object for results
│   ├── filesystem/
│   │   └── FileSystemStorageService.java // VPS implementation
│   └── cloud/
│       ├── S3StorageService.java         // AWS S3 / R2 implementation
│       └── GcsStorageService.java        // GCS implementation
├── model/
│   ├── MediaDocument.java               // MongoDB @Document (media collection)
│   └── embedded/
│       ├── MediaRef.java                 // Embeddable media reference subdocument
│       └── MediaStatus.java             // Enum: UPLOADING, ACTIVE, FAILED, DELETED
├── repository/
│   └── MediaRepository.java             // Spring Data MongoDB
└── exception/
    ├── MediaNotFoundException.java
    ├── StorageException.java
    ├── FileValidationException.java
    └── GlobalExceptionHandler.java       // @ControllerAdvice
```

---

## 4. Core Interfaces & Design Patterns

### 4.1 Strategy Pattern: StorageService Interface

The `StorageService` interface is the central abstraction. All business logic depends only on this interface, never on a concrete implementation. Spring's conditional bean wiring acts as the strategy selector at startup time.

```java
public interface StorageService {

    /**
     * Store a file from an input stream.
     * @param key     unique storage key (e.g., "2026/02/uuid.jpg")
     * @param content input stream of file bytes (caller closes)
     * @param size    content length in bytes
     * @param type    MIME type (e.g., "image/jpeg")
     * @return StorageResult with final storage location details
     */
    StorageResult store(String key, InputStream content,
                        long size, String type);

    /**
     * Retrieve file as a streaming resource.
     * @return Resource suitable for streaming response
     */
    Resource retrieve(String key);

    /**
     * Delete a file from storage.
     */
    void delete(String key);

    /**
     * Generate a URL for direct client access.
     * For filesystem: returns internal path for reverse proxy
     * For cloud: returns presigned/signed URL
     */
    String generateAccessUrl(String key, Duration expiry);

    /**
     * Check if a file exists in storage.
     */
    boolean exists(String key);
}
```

### 4.2 StorageResult Value Object

```java
public record StorageResult(
    String key,
    String bucket,       // null for filesystem
    long sizeBytes,
    String checksum,     // SHA-256 hex
    Instant storedAt
) {}
```

### 4.3 FileSystemStorageService (Phase 1)

The filesystem implementation uses `java.nio` for efficient, streaming file operations. Files are organized in date-partitioned directories to avoid filesystem inode pressure.

```java
@Service
@Profile("filesystem")
public class FileSystemStorageService implements StorageService {

    private final Path rootDir;

    public FileSystemStorageService(StorageProperties props) {
        this.rootDir = Paths.get(props.getFilesystem().getRootDir());
        Files.createDirectories(rootDir);
    }

    @Override
    public StorageResult store(String key, InputStream content,
                               long size, String type) {
        Path target = rootDir.resolve(key).normalize();

        // CRITICAL: Path traversal protection
        if (!target.startsWith(rootDir)) {
            throw new StorageException("Invalid storage path");
        }

        Files.createDirectories(target.getParent());

        // Stream directly to disk using NIO
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (DigestInputStream dis = new DigestInputStream(content, digest);
             OutputStream out = Files.newOutputStream(target,
                 CREATE, TRUNCATE_EXISTING, WRITE)) {
            long written = dis.transferTo(out);
            String checksum = HexFormat.of().formatHex(digest.digest());
            return new StorageResult(key, null, written,
                                    checksum, Instant.now());
        }
    }

    @Override
    public Resource retrieve(String key) {
        Path file = rootDir.resolve(key).normalize();
        if (!file.startsWith(rootDir) || !Files.exists(file)) {
            throw new MediaNotFoundException(key);
        }
        return new FileSystemResource(file);
    }

    @Override
    public String generateAccessUrl(String key, Duration expiry) {
        // For NGINX X-Accel-Redirect: return internal URI
        return "/internal-media/" + key;
    }

    // delete() and exists() follow the same pattern...
}
```

### 4.4 S3StorageService (Phase 2 Example)

```java
@Service
@Profile("s3")
public class S3StorageService implements StorageService {

    private final S3Client s3;
    private final S3Presigner presigner;
    private final String bucket;

    @Override
    public StorageResult store(String key, InputStream content,
                               long size, String type) {
        PutObjectRequest req = PutObjectRequest.builder()
            .bucket(bucket).key(key)
            .contentType(type).contentLength(size)
            .checksumAlgorithm(ChecksumAlgorithm.SHA256)
            .build();

        s3.putObject(req, RequestBody.fromInputStream(content, size));
        // ... return StorageResult
    }

    @Override
    public String generateAccessUrl(String key, Duration expiry) {
        GetObjectRequest req = GetObjectRequest.builder()
            .bucket(bucket).key(key).build();
        return presigner.presignGetObject(
            GetObjectPresignRequest.builder()
                .getObjectRequest(req)
                .signatureDuration(expiry)
                .build()
        ).url().toString();
    }
}
```

### 4.5 Configuration-Driven Bean Wiring

Spring profiles act as the strategy selector. Only one `StorageService` implementation is active at any time, determined entirely by the active profile, with no code changes required.

```java
@Configuration
public class StorageConfig {

    // Beans are auto-registered via @Service + @Profile annotations
    // on each implementation class.

    // Validation at startup:
    @Bean
    public CommandLineRunner validateStorage(StorageService storage) {
        return args -> {
            log.info("Active storage backend: {}",
                     storage.getClass().getSimpleName());
            // Perform health check write/read/delete cycle
        };
    }
}
```

```yaml
# application.yml
spring:
  profiles:
    active: filesystem    # Change to 's3' or 'gcs' to switch
  data:
    mongodb:
      uri: mongodb://localhost:27017/shivagri
      auto-index-creation: true

media:
  storage:
    filesystem:
      root-dir: /var/media/uploads
    s3:
      bucket: my-media-bucket
      region: us-east-1
      endpoint: https://xxx.r2.cloudflarestorage.com  # For R2
    max-file-size: 20MB
    allowed-types: image/jpeg,image/png,image/webp,image/gif
  base-url: https://media.shivagri.com   # Used for generating embedded URLs
```

---

## 5. API Contract Design

All endpoints are versioned under `/api/v1/media`. The contract is storage-agnostic by design — consumers never see storage-specific details.

### 5.1 Upload Image (with optional domain linking)

| Property | Value |
|----------|-------|
| **Endpoint** | `POST /api/v1/media` |
| **Content-Type** | `multipart/form-data` |
| **Form Parts** | `file` (required), `alt` (optional), `tags` (optional), `linkTo` (optional — see below) |
| **Max Size** | 20 MB (configurable) |
| **Success** | `201 Created` |
| **Errors** | `400` (invalid file), `413` (too large), `415` (unsupported type), `500` |

The `linkTo` parameter enables one-step upload-and-embed. If provided, the upload response includes the embedded reference, and the target domain document is atomically updated.

```
linkTo format: { "collection": "projects", "documentId": "665a...", "field": "photos" }
```

**Response Body (201):**

```json
{
  "id": "665b1a2f3c4d5e6f7a8b9c0d",
  "filename": "field-photo.jpg",
  "mimeType": "image/jpeg",
  "sizeBytes": 245782,
  "url": "/api/v1/media/665b1a2f3c4d5e6f7a8b9c0d/content",
  "checksum": "sha256:a3f2b8...",
  "status": "ACTIVE",
  "createdAt": "2026-02-27T10:30:00Z",
  "linkedTo": {
    "collection": "projects",
    "documentId": "665a...",
    "field": "photos"
  }
}
```

### 5.2 Download / Serve Image

| Property | Value |
|----------|-------|
| **Endpoint** | `GET /api/v1/media/{id}/content` |
| **Response** | Binary stream with `Content-Type`, `Content-Length`, `ETag`, `Cache-Control` headers |
| **Caching** | `ETag` + `Cache-Control: public, max-age=31536000, immutable` |
| **Range Requests** | Supported via `ResourceRegion` for partial content / resumable downloads |

**Alternative: Signed URL Endpoint**

```
GET /api/v1/media/{id}/url?expiry=3600

Response (200):
{
  "url": "https://cdn.example.com/...",
  "expiresAt": "2026-02-27T11:30:00Z"
}
```

### 5.3 Get Metadata

| Property | Value |
|----------|-------|
| **Endpoint** | `GET /api/v1/media/{id}` |
| **Response** | `MediaMetadataResponse` (id, filename, mimeType, size, url, tags, status, timestamps) |

### 5.4 Batch Resolve Media References

This endpoint is used by the frontend to resolve multiple media IDs in a single round trip when rendering a project page with many images.

| Property | Value |
|----------|-------|
| **Endpoint** | `POST /api/v1/media/batch-resolve` |
| **Body** | `{ "ids": ["665b...", "665c...", "665d..."] }` |
| **Response** | Array of `{ id, url, mimeType, status, thumbnailUrl }` |
| **Max IDs** | 50 per request |

```json
{
  "media": [
    {
      "id": "665b1a2f3c4d5e6f7a8b9c0d",
      "url": "/api/v1/media/665b1a.../content",
      "mimeType": "image/jpeg",
      "status": "ACTIVE",
      "thumbnailUrl": null
    }
  ],
  "notFound": ["665f..."]
}
```

### 5.5 Delete Image

| Property | Value |
|----------|-------|
| **Endpoint** | `DELETE /api/v1/media/{id}` |
| **Response** | `204 No Content` |
| **Behavior** | Soft-delete metadata, update status to `DELETED` in media collection, update status in all embedded references across domain collections, async physical deletion from storage |

### 5.6 Link / Unlink Media to Domain Document

| Property | Value |
|----------|-------|
| **Link Endpoint** | `POST /api/v1/media/{id}/link` |
| **Link Body** | `{ "collection": "projects", "documentId": "665a...", "field": "photos" }` |
| **Link Response** | `200 OK` with updated media reference |

| Property | Value |
|----------|-------|
| **Unlink Endpoint** | `DELETE /api/v1/media/{id}/link` |
| **Unlink Body** | `{ "collection": "projects", "documentId": "665a...", "field": "photos" }` |
| **Unlink Response** | `204 No Content` |

---

## 6. MongoDB Schema Design

### 6.1 Media Collection (Metadata Only)

The `media` collection stores metadata and storage references. No binary data is ever persisted in MongoDB — only pointers to the storage backend.

```javascript
// Collection: media
{
  _id: ObjectId("665b1a2f3c4d5e6f7a8b9c0d"),
  storageKey: "2026/02/665b1a2f-uuid.jpg",      // Bridge to physical storage
  originalName: "field-photo.jpg",
  mimeType: "image/jpeg",
  sizeBytes: NumberLong(245782),
  checksumSha256: "a3f2b8c9d4e5f6...",
  altText: "Soil sample from north field",
  tags: ["soil", "field-survey", "north-plot"],
  storageBackend: "filesystem",                   // "filesystem" | "s3" | "gcs"
  status: "ACTIVE",                               // UPLOADING | ACTIVE | FAILED | DELETED
  statusHistory: [                                 // Audit trail of status changes
    { status: "UPLOADING", at: ISODate("2026-02-27T10:29:58Z") },
    { status: "ACTIVE",    at: ISODate("2026-02-27T10:30:00Z") }
  ],
  url: "/api/v1/media/665b1a2f3c4d5e6f7a8b9c0d/content",  // Pre-computed direct URL
  linkedTo: [                                      // Tracks which domain docs reference this
    { collection: "projects", documentId: "665a...", field: "photos" },
    { collection: "soilTestReports", documentId: "665e...", field: "attachments" }
  ],
  uploadedBy: "user-123",
  createdAt: ISODate("2026-02-27T10:30:00Z"),
  updatedAt: ISODate("2026-02-27T10:30:00Z"),
  deletedAt: null
}
```

### 6.2 MongoDB Indexes

```javascript
// Unique index on storage key
db.media.createIndex({ storageKey: 1 }, { unique: true });

// Partial index: only active documents (most common query)
db.media.createIndex({ status: 1 }, { partialFilterExpression: { status: "ACTIVE" } });

// Tag-based search
db.media.createIndex({ tags: 1 });

// Reverse lookup: find all media linked to a specific domain document
db.media.createIndex({ "linkedTo.collection": 1, "linkedTo.documentId": 1 });

// Cleanup job: find soft-deleted items older than retention period
db.media.createIndex({ deletedAt: 1 }, { partialFilterExpression: { status: "DELETED" } });

// Sort by creation date
db.media.createIndex({ createdAt: -1 });
```

### 6.3 Java Document Model

```java
@Document(collection = "media")
public class MediaDocument {

    @Id
    private String id;

    @Indexed(unique = true)
    private String storageKey;

    private String originalName;
    private String mimeType;
    private long sizeBytes;
    private String checksumSha256;
    private String altText;
    private List<String> tags = new ArrayList<>();

    private String storageBackend;  // "filesystem", "s3", "gcs"

    @Indexed
    private MediaStatus status;     // UPLOADING, ACTIVE, FAILED, DELETED

    private List<StatusChange> statusHistory = new ArrayList<>();
    private String url;             // Pre-computed access URL
    private List<MediaLink> linkedTo = new ArrayList<>();

    private String uploadedBy;

    @CreatedDate
    private Instant createdAt;
    @LastModifiedDate
    private Instant updatedAt;
    private Instant deletedAt;
}

public enum MediaStatus {
    UPLOADING,  // Upload initiated, file transfer in progress
    ACTIVE,     // Successfully stored and available for serving
    FAILED,     // Upload or processing failed
    DELETED     // Soft-deleted, pending physical cleanup
}

public record StatusChange(MediaStatus status, Instant at) {}

public record MediaLink(
    String collection,    // e.g., "projects", "soilTestReports"
    String documentId,    // ObjectId of the domain document
    String field          // e.g., "photos", "attachments"
) {}
```

---

## 7. Embedding Media References in Domain Collections

This is the core design for linking media to your existing domain documents. The strategy is to embed lightweight `MediaRef` subdocuments directly into domain collections so that when a project page loads, all image URLs and statuses are immediately available — no joins, no extra queries.

### 7.1 The MediaRef Subdocument

```java
/**
 * Lightweight, embeddable media reference.
 * Stored INSIDE domain documents (projects, reports, farms, etc.)
 * Contains enough info to render images WITHOUT querying the media collection.
 */
public record MediaRef(
    String mediaId,       // References media._id
    String url,           // Pre-computed: "/api/v1/media/{id}/content"
    String mimeType,      // "image/jpeg" — for rendering hints
    String altText,       // Accessibility text
    String status,        // Mirrors MediaStatus: ACTIVE, DELETED, etc.
    String label,         // Context-specific: "cover", "before", "after", "sample-1"
    int sortOrder,        // Display ordering within the field
    Instant addedAt       // When this reference was embedded
) {}
```

### 7.2 Embedding in Domain Collections

Here is how the `MediaRef` is embedded in your existing collections. The pattern is the same across all domain entities — an array of `MediaRef` objects under a descriptive field name.

```javascript
// ═══════════════════════════════════════════════════════════
// Collection: projects
// ═══════════════════════════════════════════════════════════
{
  _id: ObjectId("665a..."),
  name: "North Field Soil Analysis Q1 2026",
  farmId: ObjectId("664b..."),
  status: "IN_PROGRESS",

  // ─── EMBEDDED MEDIA REFERENCES ───
  photos: [
    {
      mediaId: "665b1a2f3c4d5e6f7a8b9c0d",
      url: "/api/v1/media/665b1a2f3c4d5e6f7a8b9c0d/content",
      mimeType: "image/jpeg",
      altText: "Soil sample from north field",
      status: "ACTIVE",
      label: "cover",
      sortOrder: 0,
      addedAt: ISODate("2026-02-27T10:30:00Z")
    },
    {
      mediaId: "665c2b3f4d5e6f7a8b9c0d1e",
      url: "/api/v1/media/665c2b3f4d5e6f7a8b9c0d1e/content",
      mimeType: "image/png",
      altText: "pH test result chart",
      status: "ACTIVE",
      label: "test-result",
      sortOrder: 1,
      addedAt: ISODate("2026-02-27T10:35:00Z")
    }
  ],

  // ... rest of project fields
  createdAt: ISODate("2026-02-01T08:00:00Z"),
  updatedAt: ISODate("2026-02-27T10:35:00Z")
}


// ═══════════════════════════════════════════════════════════
// Collection: soilTestReports
// ═══════════════════════════════════════════════════════════
{
  _id: ObjectId("665e..."),
  projectId: ObjectId("665a..."),
  testType: "NPK_ANALYSIS",
  result: { nitrogen: 45, phosphorus: 22, potassium: 38 },

  // ─── EMBEDDED MEDIA REFERENCES ───
  attachments: [
    {
      mediaId: "665d3c4f5e6f7a8b9c0d1e2f",
      url: "/api/v1/media/665d3c4f5e6f7a8b9c0d1e2f/content",
      mimeType: "image/jpeg",
      altText: "Lab report scan page 1",
      status: "ACTIVE",
      label: "lab-report",
      sortOrder: 0,
      addedAt: ISODate("2026-02-27T11:00:00Z")
    }
  ],
  samplePhotos: [
    {
      mediaId: "665e4d5f6e7f8a9b0c1d2e3f",
      url: "/api/v1/media/665e4d5f6e7f8a9b0c1d2e3f/content",
      mimeType: "image/jpeg",
      altText: "Soil sample before testing",
      status: "ACTIVE",
      label: "before",
      sortOrder: 0,
      addedAt: ISODate("2026-02-27T11:05:00Z")
    }
  ]
}


// ═══════════════════════════════════════════════════════════
// Collection: farms
// ═══════════════════════════════════════════════════════════
{
  _id: ObjectId("664b..."),
  name: "Greenfield Organic Farm",
  location: { type: "Point", coordinates: [73.85, 18.52] },

  // ─── EMBEDDED MEDIA REFERENCES ───
  coverImage: {                          // Single embedded ref (not array)
    mediaId: "665f5e6f7a8b9c0d1e2f3a4b",
    url: "/api/v1/media/665f5e6f7a8b9c0d1e2f3a4b/content",
    mimeType: "image/jpeg",
    altText: "Aerial view of Greenfield Farm",
    status: "ACTIVE",
    label: "cover",
    sortOrder: 0,
    addedAt: ISODate("2026-01-15T09:00:00Z")
  },
  galleryImages: [                       // Array of refs
    // ... MediaRef objects
  ]
}
```

### 7.3 MediaEmbeddingService

This service handles the bidirectional linking: when media is uploaded and linked, it updates both the `media` collection and the target domain document atomically.

```java
@Service
public class MediaEmbeddingService {

    private final MongoTemplate mongoTemplate;
    private final MediaRepository mediaRepository;
    private final EmbeddingProperties embeddingProps;

    /**
     * Embed a media reference into a domain document.
     * Called after successful upload when linkTo is provided.
     */
    public void embedReference(String collection, String documentId,
                                String field, MediaDocument media,
                                String label, int sortOrder) {

        // Validate against whitelist
        validateLinkTarget(collection, field);

        MediaRef ref = new MediaRef(
            media.getId(),
            media.getUrl(),
            media.getMimeType(),
            media.getAltText(),
            media.getStatus().name(),
            label,
            sortOrder,
            Instant.now()
        );

        // Push the reference into the domain document's array field
        Query query = Query.query(Criteria.where("_id")
            .is(new ObjectId(documentId)));
        Update update = new Update()
            .push(field, ref)
            .set("updatedAt", Instant.now());

        mongoTemplate.updateFirst(query, update, collection);
    }

    /**
     * Remove a media reference from a domain document.
     */
    public void removeReference(String collection, String documentId,
                                 String field, String mediaId) {

        Query query = Query.query(Criteria.where("_id")
            .is(new ObjectId(documentId)));
        Update update = new Update()
            .pull(field, Query.query(
                Criteria.where("mediaId").is(mediaId)))
            .set("updatedAt", Instant.now());

        mongoTemplate.updateFirst(query, update, collection);
    }

    /**
     * Update the status of a media reference across ALL domain documents
     * that embed it. Called when media status changes (e.g., ACTIVE -> DELETED).
     */
    public void propagateStatusChange(String mediaId,
                                       MediaStatus newStatus) {

        MediaDocument media = mediaRepository.findById(mediaId)
            .orElseThrow();

        for (MediaLink link : media.getLinkedTo()) {
            Query query = Query.query(Criteria.where("_id")
                .is(new ObjectId(link.documentId()))
                .and(link.field() + ".mediaId").is(mediaId));

            Update update = new Update()
                .set(link.field() + ".$.status", newStatus.name())
                .set("updatedAt", Instant.now());

            mongoTemplate.updateFirst(query, update,
                link.collection());
        }
    }

    /**
     * Batch-update embedded URLs when migrating storage backends.
     * Called during migration to update pre-computed URLs.
     */
    public void updateEmbeddedUrl(String mediaId, String newUrl) {
        MediaDocument media = mediaRepository.findById(mediaId)
            .orElseThrow();

        for (MediaLink link : media.getLinkedTo()) {
            Query query = Query.query(Criteria.where("_id")
                .is(new ObjectId(link.documentId()))
                .and(link.field() + ".mediaId").is(mediaId));

            Update update = new Update()
                .set(link.field() + ".$.url", newUrl);

            mongoTemplate.updateFirst(query, update,
                link.collection());
        }
    }

    /**
     * Validate that the target collection + field is whitelisted.
     */
    private void validateLinkTarget(String collection, String field) {
        List<String> allowedFields = embeddingProps
            .getAllowedTargets().get(collection);
        if (allowedFields == null || !allowedFields.contains(field)) {
            throw new IllegalArgumentException(
                "Media embedding not allowed for " +
                collection + "." + field);
        }
    }
}
```

### 7.4 Frontend Integration Pattern

When a project page loads, all image data is already embedded — no second query to the media service needed for rendering.

```javascript
// Frontend: rendering a project page
async function loadProjectPage(projectId) {
    const project = await fetch(`/api/v1/projects/${projectId}`);

    // Photos are already embedded with direct URLs and status
    const activePhotos = project.photos
        .filter(ref => ref.status === "ACTIVE")
        .sort((a, b) => a.sortOrder - b.sortOrder);

    // Render immediately — no media service call needed
    activePhotos.forEach(photo => {
        renderImage({
            src: photo.url,           // "/api/v1/media/{id}/content"
            alt: photo.altText,
            type: photo.mimeType,
            label: photo.label
        });
    });

    // Cover image for farms (single ref, not array)
    if (project.coverImage?.status === "ACTIVE") {
        setCoverImage(project.coverImage.url);
    }
}

// Fallback: if you need full metadata (rare), use batch-resolve
async function resolveFullMetadata(mediaIds) {
    return fetch("/api/v1/media/batch-resolve", {
        method: "POST",
        body: JSON.stringify({ ids: mediaIds })
    });
}
```

### 7.5 Status Tracking Flow

The status field in embedded references stays in sync with the media collection through the `MediaEmbeddingService`. Here is the complete lifecycle:

```
┌─────────────┐    Upload starts     ┌─────────────┐
│  UPLOADING  │ ──────────────────── │ media doc    │
│             │    (status set in    │ created with │
│             │     media collection)│ UPLOADING    │
└──────┬──────┘                      └──────────────┘
       │
       │  File stored successfully
       │
┌──────▼──────┐    Embed reference    ┌─────────────┐
│   ACTIVE    │ ───────────────────── │ Domain doc   │
│             │    (status: ACTIVE    │ updated with │
│             │     in both places)   │ MediaRef     │
└──────┬──────┘                      └──────────────┘
       │
       │  DELETE /api/v1/media/{id}
       │
┌──────▼──────┐    Propagate status   ┌─────────────┐
│   DELETED   │ ───────────────────── │ All embedded │
│             │    (status: DELETED   │ refs updated │
│             │     everywhere)       │ to DELETED   │
└──────┬──────┘                      └──────────────┘
       │
       │  Async cleanup job (after retention period)
       │
┌──────▼──────┐
│  PURGED     │  Physical file deleted from storage
│  (removed)  │  Media document removed from collection
└─────────────┘
```

### 7.6 Allowed Collections Whitelist

To prevent arbitrary collection manipulation via the API, only whitelisted collections can be targets for media embedding.

```yaml
# application.yml
media:
  embedding:
    allowed-targets:
      projects: [photos, documents]
      soilTestReports: [attachments, samplePhotos]
      farms: [coverImage, galleryImages]
      waterTestReports: [attachments, samplePhotos]
      fertilizerTests: [attachments]
```

```java
@ConfigurationProperties(prefix = "media.embedding")
public class EmbeddingProperties {

    /**
     * Whitelisted collection-field pairs that can have media embedded.
     * Requests targeting non-whitelisted collections are rejected.
     */
    private Map<String, List<String>> allowedTargets = new HashMap<>();

    // getters, setters
}
```

---

## 8. Security Considerations

### 8.1 File Validation (Defense in Depth)

File validation must happen at multiple layers. Never trust the client-provided `Content-Type` or filename alone.

| Layer | Check | Implementation |
|-------|-------|----------------|
| 1. Extension | Whitelist check | Only `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif` permitted |
| 2. MIME Type | Content-Type header | Must match allowed MIME types from config |
| 3. Magic Bytes | Binary inspection | Read first 16 bytes; verify magic number matches claimed type (e.g., `FFD8FF` for JPEG, `89504E47` for PNG) |
| 4. Size Limit | Byte counting | Enforce max size during streaming (abort early, don't buffer) |
| 5. Filename | Sanitization | Strip path separators, null bytes, Unicode tricks; rename to UUID internally |

### 8.2 Path Traversal Protection

```java
// ALWAYS resolve and check against root before any I/O
Path resolved = rootDir.resolve(key).normalize();
if (!resolved.startsWith(rootDir)) {
    throw new StorageException(
        "Path traversal attempt: " + key);
}
```

### 8.3 Embedding Security

- The `linkTo` target is validated against the allowed collections whitelist before any update.
- The `mediaId` inside embedded `MediaRef` is the MongoDB ObjectId string — never a storage key or filesystem path.
- Embedded `url` fields contain only the API path (e.g., `/api/v1/media/{id}/content`), never the internal storage path.
- Domain documents cannot be modified by the media service beyond the whitelisted array fields — no arbitrary field writes.

### 8.4 Additional Security Measures

- Storage keys are UUID-based, never client-supplied filenames. Original filenames are stored as metadata only.
- All uploaded files are stored without execute permissions (`rw-r--r--` via POSIX file attribute).
- Rate limiting at NGINX layer: limit upload endpoints to 10 req/min per IP for unauthenticated users.
- NGINX should strip `X-Accel-Redirect` from incoming requests to prevent clients from bypassing access controls.
- Anti-virus scanning via ClamAV integration (optional for Phase 1, recommended before public use at scale).
- CORS is configured to allow only specific origins, not wildcard.

---

## 9. Performance Considerations

### 9.1 Streaming-First I/O

The most critical performance decision: **never buffer entire files in heap memory.** Every path from upload ingestion to storage write, and from storage read to HTTP response, must use streaming.

```java
// Upload: stream from multipart directly to storage
@PostMapping(consumes = MULTIPART_FORM_DATA_VALUE)
public ResponseEntity<UploadResponse> upload(
        @RequestPart MultipartFile file) {
    // MultipartFile.getInputStream() streams from temp file
    // NOT from heap memory
    return mediaService.store(file.getInputStream(),
        file.getSize(), file.getContentType(),
        file.getOriginalFilename());
}

// Download: stream from storage directly to response
@GetMapping("/{id}/content")
public ResponseEntity<Resource> download(@PathVariable String id) {
    MediaDocument meta = mediaService.getMetadata(id);
    Resource resource = storageService.retrieve(meta.getStorageKey());
    return ResponseEntity.ok()
        .contentType(MediaType.parseMediaType(meta.getMimeType()))
        .contentLength(meta.getSizeBytes())
        .header(HttpHeaders.ETAG, '"' + meta.getChecksumSha256() + '"')
        .header(HttpHeaders.CACHE_CONTROL,
                "public, max-age=31536000, immutable")
        .body(resource);
}
```

### 9.2 Multipart Configuration

```yaml
spring:
  servlet:
    multipart:
      max-file-size: 20MB
      max-request-size: 25MB
      file-size-threshold: 1MB    # Files > 1MB stream to temp disk
      resolve-lazily: true         # Don't parse until accessed
```

### 9.3 Caching Strategy

| Mechanism | Details |
|-----------|---------|
| **ETag** | SHA-256 checksum as ETag value. Spring's `ShallowEtagHeaderFilter` or manual header setting. |
| **Cache-Control** | `public, max-age=31536000, immutable` for content-addressed URLs. Since keys are UUID-based, content at a URL never changes. |
| **Conditional GET** | Support `If-None-Match` header; return `304 Not Modified` when ETag matches. |
| **CDN (Future)** | Place Cloudflare or similar CDN in front. The long `Cache-Control` headers mean CDN hit rates will be very high. |

### 9.4 MongoDB Performance for Embedded References

- Embedded `MediaRef` arrays are loaded as part of the parent document — no `$lookup` needed for page rendering.
- For projects with many images (50+), consider capping the embedded array and paginating via the media service.
- The `batch-resolve` endpoint uses `$in` queries which are efficient when backed by the `_id` index.
- Status propagation updates use positional `$` operator for targeted array element updates — not full document rewrites.

### 9.5 Connection & Thread Pool Tuning

- Use Spring Boot's virtual threads (Java 21+) or configure Tomcat async support for long uploads.
- MongoDB connection pool: default MongoClient pool (100 connections) is sufficient for moderate traffic.
- Set `server.tomcat.max-swallow-size=-1` to properly handle rejected large uploads.

---

## 10. Image Serving Strategies

Choosing the right serving strategy has a major impact on performance, cost, and architecture complexity. The service supports three strategies, selectable by configuration.

| Strategy | How It Works | Pros | Cons |
|----------|-------------|------|------|
| **Direct Streaming** | Spring reads file, streams bytes through HTTP response | Simple; works everywhere; full access control per request | Every byte passes through JVM; consumes threads |
| **NGINX X-Accel** | Spring returns `X-Accel-Redirect` header; NGINX serves the file directly from disk | Extremely efficient; zero JVM I/O for serving; NGINX handles `sendfile()` syscall | Only works for local filesystem; requires NGINX configuration |
| **Signed URLs** | Spring generates presigned URL; client fetches directly from storage | Zero bandwidth through service; infinite horizontal scale; native CDN integration | Short-lived URLs need refresh; not suitable for all use cases |

### Recommended Approach by Phase

**Phase 1 (VPS):** Use NGINX `X-Accel-Redirect` as the primary serving path. Spring handles authentication/authorization, then delegates actual byte transfer to NGINX. This gives near-static-file performance while maintaining access control.

```nginx
# NGINX config for X-Accel-Redirect
location /internal-media/ {
    internal;                         # Only accessible via X-Accel
    alias /var/media/uploads/;
    add_header Cache-Control "public, max-age=31536000, immutable";
}
```

```java
// Spring controller for NGINX-accelerated serving
@GetMapping("/{id}/content")
public ResponseEntity<Void> serve(@PathVariable String id) {
    MediaDocument meta = mediaService.getMetadata(id);
    String internalUrl = storageService
        .generateAccessUrl(meta.getStorageKey(), Duration.ZERO);
    return ResponseEntity.ok()
        .header("X-Accel-Redirect", internalUrl)
        .header(HttpHeaders.CONTENT_TYPE, meta.getMimeType())
        .header(HttpHeaders.ETAG, meta.getChecksumSha256())
        .build();
}
```

**Phase 2 (Cloud):** Switch to presigned URLs for public content. The `/url` endpoint returns a time-limited direct link to the cloud object, completely offloading bandwidth from the service. Embedded `url` fields in domain documents can optionally be updated to point to CDN URLs.

---

## 11. Configuration Strategy

### 11.1 Spring Profiles

The active Spring profile determines which `StorageService` bean is instantiated. This is the simplest and most battle-tested approach for mutually exclusive implementations.

| Profile | Active Bean | Usage |
|---------|-------------|-------|
| `filesystem` | `FileSystemStorageService` | VPS deployment (Phase 1) |
| `s3` | `S3StorageService` | AWS S3 or Cloudflare R2 |
| `gcs` | `GcsStorageService` | Google Cloud Storage |

### 11.2 Environment-Based Activation

```bash
# Via environment variable (production)
SPRING_PROFILES_ACTIVE=s3 java -jar media-service.jar

# Via Docker Compose
services:
  media-service:
    environment:
      - SPRING_PROFILES_ACTIVE=filesystem
      - MEDIA_STORAGE_FILESYSTEM_ROOT_DIR=/data/media
      - SPRING_DATA_MONGODB_URI=mongodb://mongo:27017/shivagri

# Via Kubernetes ConfigMap
env:
  - name: SPRING_PROFILES_ACTIVE
    valueFrom:
      configMapKeyRef:
        name: media-config
        key: storage-profile
```

### 11.3 @ConfigurationProperties

```java
@ConfigurationProperties(prefix = "media.storage")
@Validated
public class StorageProperties {

    @NotNull
    private List<String> allowedTypes;

    @NotNull
    private DataSize maxFileSize = DataSize.ofMegabytes(20);

    private String baseUrl;    // For computing embedded URLs

    private Filesystem filesystem = new Filesystem();
    private S3 s3 = new S3();

    public static class Filesystem {
        @NotBlank
        private String rootDir = "/var/media/uploads";
    }

    public static class S3 {
        private String bucket;
        private String region;
        private String endpoint; // For R2 compatibility
    }
}
```

---

## 12. Migration Strategy: VPS to Cloud

The migration must be seamless, reversible, and have zero downtime. Because the `storageBackend` field in the media collection records where each file lives, both backends can coexist during the transition. Embedded references in domain collections are updated in a final sweep.

### 12.1 Migration Phases

| Phase | Action | Read Path | Write Path |
|-------|--------|-----------|------------|
| **0. Pre** | All traffic on filesystem | Filesystem only | Filesystem only |
| **1. Dual** | Deploy `DualWriteStorageService`: writes to both backends | Filesystem (primary) | Both (filesystem + cloud) |
| **2. Backfill** | Batch job copies all existing files to cloud; update `storageBackend` | Check `storageBackend` to route reads | Both |
| **3. URL Update** | Batch job updates embedded `url` fields in all domain collections if URL format changes | Cloud (primary) | Cloud only |
| **4. Switch** | Change profile to cloud; new writes go only to cloud | Cloud (primary), filesystem (fallback) | Cloud only |
| **5. Cleanup** | Verify all reads from cloud succeed; delete local copies | Cloud only | Cloud only |

### 12.2 DualWriteStorageService

A temporary decorator that wraps both implementations during the transition period.

```java
@Service
@Profile("migration")
public class DualWriteStorageService implements StorageService {

    private final FileSystemStorageService filesystem;
    private final S3StorageService cloud;

    @Override
    public StorageResult store(String key, InputStream content,
                               long size, String type) {
        // Buffer to temp file to allow writing to both backends
        Path temp = Files.createTempFile("migration-", ".tmp");
        try {
            Files.copy(content, temp, REPLACE_EXISTING);
            filesystem.store(key,
                Files.newInputStream(temp), size, type);
            return cloud.store(key,
                Files.newInputStream(temp), size, type);
        } finally {
            Files.deleteIfExists(temp);
        }
    }

    @Override
    public Resource retrieve(String key) {
        // Primary: filesystem; fallback: cloud
        try {
            return filesystem.retrieve(key);
        } catch (MediaNotFoundException e) {
            return cloud.retrieve(key);
        }
    }
}
```

### 12.3 Backfill Batch Job

```java
@Component
public class StorageMigrationJob {

    private final MediaRepository repo;
    private final FileSystemStorageService filesystem;
    private final S3StorageService cloud;
    private final MediaEmbeddingService embeddingService;

    @Scheduled(cron = "0 0 2 * * *")  // 2 AM daily
    public void migrateFilesystemToCloud() {
        Pageable page = PageRequest.of(0, 100);
        Slice<MediaDocument> batch;
        do {
            batch = repo.findByStorageBackend("filesystem", page);
            batch.forEach(this::migrateOne);
            page = page.next();
        } while (batch.hasNext());
    }

    private void migrateOne(MediaDocument doc) {
        Resource src = filesystem.retrieve(doc.getStorageKey());
        cloud.store(doc.getStorageKey(),
            src.getInputStream(),
            doc.getSizeBytes(),
            doc.getMimeType());

        doc.setStorageBackend("s3");
        repo.save(doc);

        // If URL format changes (e.g., CDN prefix), update embedded refs
        // String newUrl = "https://cdn.example.com/" + doc.getStorageKey();
        // embeddingService.updateEmbeddedUrl(doc.getId(), newUrl);
    }
}
```

### 12.4 Embedded URL Migration

If the URL format changes during cloud migration (e.g., from API path to CDN URL), the `MediaEmbeddingService.updateEmbeddedUrl()` method updates all embedded references across all domain collections. Because each media document tracks its `linkedTo` array, this is a targeted update — not a full collection scan.

```java
// Only needed if URL format changes (e.g., switching to CDN URLs)
// If /api/v1/media/{id}/content stays the same, this step is skipped
embeddingService.updateEmbeddedUrl(
    doc.getId(),
    "https://cdn.shivagri.com/" + doc.getStorageKey()
);
```

---

## 13. Testing Strategy

| Level | Scope | Tools |
|-------|-------|-------|
| **Unit** | `StorageService` implementations in isolation, `FileValidationService`, `MediaEmbeddingService` logic | JUnit 5, Mockito, temp directories via `@TempDir` |
| **Integration** | Full upload/download cycle through REST API, MongoDB persistence, actual storage writes, embedding verification | `@SpringBootTest`, Flapdoodle Embedded MongoDB or TestContainers, MockMvc |
| **Contract** | API shape verification: ensures switching storage doesn't change response format | Spring Cloud Contract or REST Assured |
| **Cloud Storage** | `S3StorageService` against mock S3 | LocalStack (S3-compatible), TestContainers |
| **Embedding** | Verify media references are correctly embedded/removed/status-propagated across domain collections | Embedded MongoDB, integration tests |

### Contract Test Example

```java
@SpringBootTest
@AutoConfigureMockMvc
class MediaApiContractTest {

    @Test
    void uploadReturnsConsistentShape() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
            "file", "test.jpg", "image/jpeg",
            validJpegBytes());

        mockMvc.perform(multipart("/api/v1/media")
            .file(file))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").exists())
            .andExpect(jsonPath("$.url").exists())
            .andExpect(jsonPath("$.mimeType")
                .value("image/jpeg"))
            .andExpect(jsonPath("$.status")
                .value("ACTIVE"))
            .andExpect(jsonPath("$.checksum")
                .value(startsWith("sha256:")));
    }
}
```

### Embedding Integration Test

```java
@SpringBootTest
class MediaEmbeddingIntegrationTest {

    @Autowired MongoTemplate mongoTemplate;
    @Autowired MediaService mediaService;

    @Test
    void uploadWithLinkToEmbedsReferenceInProject() {
        // Given: a project document exists
        Document project = new Document("name", "Test Project")
            .append("photos", new ArrayList<>());
        mongoTemplate.insert(project, "projects");

        // When: upload with linkTo
        UploadResponse response = mediaService.uploadAndLink(
            testFile, "projects",
            project.getObjectId("_id").toString(),
            "photos", "cover", 0);

        // Then: project has embedded reference
        Document updated = mongoTemplate.findById(
            project.getObjectId("_id"),
            Document.class, "projects");
        List<Document> photos =
            updated.getList("photos", Document.class);

        assertThat(photos).hasSize(1);
        assertThat(photos.get(0).getString("mediaId"))
            .isEqualTo(response.getId());
        assertThat(photos.get(0).getString("status"))
            .isEqualTo("ACTIVE");
    }

    @Test
    void deleteMediaPropagatesStatusToEmbeddedRefs() {
        // Given: media linked to a project
        // When: DELETE /api/v1/media/{id}
        // Then: embedded ref status changes to "DELETED"
    }
}
```

---

## 14. Deployment & Operations

### 14.1 Health Checks & Observability

- Actuator health endpoint includes custom `StorageHealthIndicator` that performs a canary read/write.
- Actuator health endpoint includes `MongoHealthIndicator` (auto-configured by Spring Boot).
- Metrics exported to Prometheus: `media.upload.count`, `media.upload.size.bytes` (histogram), `media.upload.duration` (timer), `media.storage.errors` (counter by type), `media.embedding.updates` (counter).
- Structured JSON logging with correlation IDs for tracing upload-to-storage-to-embedding pipelines.

### 14.2 VPS Deployment Checklist

- Create dedicated media user with restricted permissions: `chown media:media /var/media/uploads`
- Mount a separate data volume or partition for `/var/media` to isolate from OS disk
- Set up daily backup via `rsync` or `rclone` to remote storage
- Set up daily MongoDB backup via `mongodump` + offsite sync
- Configure NGINX with `client_max_body_size 25m` and `proxy_read_timeout` for large uploads
- Set up `logrotate` for application logs
- Monitor disk usage with alerting at 80% capacity threshold

### 14.3 Dockerfile

```dockerfile
FROM eclipse-temurin:17-jre-alpine
RUN addgroup -S media && adduser -S media -G media
WORKDIR /app
COPY target/media-service.jar app.jar
RUN mkdir -p /var/media/uploads && chown media:media /var/media
USER media
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

---

## 15. Future Enhancements

| Enhancement | Description | Priority |
|-------------|-------------|----------|
| **Image Resizing** | On-the-fly thumbnail generation using imgscalr or Thumbnailator; cache variants alongside originals; add `thumbnailUrl` to `MediaRef` | High (after launch) |
| **CDN Integration** | Place Cloudflare CDN in front; update embedded URLs to CDN paths; immutable URLs enable aggressive edge caching | High (with cloud migration) |
| **Video Support** | Chunked upload (tus protocol), async transcoding pipeline, HLS streaming | Medium |
| **Deduplication** | Content-addressable storage using SHA-256; multiple media documents can reference same physical file | Medium |
| **WebP Auto-Convert** | Accept-header-based format negotiation; serve WebP to supporting browsers for 25-35% size reduction | Medium |
| **Virus Scanning** | ClamAV integration in upload pipeline; quarantine suspicious files; set status to `QUARANTINED` before making accessible | High (before public use) |
| **Quota Management** | Per-user/tenant storage quotas with enforcement at upload time | Low |
| **Bulk Upload** | Upload multiple files in a single request with batch embedding into a domain document | Medium |

---

## Appendix: Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Storage abstraction | Interface + Spring `@Profile` | Simpler than full SPI/factory pattern; sufficient for 2-3 backends |
| Key format | `yyyy/MM/UUID.ext` | Date partitioning avoids hot directories; UUID prevents collisions; extension aids debugging |
| Database | MongoDB (metadata + embedded refs) | Native document model for embedded `MediaRef` arrays; no joins needed for page rendering; aligns with existing ShivAgri MongoDB stack |
| Embedding strategy | Denormalized `MediaRef` in domain docs | Zero-lookup rendering: project page loads include all image URLs and statuses immediately; tradeoff is status propagation on delete |
| Status tracking | `status` field + `statusHistory` array | Full audit trail of media lifecycle; embedded status enables frontend to filter without media service calls |
| Serving strategy | X-Accel-Redirect (VPS), Signed URLs (cloud) | Best performance for each phase without over-engineering |
| File validation | Magic bytes + extension + MIME | Defense in depth; no single check is reliable alone |
| Deletion | Soft delete + status propagation + async cleanup | Allows recovery window; embedded refs show `DELETED` immediately; physical deletion is batched |
| Collection whitelist | Config-driven allowed targets | Prevents arbitrary MongoDB collection writes via the media linking API |

---

*End of Document — v1.1*