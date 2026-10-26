package com.civictrack.audit;

import java.time.Instant;
import java.util.UUID;

/**
 * One line of the audit log: a status transition, an escalation, or a
 * moderation action. The log is read-only and is the union of three
 * append-only tables, so nothing here can be edited from the API.
 */
public record AuditEntryDto(
        Instant at,
        String kind,
        UUID issueId,
        String issueRef,
        String category,
        /** What happened, in a few words: "NEW → ACKNOWLEDGED", "Level 2 escalation", "SPLIT". */
        String action,
        String fromStatus,
        String toStatus,
        Integer level,
        String actorRole,
        String actorName,
        String note
) {
}
