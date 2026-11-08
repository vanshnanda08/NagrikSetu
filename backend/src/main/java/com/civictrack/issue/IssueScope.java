package com.civictrack.issue;

import com.civictrack.user.Actor;
import com.civictrack.user.Role;
import org.springframework.security.access.AccessDeniedException;

/** The work scope used by both private reads/queues and transition guards. */
public final class IssueScope {
    private IssueScope() {}

    /** SQL alias i; kept alongside permits so queue and action semantics are explicit. */
    public static final String SQL = """
            (:scopeAdmin = TRUE
             OR (:scopeSupervisor = TRUE AND
                 (i.department_id = CAST(:departmentId AS uuid) OR i.ward_id = CAST(:wardId AS uuid)))
             OR (:scopeSupervisor = FALSE AND i.department_id = CAST(:departmentId AS uuid)
                 AND (CAST(:wardId AS uuid) IS NULL OR i.ward_id = CAST(:wardId AS uuid)))
             OR (i.assigned_to = CAST(:scopeActorId AS uuid) AND i.escalation_level > 0
                 AND i.last_escalated_at IS NOT NULL))
            """;

    public static boolean permits(Actor actor, Issue issue) {
        if (actor.isAdmin() || actor.isSystem()) return true;
        if (actor.role() != Role.STAFF && actor.role() != Role.SUPERVISOR) return false;
        if (actor.role() == Role.STAFF && actor.departmentId() == null) return false;
        if (actor.departmentId() == null && actor.wardId() == null) return false;
        boolean department = actor.departmentId() != null && actor.departmentId().equals(issue.getDepartmentId());
        boolean ward = actor.wardId() != null && actor.wardId().equals(issue.getWardId());
        boolean escalationOwner = actor.id() != null && actor.id().equals(issue.getAssignedTo())
                && issue.getEscalationLevel() > 0 && issue.getLastEscalatedAt() != null;
        return escalationOwner || (actor.role() == Role.SUPERVISOR
                ? department || ward : department && (actor.wardId() == null || ward));
    }

    public static void requireQueueScope(Actor actor) {
        if (actor == null || (actor.role() != Role.ADMIN && actor.role() != Role.SUPERVISOR && actor.role() != Role.STAFF)
                || (actor.role() == Role.STAFF && actor.departmentId() == null)
                || (!actor.isAdmin() && actor.departmentId() == null && actor.wardId() == null)) {
            throw new AccessDeniedException("An assigned municipal department or ward is required for this workspace.");
        }
    }
}
