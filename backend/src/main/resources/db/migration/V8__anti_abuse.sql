-- Phase 9: retain anti-abuse evidence and make public redaction reversible.
ALTER TABLE reports
    ADD COLUMN photo_captured_at TIMESTAMPTZ,
    ADD COLUMN abuse_flags VARCHAR(200) NOT NULL DEFAULT '',
    ADD COLUMN description_redacted BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN redacted_at TIMESTAMPTZ,
    ADD COLUMN redacted_by UUID REFERENCES users(id),
    ADD COLUMN redaction_reason VARCHAR(500);

CREATE INDEX idx_reports_photo_hash ON reports (photo_hash)
    WHERE photo_hash IS NOT NULL;
CREATE INDEX idx_issues_resolution_photo_hash ON issues (resolution_photo_hash)
    WHERE resolution_photo_hash IS NOT NULL;

ALTER TABLE moderation_actions DROP CONSTRAINT moderation_actions_action_check;
ALTER TABLE moderation_actions
    ADD CONSTRAINT moderation_actions_action_check
    CHECK (action IN ('CONFIRM','SPLIT','MERGE','RECATEGORISE','REASSIGN_WARD','REDACT'));
