package com.shivagri.media.controller.dto;

import com.shivagri.media.model.MediaStatus;
import jakarta.validation.constraints.NotNull;

public record StatusUpdateRequest(
        @NotNull MediaStatus status,
        String reason
) {
}
