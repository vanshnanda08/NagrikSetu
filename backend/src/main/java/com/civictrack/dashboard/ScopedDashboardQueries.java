package com.civictrack.dashboard;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static com.civictrack.dashboard.DashboardQueries.CLOCK_RUNNING;
import static com.civictrack.dashboard.DashboardQueries.HOURS_TO_RESOLVE;
import static com.civictrack.dashboard.DashboardQueries.ON_TIME;
import static com.civictrack.dashboard.DashboardQueries.OPEN;
import static com.civictrack.dashboard.DashboardQueries.RESOLVED;

/**
 * The dashboard's figures for one ward or one department (blueprint 3.9, 3.20).
 *
 * <p>The definitions are {@link DashboardQueries}'s, imported rather than
 * restated: resolved is RESOLVED or CLOSED, resolution time is first report to
 * resolution, on-time is judged at the claim. A scoped figure that quietly used
 * a different definition would make a ward look better or worse than the same
 * ward does inside the city total, which is exactly the comparison people make.
 *
 * <p>The scope is a fixed column name chosen from {@link Scope}, never text from
 * a request; the id is a bound parameter.
 */
@Repository
@RequiredArgsConstructor
public class ScopedDashboardQueries {

    /** Which column an issue is attributed to. */
    public enum Scope {
        WARD("i.ward_id"), DEPARTMENT("i.department_id");

        final String column;

        Scope(String column) {
            this.column = column;
        }
    }

    private final NamedParameterJdbcTemplate jdbc;
    private final DashboardProperties props;

    /** One pass over the scope's issues for every count and the median. */
    private record Counts(long open, long overdue, long resolved, long reported30, long resolved30, long onTime,
                          long claimed, long reopened, long unverified, Double medianHours, long resolvedTimed) {
    }

    public ScopeMetricsDto metrics(Scope scope, UUID scopeId, Instant now) {
        Counts c = jdbc.queryForObject("""
                SELECT COUNT(*) FILTER (WHERE %s)                                                       AS open,
                       COUNT(*) FILTER (WHERE i.status IN %s
                                          AND CAST(:now AS timestamptz) > i.due_at + make_interval(secs => i.paused_seconds)) AS overdue,
                       COUNT(*) FILTER (WHERE i.status IN %s)                                           AS resolved,
                       COUNT(*) FILTER (WHERE i.first_reported_at >= CAST(:now AS timestamptz) - interval '30 days') AS reported30,
                       COUNT(*) FILTER (WHERE i.status IN %s AND i.resolved_at >= CAST(:now AS timestamptz) - interval '30 days') AS resolved30,
                       COUNT(*) FILTER (WHERE i.status IN %s AND %s)                                    AS on_time,
                       COUNT(*) FILTER (WHERE i.verification_round > 0)                                 AS claimed,
                       COUNT(*) FILTER (WHERE i.verification_round > 0 AND i.reopen_count > 0)          AS reopened,
                       COUNT(*) FILTER (WHERE i.status IN %s AND i.resolved_without_verification)       AS unverified,
                       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY %s)
                           FILTER (WHERE i.status IN %s AND i.resolved_at IS NOT NULL)                  AS median_hours,
                       COUNT(*) FILTER (WHERE i.status IN %s AND i.resolved_at IS NOT NULL)             AS resolved_timed
                FROM issues i
                WHERE %s = :scopeId AND i.merged_into_id IS NULL
                """.formatted(OPEN, CLOCK_RUNNING, RESOLVED, RESOLVED, RESOLVED, ON_TIME, RESOLVED,
                        HOURS_TO_RESOLVE, RESOLVED, RESOLVED, scope.column), params(scopeId, now),
                (rs, n) -> new Counts(rs.getLong("open"), rs.getLong("overdue"), rs.getLong("resolved"),
                        rs.getLong("reported30"), rs.getLong("resolved30"), rs.getLong("on_time"),
                        rs.getLong("claimed"), rs.getLong("reopened"), rs.getLong("unverified"),
                        rs.getObject("median_hours", Double.class), rs.getLong("resolved_timed")));

        boolean enough = c.resolvedTimed() >= props.minimumSample() && c.medianHours() != null;
        return new ScopeMetricsDto(
                c.open(), c.overdue(), c.resolved(), c.reported30(), c.resolved30(),
                enough ? Math.round(c.medianHours() * 10.0) / 10.0 : null, c.resolvedTimed(),
                c.resolved(), c.onTime(),
                c.resolved() < props.minimumSample() ? null : (double) c.onTime() / c.resolved(),
                c.claimed(), c.reopened(), c.claimed() == 0 ? null : (double) c.reopened() / c.claimed(),
                c.unverified(), c.resolved() == 0 ? null : (double) c.unverified() / c.resolved(),
                backlogAge(scope, scopeId, now), reportedVsResolved(scope, scopeId, now),
                openByCategory(scope, scopeId),
                props.minimumSample(), now);
    }

    private List<DashboardMetricsDto.AgeBucket> backlogAge(Scope scope, UUID scopeId, Instant now) {
        return jdbc.queryForObject("""
                WITH open AS (
                    SELECT EXTRACT(EPOCH FROM (CAST(:now AS timestamptz) - i.first_reported_at)) / 86400.0 AS age
                    FROM issues i WHERE %s AND %s = :scopeId AND i.merged_into_id IS NULL)
                SELECT COUNT(*) FILTER (WHERE age < 1)                AS b0,
                       COUNT(*) FILTER (WHERE age >= 1  AND age < 3)  AS b1,
                       COUNT(*) FILTER (WHERE age >= 3  AND age < 7)  AS b2,
                       COUNT(*) FILTER (WHERE age >= 7  AND age < 14) AS b3,
                       COUNT(*) FILTER (WHERE age >= 14 AND age < 30) AS b4,
                       COUNT(*) FILTER (WHERE age >= 30)              AS b5
                FROM open
                """.formatted(OPEN, scope.column), params(scopeId, now),
                (rs, n) -> List.of(
                        new DashboardMetricsDto.AgeBucket("Under a day", 0, 1, rs.getLong("b0")),
                        new DashboardMetricsDto.AgeBucket("1–3 days", 1, 3, rs.getLong("b1")),
                        new DashboardMetricsDto.AgeBucket("3–7 days", 3, 7, rs.getLong("b2")),
                        new DashboardMetricsDto.AgeBucket("1–2 weeks", 7, 14, rs.getLong("b3")),
                        new DashboardMetricsDto.AgeBucket("2–4 weeks", 14, 30, rs.getLong("b4")),
                        new DashboardMetricsDto.AgeBucket("Over 30 days", 30, null, rs.getLong("b5"))));
    }

    private List<DashboardMetricsDto.DayCount> reportedVsResolved(Scope scope, UUID scopeId, Instant now) {
        return jdbc.query("""
                WITH days AS (
                    SELECT generate_series(CAST(:today AS date) - (:n - 1), CAST(:today AS date),
                                           interval '1 day')::date AS day),
                reported AS (
                    SELECT (i.first_reported_at AT TIME ZONE :zone)::date AS day, COUNT(*) AS c
                    FROM issues i WHERE i.merged_into_id IS NULL AND %s = :scopeId GROUP BY 1),
                resolved AS (
                    SELECT (i.resolved_at AT TIME ZONE :zone)::date AS day, COUNT(*) AS c
                    FROM issues i WHERE i.status IN %s AND i.resolved_at IS NOT NULL AND %s = :scopeId GROUP BY 1)
                SELECT d.day AS day, COALESCE(rp.c, 0) AS reported, COALESCE(rs.c, 0) AS resolved
                FROM days d
                LEFT JOIN reported rp ON rp.day = d.day
                LEFT JOIN resolved rs ON rs.day = d.day
                ORDER BY d.day
                """.formatted(scope.column, RESOLVED, scope.column),
                params(scopeId, now).addValue("n", props.trendDays())
                        .addValue("today", now.atZone(java.time.ZoneId.of(props.zone())).toLocalDate())
                        .addValue("zone", props.zone()),
                (rs, n) -> new DashboardMetricsDto.DayCount(rs.getObject("day", java.time.LocalDate.class),
                        rs.getLong("reported"), rs.getLong("resolved")));
    }

    private List<ScopeMetricsDto.OpenCategory> openByCategory(Scope scope, UUID scopeId) {
        return jdbc.query("""
                SELECT c.code, c.display_name, COUNT(i.id) AS open
                FROM issues i JOIN categories c ON c.code = i.category_code
                WHERE %s AND %s = :scopeId AND i.merged_into_id IS NULL
                GROUP BY c.code, c.display_name
                ORDER BY open DESC, c.display_name
                """.formatted(OPEN, scope.column), new MapSqlParameterSource("scopeId", scopeId),
                (rs, n) -> new ScopeMetricsDto.OpenCategory(rs.getString("code"), rs.getString("display_name"),
                        rs.getLong("open")));
    }

    private static MapSqlParameterSource params(UUID scopeId, Instant now) {
        return new MapSqlParameterSource("scopeId", scopeId).addValue("now", Timestamp.from(now));
    }
}
