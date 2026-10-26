package com.civictrack.dashboard;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * One ward's public page (blueprint 3.9): the dashboard's figures scoped to the
 * ward, its boundary, where issues cluster inside it, and the places that keep
 * generating problems. Public and shareable, because it is the screen a
 * councillor's office points at.
 */
public record WardDashboardDto(
        Ward ward,
        ScopeMetricsDto metrics,
        List<DensityCell> density,
        List<RecurrenceSpot> recurrence,
        Instant generatedAt
) {
    /** {@code boundary} is GeoJSON (a MultiPolygon), as the wards list already serves it. */
    public record Ward(UUID id, int wardNumber, String name, String boundary) {
    }

    /** Issues in one grid cell of the ward. Issue counts, not report counts: a cell of one pothole reported twenty times is one issue. */
    public record DensityCell(double lat, double lng, long issues, long open) {
    }

    /**
     * A place that has generated more than one issue in the same category over
     * time -- the repair that did not last, or the defect that keeps coming
     * back. {@code refs} are the tickets, newest first; {@code issueIds} runs
     * parallel to it so each one can link to its page.
     */
    public record RecurrenceSpot(String categoryCode, String categoryName, double lat, double lng,
                                 long issues, long open, Instant firstReportedAt, Instant lastReportedAt,
                                 List<String> refs, List<UUID> issueIds) {
    }
}
