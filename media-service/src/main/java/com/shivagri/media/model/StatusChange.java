package com.shivagri.media.model;

import java.time.Instant;

public record StatusChange(MediaStatus status, Instant at) {
}
