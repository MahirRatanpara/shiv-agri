package com.shivagri.media.controller.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

public record BatchResolveRequest(
        @NotEmpty @Size(max = 50) List<String> ids
) {
}
