CREATE TABLE refresh_sessions (
    token_hash varchar(64) PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_id uuid NOT NULL,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    revoked boolean NOT NULL DEFAULT false
);
CREATE INDEX idx_refresh_user ON refresh_sessions(user_id);
CREATE INDEX idx_refresh_family ON refresh_sessions(family_id);
CREATE TABLE password_resets (
    token_hash varchar(64) PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    used_at timestamptz
);
ALTER TABLE users ADD COLUMN email_notifications boolean NOT NULL DEFAULT false;
CREATE TABLE mail_outbox (
    id bigserial PRIMARY KEY,
    recipient varchar(180) NOT NULL,
    subject varchar(240) NOT NULL,
    body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    sent_at timestamptz,
    attempts int NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mail_pending ON mail_outbox(next_attempt_at) WHERE sent_at IS NULL;
CREATE TABLE configuration_audit (
    id bigserial PRIMARY KEY,
    actor_id uuid NOT NULL REFERENCES users(id),
    resource varchar(40) NOT NULL,
    resource_id varchar(80) NOT NULL,
    before_value jsonb,
    after_value jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE report_submissions (
    submission_key varchar(180) PRIMARY KEY,
    payload_hash varchar(64) NOT NULL,
    result jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_reports_device_time ON reports(device_id, category_code, created_at);
CREATE INDEX idx_reports_account_time ON reports(reporter_id, created_at);
