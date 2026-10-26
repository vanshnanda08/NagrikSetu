package com.civictrack.dashboard;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Department analytics (blueprint 3.20): the public dashboard scoped to one
 * department, plus how each member of crew is doing. Internal only: the project
 * measures departments in public and individuals in private, on purpose.
 */
public record DepartmentAnalyticsDto(
        Department department,
        ScopeMetricsDto metrics,
        List<StaffRow> staff,
        int minimumSample,
        Instant generatedAt
) {
    public record Department(UUID id, String name) {
    }

    /**
     * One member of crew. A fix is attributed to whoever <em>submitted it for
     * verification</em>, not to whoever the issue happens to be assigned to when
     * it settles -- escalation hands {@code assigned_to} up the ladder, so the
     * assignee at the end is often a supervisor and not the person who did the
     * work. {@code medianResolutionHours} is null below the minimum sample.
     */
    public record StaffRow(UUID id, String name, long fixesClaimed, long resolved, long reopened,
                           Double reopenRate, Double medianResolutionHours,
                           long openAssigned, long overdueAssigned) {
    }
}
