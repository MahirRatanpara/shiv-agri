package com.shivagri.media.controller.dto;

import java.time.Instant;

/**
 * Result of POST /api/v1/cdn-refresh.
 *
 * <p>{@code assetsBefore}/{@code assetsAfter} are the manifest entry counts either side
 * of the reload — equal counts are normal and simply mean no keys were added or removed.
 */
public record CdnRefreshResponse(String status,
                                 boolean manifestPresent,
                                 int assetsBefore,
                                 int assetsAfter,
                                 String generatedAt,
                                 String commit,
                                 Instant refreshedAt) {
}
