CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts timestamptz NOT NULL,

  actor_type text NOT NULL,
  actor_id text NOT NULL,

  action_type text NOT NULL,
  tool text NOT NULL,
  resource jsonb NOT NULL DEFAULT '{}'::jsonb,

  payload_redacted jsonb NOT NULL DEFAULT '{}'::jsonb,

  decision text NOT NULL,

  prev_hash text,
  hash text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_events_ts ON audit_events (ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events (action_type);
CREATE INDEX IF NOT EXISTS idx_audit_events_tool ON audit_events (tool);
