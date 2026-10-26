package com.civictrack.issue;

import com.civictrack.notification.NotificationService;
import com.civictrack.notification.NotificationType;
import com.civictrack.user.Actor;
import com.civictrack.user.Role;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** Following and private clarification messages without changing report counts or priority. */
@Service
@RequiredArgsConstructor
public class IssueEngagementService {
    private final IssueRepository issues;
    private final JdbcTemplate jdbc;
    private final NotificationService notifications;
    private final Clock clock;

    @Transactional(readOnly = true)
    public boolean follows(UUID issueId, UUID userId) {
        requireIssue(issueId);
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM issue_followers WHERE issue_id=? AND user_id=?)",
                Boolean.class, issueId, userId));
    }

    @Transactional
    public void follow(UUID issueId, UUID userId) {
        requireIssue(issueId);
        jdbc.update("INSERT INTO issue_followers(issue_id,user_id) VALUES (?,?) ON CONFLICT DO NOTHING",
                issueId, userId);
    }

    @Transactional
    public void unfollow(UUID issueId, UUID userId) {
        jdbc.update("DELETE FROM issue_followers WHERE issue_id=? AND user_id=?", issueId, userId);
    }

    @Transactional(readOnly = true)
    public List<Message> messages(UUID issueId, Actor actor, boolean staffInScope) {
        requireParticipant(issueId, actor, staffInScope);
        return jdbc.query("""
                SELECT id,author_role,kind,body,created_at FROM issue_messages
                WHERE issue_id=? ORDER BY created_at,id
                """, (rs, row) -> new Message(rs.getLong("id"), rs.getString("author_role"),
                rs.getString("kind"), rs.getString("body"), rs.getTimestamp("created_at").toInstant()), issueId);
    }

    @Transactional
    public Message post(UUID issueId, Actor actor, boolean staffInScope, String rawBody) {
        Issue issue = requireParticipant(issueId, actor, staffInScope);
        String body = rawBody == null ? "" : rawBody.strip();
        if (body.length() < 3 || body.length() > 2000) {
            throw new IllegalArgumentException("A message must be between 3 and 2,000 characters.");
        }
        boolean citizen = actor.role() == Role.CITIZEN;
        String kind = citizen ? "CITIZEN_REPLY" : "REQUEST_INFO";
        Instant now = clock.instant();
        Long id = jdbc.queryForObject("""
                INSERT INTO issue_messages(issue_id,author_id,author_role,kind,body,created_at)
                VALUES (?,?,?,?,?,?) RETURNING id
                """, Long.class, issueId, actor.id(), actor.role().name(), kind, body,
                java.sql.Timestamp.from(now));

        if (citizen) {
            List<UUID> staff = new ArrayList<>();
            if (issue.getAssignedTo() != null) staff.add(issue.getAssignedTo());
            if (staff.isEmpty()) {
                staff.addAll(jdbc.queryForList("SELECT head_user_id FROM departments WHERE id=? AND head_user_id IS NOT NULL",
                        UUID.class, issue.getDepartmentId()));
            }
            notifications.sendDirect(staff, issue, NotificationType.CITIZEN_REPLIED,
                    "Citizen replied: " + issue.getPublicRef(), body);
        } else {
            List<UUID> reporters = jdbc.queryForList(
                    "SELECT DISTINCT reporter_id FROM reports WHERE issue_id=? AND reporter_id IS NOT NULL",
                    UUID.class, issueId);
            notifications.sendDirect(reporters, issue, NotificationType.INFO_REQUESTED,
                    "More information needed: " + issue.getPublicRef(), body);
        }
        return new Message(id, actor.role().name(), kind, body, now);
    }

    private Issue requireParticipant(UUID issueId, Actor actor, boolean staffInScope) {
        Issue issue = requireIssue(issueId);
        if (actor.role() == Role.CITIZEN) {
            if (!issues.existsReportBy(issueId, actor.id())) {
                throw new AccessDeniedException("Only a citizen who reported this issue can join its clarification thread.");
            }
        } else if (!staffInScope) {
            throw new AccessDeniedException("This issue is outside your assigned scope.");
        }
        return issue;
    }

    private Issue requireIssue(UUID issueId) {
        return issues.findById(issueId).orElseThrow(() -> new IssueNotFoundException(issueId));
    }

    public record Message(long id, String authorRole, String kind, String body, Instant createdAt) {}
}
