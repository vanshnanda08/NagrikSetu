package com.civictrack.moderation.dto;

import java.util.UUID;

/** A ward an issue could be reassigned to, nearest first. {@code allowed} is the ward guard's answer. */
public record WardOptionDto(UUID id, int wardNumber, String name, double distanceM, boolean current, boolean allowed) {
}
