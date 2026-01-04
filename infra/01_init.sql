-- infra/01_init.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts timestamptz NOT NULL,

  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),

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

CREATE INDEX IF NOT EXISTS idx_audit_events_ts
  ON audit_events (ts DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_action
  ON audit_events (action_type);

CREATE INDEX IF NOT EXISTS idx_audit_events_tool
  ON audit_events (tool);

CREATE INDEX IF NOT EXISTS idx_audit_events_correlation_ts
  ON audit_events (correlation_id, ts DESC);


CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('requested','approved','denied','expired')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by text NOT NULL,
  decided_at timestamptz,
  decided_by text,
  decision_reason text
);

CREATE INDEX IF NOT EXISTS idx_approvals_correlation
  ON approvals (correlation_id);

CREATE INDEX IF NOT EXISTS idx_approvals_status_requested_at
  ON approvals (status, requested_at DESC);
