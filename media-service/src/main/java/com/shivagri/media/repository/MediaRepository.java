package com.shivagri.media.repository;

import com.shivagri.media.model.MediaDocument;
import com.shivagri.media.model.MediaStatus;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface MediaRepository extends MongoRepository<MediaDocument, String> {

    Optional<MediaDocument> findByIdAndStatusNot(String id, MediaStatus status);

    List<MediaDocument> findByIdInAndStatusNot(List<String> ids, MediaStatus status);
}
