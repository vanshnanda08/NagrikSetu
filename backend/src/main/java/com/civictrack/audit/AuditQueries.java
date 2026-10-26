package com.civictrack.audit;

import com.civictrack.dashboard.DashboardProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

/**
 * The audit log's SQL (blueprint 3.21): every status transition, every
 * escalation and every moderation action, newest first, as one list.
 *
 * <p>It is a UNION over three tables that are each append-only by convention
 * (status history, escalation events, the moderation log), so the log is a
 * view of the system's own records and not a fourth copy that could drift from
 * them. Filters are appended as fixed SQL fragments with bound values; nothing
 * a caller sends is ever concatenated into the statement.
 */
@Repository
@RequiredArgsConstructor
public class AuditQueries {

    private static final String EVENTS = """
            WITH events AS (
                SELECT 'STATUS' AS kind, h.created_at AS at, h.issue_id AS issue_id,
                       COALESCE(h.from_status, 'NEW report') || ' → ' || h.to_status AS action,
                       h.from_status AS from_status, h.to_status AS to_status, NULL::int AS level,
                       h.actor_role AS actor_role, h.actor_id AS actor_id, h.note AS note
                FROM issue_status_history h
              UNION ALL
                SELECT 'ESCALATION', e.created_at, e.issue_id,
                       'Level ' || e.level || ' escalation',
                       NULL, NULL, e.level, 'SYSTEM', NULL,
                       e.reason
                         || COALESCE(' · handed to ' || tu.full_name, '')
                         || COALESCE(' · ' || (e.breached_by_seconds / 3600) || ' h overdue', '')
                FROM escalation_events e
                LEFT JOIN users tu ON tu.id = e.to_user_id
              UNION ALL
                SELECT 'MODERATION', m.created_at, m.issue_id, m.action,
                       NULL, NULL, NULL, m.actor_role, m.actor_id, m.note
                FROM moderation_actions m
            )
            """;

    private static final String JOINS = """
            FROM events ev
            JOIN issues i ON i.id = ev.issue_id
            JOIN categories c ON c.code = i.category_code
            LEFT JOIN users u ON u.id = ev.actor_id
            """;

    private final NamedParameterJdbcTemplate jdbc;
    private final DashboardProperties dashboardProps;

    public AuditPageDto page(AuditFilter filter, int limit, int offset) {
        MapSqlParameterSource params = new MapSqlParameterSource();
        String where = where(filter, params);

        Long total = jdbc.queryForObject(EVENTS + "SELECT COUNT(*) " + JOINS + where, params, Long.class);
        params.addValue("limit", limit).addValue("offset", offset);
        List<AuditEntryDto> items = jdbc.query(EVENTS + select() + JOINS + where
                + " ORDER BY ev.at DESC, ev.kind, ev.issue_id LIMIT :limit OFFSET :offset", params, (rs, n) -> row(rs));
        return new AuditPageDto(items, total == null ? 0 : total, limit, offset);
    }

    /** Up to {@code max} rows for an export, same order and filters as the screen. */
    public List<AuditEntryDto> export(AuditFilter filter, int max) {
        MapSqlParameterSource params = new MapSqlParameterSource().addValue("limit", max).addValue("offset", 0);
        String where = where(filter, params);
        return jdbc.query(EVENTS + select() + JOINS + where
                + " ORDER BY ev.at DESC, ev.kind, ev.issue_id LIMIT :limit OFFSET :offset", params, (rs, n) -> row(rs));
    }

    private static String select() {
        return """
                SELECT ev.at, ev.kind, ev.issue_id, i.public_ref, c.display_name AS category,
                       ev.action, ev.from_status, ev.to_status, ev.level, ev.actor_role,
                       u.full_name AS actor_name, ev.note
                """;
    }

    private String where(AuditFilter f, MapSqlParameterSource p) {
        List<String> clauses = new ArrayList<>();
        ZoneId zone = ZoneId.of(dashboardProps.zone());
        if (f.kind() != null && !f.kind().isBlank()) {
            clauses.add("ev.kind = :kind");
            p.addValue("kind", f.kind().toUpperCase());
        }
        if (f.issueRef() != null && !f.issueRef().isBlank()) {
            clauses.add("UPPER(i.public_ref) = :ref");
            p.addValue("ref", f.issueRef().trim().toUpperCase());
        }
        if (f.actorRole() != null && !f.actorRole().isBlank()) {
            clauses.add("ev.actor_role = :role");
            p.addValue("role", f.actorRole().toUpperCase());
        }
        if (f.actorId() != null) {
            clauses.add("ev.actor_id = :actorId");
            p.addValue("actorId", f.actorId());
        }
        if (f.from() != null) {
            clauses.add("ev.at >= :from");
            p.addValue("from", Timestamp.from(f.from().atStartOfDay(zone).toInstant()));
        }
        if (f.to() != null) {
            clauses.add("ev.at < :toExclusive");
            p.addValue("toExclusive", Timestamp.from(f.to().plusDays(1).atStartOfDay(zone).toInstant()));
        }
        if (f.level() != null) {
            clauses.add("ev.kind = 'ESCALATION' AND ev.level = :level");
            p.addValue("level", f.level());
        }
        return clauses.isEmpty() ? "" : " WHERE " + String.join(" AND ", clauses);
    }

    private static AuditEntryDto row(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new AuditEntryDto(
                rs.getTimestamp("at").toInstant(), rs.getString("kind"),
                rs.getObject("issue_id", java.util.UUID.class), rs.getString("public_ref"),
                rs.getString("category"), rs.getString("action"),
                rs.getString("from_status"), rs.getString("to_status"),
                rs.getObject("level", Integer.class), rs.getString("actor_role"),
                rs.getString("actor_name"), rs.getString("note"));
    }
}
