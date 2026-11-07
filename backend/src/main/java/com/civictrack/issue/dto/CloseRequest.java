package com.civictrack.issue.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Administrative closure always records a public reason. */
public record CloseRequest(@NotBlank @Size(min = 20, max = 2000) String note) {}
