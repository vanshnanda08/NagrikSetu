-- =====================================================================
-- V7: profile preferences, ward reassignment, and the audit-log indexes.
--
-- Additive only: no existing column is changed and no row is rewritten, so
-- this is safe to run against a database that already holds data.
-- =====================================================================

-- Notification preferences (blueprint 3.13). The notification types a person
-- has switched off, as a comma-separated list of NotificationType names. A
-- list in one column rather than a table because it is read whole, written
-- whole, and has at most four members. VERIFY_REQUESTED is never honoured as
-- muted: silence on a verification round counts as agreement after 72 hours,
-- so letting somebody mute the request would be letting them consent by
-- accident. The service enforces that; the column does not need to.
ALTER TABLE users
    ADD COLUMN muted_notification_types VARCHAR(200) NOT NULL DEFAULT '';

-- Reassign ward (blueprint 3.19) is a moderation action like the others and is
-- logged in the same permanent table. VARCHAR(16) holds the new name.
ALTER TABLE moderation_actions DROP CONSTRAINT moderation_actions_action_check;
ALTER TABLE moderation_actions
    ADD CONSTRAINT moderation_actions_action_check
    CHECK (action IN ('CONFIRM','SPLIT','MERGE','RECATEGORISE','REASSIGN_WARD'));

-- The audit log (blueprint 3.21) lists newest first across three tables and
-- filters by date; without these it would sort every row on every request.
CREATE INDEX idx_history_created    ON issue_status_history (created_at DESC);
CREATE INDEX idx_escalation_created ON escalation_events (created_at DESC);
CREATE INDEX idx_moderation_created ON moderation_actions (created_at DESC);
