package com.civictrack.moderation.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Reason is permanent audit evidence; the original text remains in the database. */
public record RedactRequest(
        @NotBlank(message = "reason is required")
        @Size(min = 10, max = 500, message = "reason must be between 10 and 500 characters")
        String reason) {
}
