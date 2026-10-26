ALTER TABLE users
    ADD COLUMN mfa_secret varchar(512),
    ADD COLUMN mfa_enabled boolean NOT NULL DEFAULT false,
    ADD COLUMN mfa_last_counter bigint;

ALTER TABLE refresh_sessions
    ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN last_used_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN mfa_verified boolean NOT NULL DEFAULT false;

CREATE TABLE mfa_recovery_codes (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash varchar(64) NOT NULL,
    used_at timestamptz,
    PRIMARY KEY (user_id, code_hash)
);

CREATE TABLE issue_followers (
    issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (issue_id, user_id)
);
CREATE INDEX idx_issue_followers_user ON issue_followers(user_id, created_at DESC);

CREATE TABLE issue_messages (
    id bigserial PRIMARY KEY,
    issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    author_id uuid NOT NULL REFERENCES users(id),
    author_role varchar(20) NOT NULL,
    kind varchar(24) NOT NULL CHECK (kind IN ('REQUEST_INFO', 'CITIZEN_REPLY')),
    body varchar(2000) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_issue_messages_issue ON issue_messages(issue_id, created_at, id);
