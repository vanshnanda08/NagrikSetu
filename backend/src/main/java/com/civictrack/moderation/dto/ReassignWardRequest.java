package com.civictrack.moderation.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record ReassignWardRequest(@NotNull UUID wardId, @Size(max = 500) String note) {
}
