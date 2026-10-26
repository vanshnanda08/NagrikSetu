package com.civictrack.audit;

import java.time.LocalDate;
import java.util.UUID;

/**
 * What the audit log can be narrowed by. Every field is optional and they
 * combine with AND. {@code from} and {@code to} are calendar days, both
 * inclusive, in the dashboard's zone -- the same notion of a day the public
 * dashboard uses.
 */
public record AuditFilter(
        /** STATUS, ESCALATION or MODERATION. */
        String kind,
        /** An issue's public reference, e.g. CT-2026-000123. */
        String issueRef,
        /** The role that acted: CITIZEN, STAFF, SUPERVISOR, ADMIN or SYSTEM. */
        String actorRole,
        UUID actorId,
        LocalDate from,
        LocalDate to,
        /** An escalation level, 1 to 4. Implies escalation events only. */
        Integer level
) {
}
