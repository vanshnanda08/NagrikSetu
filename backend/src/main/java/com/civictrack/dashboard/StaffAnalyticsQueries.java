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
import static com.civictrack.dashboard.DashboardQueries.RESOLVED;

/** Per-member-of-crew figures for one department. See {@link DepartmentAnalyticsDto.StaffRow} for the attribution rule. */
@Repository
@RequiredArgsConstructor
public class StaffAnalyticsQueries {

    private final NamedParameterJdbcTemplate jdbc;
    private final DashboardProperties props;

    public List<DepartmentAnalyticsDto.StaffRow> staff(UUID departmentId, Instant now) {
        return jdbc.query("""
                WITH claims AS (
                    SELECT DISTINCT h.actor_id AS user_id, h.issue_id
                    FROM issue_status_history h
                    JOIN issues i ON i.id = h.issue_id
                    WHERE h.to_status = 'PENDING_VERIFICATION' AND h.actor_id IS NOT NULL
                      AND i.department_id = :dept)
                SELECT u.id, u.full_name,
                       COUNT(i.id)                                              AS claimed,
                       COUNT(i.id) FILTER (WHERE i.status IN %s)                AS resolved,
                       COUNT(i.id) FILTER (WHERE i.reopen_count > 0)            AS reopened,
                       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY %s)
                           FILTER (WHERE i.status IN %s AND i.resolved_at IS NOT NULL) AS median_hours,
                       (SELECT COUNT(*) FROM issues o
                         WHERE o.assigned_to = u.id AND o.status IN %s)         AS open_assigned,
                       (SELECT COUNT(*) FROM issues o
                         WHERE o.assigned_to = u.id AND o.status IN %s
                           AND CAST(:now AS timestamptz) > o.due_at + make_interval(secs => o.paused_seconds)) AS overdue_assigned
                FROM users u
                LEFT JOIN claims c ON c.user_id = u.id
                LEFT JOIN issues i ON i.id = c.issue_id
                WHERE u.department_id = :dept AND u.role = 'STAFF' AND u.active
                GROUP BY u.id, u.full_name
                ORDER BY resolved DESC, u.full_name
                """.formatted(RESOLVED, HOURS_TO_RESOLVE, RESOLVED, CLOCK_RUNNING, CLOCK_RUNNING),
                new MapSqlParameterSource("dept", departmentId).addValue("now", Timestamp.from(now)),
                (rs, n) -> {
                    long resolved = rs.getLong("resolved");
                    long claimed = rs.getLong("claimed");
                    Double median = rs.getObject("median_hours", Double.class);
                    return new DepartmentAnalyticsDto.StaffRow(rs.getObject("id", UUID.class),
                            rs.getString("full_name"), claimed, resolved, rs.getLong("reopened"),
                            claimed == 0 ? null : (double) rs.getLong("reopened") / claimed,
                            resolved >= props.minimumSample() && median != null ? Math.round(median * 10.0) / 10.0 : null,
                            rs.getLong("open_assigned"), rs.getLong("overdue_assigned"));
                });
    }

    public java.util.Optional<DepartmentAnalyticsDto.Department> department(UUID id) {
        return jdbc.query("SELECT id, name FROM departments WHERE id = :id", new MapSqlParameterSource("id", id),
                (rs, n) -> new DepartmentAnalyticsDto.Department(rs.getObject("id", UUID.class), rs.getString("name")))
                .stream().findFirst();
    }
}
