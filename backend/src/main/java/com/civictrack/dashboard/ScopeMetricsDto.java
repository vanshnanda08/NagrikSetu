package com.civictrack.dashboard;

import java.time.Instant;
import java.util.List;

/**
 * The public dashboard's figures, scoped to one ward or one department. Same
 * definitions as the city-wide dashboard (DD-064), so a ward's number and the
 * city's number mean the same thing.
 *
 * <p>A rate or median below {@code minimumSample} resolved issues is null and the
 * client says how many more it needs, exactly as on the main dashboard.
 */
public record ScopeMetricsDto(
        long openCount,
        long overdueCount,
        long resolvedCount,
        long reportedLast30Days,
        long resolvedLast30Days,
        Double medianResolutionHours,
        long resolvedWithTime,
        long slaResolved,
        long slaOnTime,
        Double slaRate,
        long fixesClaimed,
        long reopened,
        Double reopenRate,
        long resolvedWithoutVerification,
        Double unverifiedRate,
        List<DashboardMetricsDto.AgeBucket> backlogAge,
        List<DashboardMetricsDto.DayCount> reportedVsResolved,
        List<OpenCategory> openByCategory,
        int minimumSample,
        Instant generatedAt
) {
    public record OpenCategory(String code, String name, long open) {
    }
}
