package com.civictrack.dashboard;

import com.civictrack.issue.IssueRepository;
import com.civictrack.issue.IssueStatus;
import com.civictrack.issue.dto.QueueRowDto;
import com.civictrack.user.Actor;
import com.civictrack.user.Role;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.sql.Timestamp;
import java.time.Clock;
import java.util.List;

import static com.civictrack.dashboard.DashboardQueries.CLOCK_RUNNING;
import static com.civictrack.dashboard.DashboardQueries.OPEN;

@Service
@RequiredArgsConstructor
public class StaffOverviewService {
    private static final int PREVIEW = 6;
    private final NamedParameterJdbcTemplate jdbc;
    private final IssueRepository issues;
    private final Clock clock;

    /** Scope is exclusively from verified claims, including an optional ward restriction. */
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public StaffOverviewDto overview(Actor actor) {
        if (actor == null || actor.role() != Role.STAFF || actor.departmentId() == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "A staff account with an assigned department is required for this overview.");
        }
        var now = clock.instant();
        var params = new MapSqlParameterSource("department", actor.departmentId())
                .addValue("ward", actor.wardId()).addValue("member", actor.id())
                .addValue("now", Timestamp.from(now));
        var department = jdbc.query("SELECT id, name FROM departments WHERE id = :department", params,
                (rs, row) -> new StaffOverviewDto.Scope(rs.getObject("id", java.util.UUID.class), rs.getString("name")))
                .stream().findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Your assigned department is no longer available."));
        var ward = actor.wardId() == null ? null : jdbc.query("SELECT id, name FROM wards WHERE id = :ward", params,
                (rs, row) -> new StaffOverviewDto.Scope(rs.getObject("id", java.util.UUID.class), rs.getString("name")))
                .stream().findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Your assigned ward is no longer available."));

        // Aggregate the complete scope, not the capped queue preview. The SLA
        // definitions are shared with the public and supervisor dashboards.
        var totals = jdbc.queryForObject("""
                SELECT COUNT(*) AS department_open,
                       COUNT(*) FILTER (WHERE i.status IN %s AND CAST(:now AS timestamptz) >
                           i.due_at + make_interval(secs => i.paused_seconds)) AS department_overdue,
                       COUNT(*) FILTER (WHERE i.status IN ('NEW','ACKNOWLEDGED')) AS needs_assignment,
                       COUNT(*) FILTER (WHERE i.status = 'PENDING_VERIFICATION') AS department_waiting,
                       COUNT(*) FILTER (WHERE i.assigned_to = :member) AS mine_open,
                       COUNT(*) FILTER (WHERE i.assigned_to = :member AND i.status IN %s AND
                           CAST(:now AS timestamptz) > i.due_at + make_interval(secs => i.paused_seconds)) AS mine_overdue,
                       COUNT(*) FILTER (WHERE i.assigned_to = :member AND i.status IN ('ASSIGNED','REOPENED')) AS mine_ready,
                       COUNT(*) FILTER (WHERE i.assigned_to = :member AND i.status = 'IN_PROGRESS') AS mine_progress,
                       COUNT(*) FILTER (WHERE i.assigned_to = :member AND i.status = 'PENDING_VERIFICATION') AS mine_waiting
                FROM issues i
                WHERE %s AND i.merged_into_id IS NULL AND i.department_id = :department
                  AND (CAST(:ward AS uuid) IS NULL OR i.ward_id = CAST(:ward AS uuid))
                """.formatted(CLOCK_RUNNING, CLOCK_RUNNING, OPEN), params,
                (rs, row) -> new Totals(
                        new StaffOverviewDto.Personal(rs.getLong("mine_open"), rs.getLong("mine_overdue"),
                                rs.getLong("mine_ready"), rs.getLong("mine_progress"), rs.getLong("mine_waiting")),
                        new StaffOverviewDto.DepartmentWork(rs.getLong("department_open"), rs.getLong("department_overdue"),
                                rs.getLong("needs_assignment"), rs.getLong("department_waiting"))));
        var stageRows = jdbc.query("""
                SELECT i.status, COUNT(*) AS total,
                       COUNT(*) FILTER (WHERE i.assigned_to = :member) AS mine
                FROM issues i
                WHERE %s AND i.merged_into_id IS NULL AND i.department_id = :department
                  AND (CAST(:ward AS uuid) IS NULL OR i.ward_id = CAST(:ward AS uuid))
                GROUP BY i.status
                """.formatted(OPEN), params,
                (rs, row) -> new StaffOverviewDto.Stage(rs.getString("status"), rs.getLong("total"), rs.getLong("mine")));
        var stages = List.of(IssueStatus.NEW, IssueStatus.REOPENED, IssueStatus.ACKNOWLEDGED,
                IssueStatus.ASSIGNED, IssueStatus.IN_PROGRESS, IssueStatus.PENDING_VERIFICATION).stream()
                .map(status -> stageRows.stream().filter(s -> s.status().equals(status.name())).findFirst()
                        .orElse(new StaffOverviewDto.Stage(status.name(), 0, 0))).toList();
        return new StaffOverviewDto(department, ward, totals.personal(), totals.department(), stages,
                issues.findQueueRows(actor.departmentId(), actor.wardId(), actor.id(), false, false, false, PREVIEW, 0)
                        .stream().map(QueueRowDto::from).toList(),
                issues.findQueueRows(actor.departmentId(), actor.wardId(), null, false, false, false, PREVIEW, 0)
                        .stream().map(QueueRowDto::from).toList(), PREVIEW, now);
    }

    private record Totals(StaffOverviewDto.Personal personal, StaffOverviewDto.DepartmentWork department) {}
}
