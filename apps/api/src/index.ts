import Fastify from "fastify";
import crypto from "node:crypto";
import pg from "pg";

const { Pool } = pg;

/**
 * =========================
 * Config
 * =========================
 */
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://agentguard:agentguard@localhost:5433/agentguard";

const PORT = Number(process.env.PORT ?? 3001);

const INTERNAL_EMAIL_DOMAINS = (
  process.env.INTERNAL_EMAIL_DOMAINS ?? "example.com"
)
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const DENY_EMAIL_DOMAINS = (process.env.DENY_EMAIL_DOMAINS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

/**
 * =========================
 * App + DB
 * =========================
 */
const app = Fastify({ logger: true });

const pool = new Pool({ connectionString: DATABASE_URL });

pool.on("connect", (_client: pg.PoolClient) => {
  app.log.info({ msg: "db_connected" });
});

pool.on("error", (err: unknown) => {
  app.log.error({ msg: "db_pool_error", error: err });
});

/**
 * =========================
 * Types
 * =========================
 */
type Json = Record<string, any> | any[] | string | number | boolean | null;
type ObjectJson = Record<string, any>;

type AppendBody = {
  correlation_id?: string;
  actor_type: string;
  actor_id: string;
  action_type: string;
  tool: string;
  resource?: Json;
  payload_redacted?: Json;
  decision: string;
};

type AuditListQuery = {
  actor_id?: string;
  action_type?: string;
  tool?: string;
  decision?: string;
  from?: string; // ISO
  to?: string; // ISO
  limit?: string;
};

type ApprovalsListQuery = {
  status?: "requested" | "approved" | "denied" | "expired";
  limit?: string;
};

type ApprovalRow = {
  id: string;
  correlation_id: string;
  status: string;
  requested_at: string;
  requested_by: string;
  decided_at: string | null;
  decided_by: string | null;
  decision_reason: string | null;
};

type ActionSubmitBody = {
  actor_type: string;
  actor_id: string;
  tool: string;
  action: string;
  resource?: ObjectJson;
  payload_redacted?: ObjectJson;
};

type ApprovalDecideBody = {
  decision: "approved" | "denied";
  approver_id: string;
  reason?: string;
};

/**
 * =========================
 * Utilities
 * =========================
 */
function canonicalJson(obj: unknown): string {
  // Sorted-key JSON stringify (MVP). Replace with RFC8785 canonical JSON in V1.
  const sortKeys = (v: any): any => {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === "object") {
      return Object.keys(v)
        .sort()
        .reduce((acc: any, k) => {
          acc[k] = sortKeys(v[k]);
          return acc;
        }, {});
    }
    return v;
  };
  return JSON.stringify(sortKeys(obj));
}

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function parseIsoDate(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseLimit(raw: string | undefined, def = 50, max = 200): number {
  const n = raw ? parseInt(raw, 10) : def;
  if (!Number.isFinite(n)) return def;
  return Math.max(1, Math.min(max, n));
}

function getEmailDomain(to: unknown): string | null {
  if (typeof to !== "string") return null;
  const at = to.lastIndexOf("@");
  if (at < 0) return null;
  return to.slice(at + 1).toLowerCase();
}

/**
 * =========================
 * Policy (MVP)
 * =========================
 */
function evaluatePolicy(input: {
  tool: string;
  action: string;
  resource: any;
}) {
  // MVP rules:
  // - gmail + denylisted domain => denied
  // - gmail + external domain => approve_required
  // - else => allowed
  if (input.tool !== "gmail")
    return { decision: "allowed" as const, reason: "non_email_tool" };

  const domain = getEmailDomain(input.resource?.to) ?? "unknown";

  if (DENY_EMAIL_DOMAINS.includes(domain)) {
    return {
      decision: "denied" as const,
      reason: `denylisted_domain:${domain}`,
    };
  }
  if (!INTERNAL_EMAIL_DOMAINS.includes(domain)) {
    return {
      decision: "approve_required" as const,
      reason: `external_domain:${domain}`,
    };
  }
  return { decision: "allowed" as const, reason: `internal_domain:${domain}` };
}

/**
 * =========================
 * DB helpers
 * =========================
 */
async function appendAuditEvent(input: AppendBody) {
  // Ensure correlation_id exists and is included in the hashed payload.
  const correlationId = input.correlation_id ?? crypto.randomUUID();
  const tsIso = new Date().toISOString();

  const prev = await pool.query<{ hash: string }>(
    "SELECT hash FROM audit_events ORDER BY ts DESC, id DESC LIMIT 1"
  );
  const prev_hash = prev.rows[0]?.hash ?? null;

  const eventForHash = {
    ts: tsIso,
    correlation_id: correlationId,
    actor_type: input.actor_type,
    actor_id: input.actor_id,
    action_type: input.action_type,
    tool: input.tool,
    resource: input.resource ?? {},
    payload_redacted: input.payload_redacted ?? {},
    decision: input.decision,
    prev_hash,
  };

  const hash = sha256Hex((prev_hash ?? "") + canonicalJson(eventForHash));

  const r = await pool.query(
    `INSERT INTO audit_events
      (ts, correlation_id, actor_type, actor_id, action_type, tool, resource, payload_redacted, decision, prev_hash, hash)
     VALUES
      ($1::timestamptz,$2::uuid,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11)
     RETURNING id, ts, correlation_id, prev_hash, hash`,
    [
      tsIso,
      correlationId,
      input.actor_type,
      input.actor_id,
      input.action_type,
      input.tool,
      JSON.stringify(input.resource ?? {}),
      JSON.stringify(input.payload_redacted ?? {}),
      input.decision,
      prev_hash,
      hash,
    ]
  );

  return r.rows[0];
}

async function getActionRequestedContext(correlationId: string) {
  // Pull the original intent so later events can reflect real context.
  const r = await pool.query(
    `SELECT tool, resource, payload_redacted
     FROM audit_events
     WHERE correlation_id = $1::uuid AND action_type = 'action.requested'
     ORDER BY ts ASC, id ASC
     LIMIT 1`,
    [correlationId]
  );

  if (r.rowCount === 0) return null;
  return r.rows[0] as { tool: string; resource: any; payload_redacted: any };
}

/**
 * =========================
 * Routes
 * =========================
 */
app.get("/health", async () => ({ ok: true }));

/**
 * Audit: list
 */
app.get<{ Querystring: AuditListQuery }>("/audit", async (req, reply) => {
  const q = req.query ?? {};
  const limit = parseLimit(q.limit, 50, 200);

  const fromD = parseIsoDate(q.from);
  const toD = parseIsoDate(q.to);

  if (q.from && !fromD) return reply.code(400).send({ error: "invalid_from" });
  if (q.to && !toD) return reply.code(400).send({ error: "invalid_to" });

  const where: string[] = [];
  const params: any[] = [];
  const add = (clause: string, value: any) => {
    params.push(value);
    where.push(clause.replace("?", `$${params.length}`));
  };

  if (q.actor_id) add("actor_id = ?", q.actor_id);
  if (q.action_type) add("action_type = ?", q.action_type);
  if (q.tool) add("tool = ?", q.tool);
  if (q.decision) add("decision = ?", q.decision);
  if (fromD) add("ts >= ?::timestamptz", fromD.toISOString());
  if (toD) add("ts <= ?::timestamptz", toD.toISOString());

  params.push(limit);

  const sql = `
    SELECT *
    FROM audit_events
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY ts DESC, id DESC
    LIMIT $${params.length}
  `;

  const r = await pool.query(sql, params);
  return { items: r.rows, limit, returned: r.rowCount };
});

/**
 * Audit: get by id
 */
app.get("/audit/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const r = await pool.query("SELECT * FROM audit_events WHERE id = $1::uuid", [
    id,
  ]);
  if (r.rowCount === 0) return reply.code(404).send({ error: "not_found" });
  return r.rows[0];
});

/**
 * Audit: append (raw)
 */
app.post<{ Body: AppendBody }>("/audit/append", async (req, reply) => {
  const b = req.body;
  // minimal validation to avoid undefined inserts
  for (const k of [
    "actor_type",
    "actor_id",
    "action_type",
    "tool",
    "decision",
  ] as const) {
    if (!(b as any)[k])
      return reply.code(400).send({ error: "missing_field", field: k });
  }
  return await appendAuditEvent(b);
});

/**
 * Actions: submit (creates lifecycle events)
 */
app.post<{ Body: ActionSubmitBody }>("/actions/submit", async (req, reply) => {
  const b = req.body;
  if (!b.actor_type || !b.actor_id || !b.tool || !b.action) {
    return reply.code(400).send({ error: "missing_required_fields" });
  }

  const correlationId = crypto.randomUUID();

  // 1) action.requested
  await appendAuditEvent({
    correlation_id: correlationId,
    actor_type: b.actor_type,
    actor_id: b.actor_id,
    action_type: "action.requested",
    tool: b.tool,
    resource: { action: b.action, ...(b.resource ?? {}) },
    payload_redacted: b.payload_redacted ?? {},
    decision: "requested",
  });

  // 2) policy.evaluated
  const policy = evaluatePolicy({
    tool: b.tool,
    action: b.action,
    resource: b.resource ?? {},
  });

  await appendAuditEvent({
    correlation_id: correlationId,
    actor_type: b.actor_type,
    actor_id: b.actor_id,
    action_type: "policy.evaluated",
    tool: b.tool,
    resource: { action: b.action, ...(b.resource ?? {}) },
    payload_redacted: { reason: policy.reason },
    decision: policy.decision,
  });

  // 3) branch
  if (policy.decision === "allowed") {
    await appendAuditEvent({
      correlation_id: correlationId,
      actor_type: b.actor_type,
      actor_id: b.actor_id,
      action_type: "action.executed",
      tool: b.tool,
      resource: { action: b.action, ...(b.resource ?? {}) },
      payload_redacted: { note: "stub_execution" },
      decision: "success",
    });
    return { correlation_id: correlationId, status: "executed" };
  }

  if (policy.decision === "denied") {
    await appendAuditEvent({
      correlation_id: correlationId,
      actor_type: b.actor_type,
      actor_id: b.actor_id,
      action_type: "action.blocked",
      tool: b.tool,
      resource: { action: b.action, ...(b.resource ?? {}) },
      payload_redacted: { reason: policy.reason },
      decision: "denied",
    });
    return reply.code(403).send({
      correlation_id: correlationId,
      status: "denied",
      reason: policy.reason,
    });
  }

  // approval_required
  const approval = await pool.query<{ id: string }>(
    `INSERT INTO approvals (correlation_id, status, requested_by)
   VALUES ($1::uuid, 'requested', $2)
   RETURNING id`,
    [correlationId, b.actor_id]
  );

  if (approval.rowCount !== 1) {
    throw new Error("approval_insert_failed");
  }

  const approvalId = approval.rows[0]!.id;

  await appendAuditEvent({
    correlation_id: correlationId,
    actor_type: b.actor_type,
    actor_id: b.actor_id,
    action_type: "approval.requested",
    tool: "approvals",
    resource: { approval_id: approvalId },
    payload_redacted: { reason: policy.reason },
    decision: "requested",
  });

  return {
    correlation_id: correlationId,
    status: "approval_required",
    approval_id: approvalId,
    reason: policy.reason,
  };
});

/**
 * Actions: timeline
 */
app.get("/actions/:correlation_id", async (req) => {
  const { correlation_id } = req.params as { correlation_id: string };
  const r = await pool.query(
    `SELECT * FROM audit_events
     WHERE correlation_id = $1::uuid
     ORDER BY ts ASC, id ASC`,
    [correlation_id]
  );
  return { correlation_id, events: r.rows, returned: r.rowCount };
});

/**
 * Approvals: list
 */
app.get<{ Querystring: ApprovalsListQuery }>("/approvals", async (req) => {
  const q = req.query ?? {};
  const limit = parseLimit(q.limit, 50, 200);

  const allowedStatuses = new Set([
    "requested",
    "approved",
    "denied",
    "expired",
  ]);
  const status =
    q.status && allowedStatuses.has(q.status) ? q.status : undefined;

  const params: any[] = [];
  let whereSql = "";
  if (status) {
    params.push(status);
    whereSql = `WHERE status = $1`;
  }

  params.push(limit);

  const sql = `
    SELECT id, correlation_id, status, requested_at, requested_by, decided_at, decided_by, decision_reason
    FROM approvals
    ${whereSql}
    ORDER BY requested_at DESC, id DESC
    LIMIT $${params.length}
  `;

  const r = await pool.query<ApprovalRow>(sql, params);
  return { items: r.rows, limit, returned: r.rowCount };
});

/**
 * Approvals: get by id
 */
app.get("/approvals/:id", async (req, reply) => {
  const { id } = req.params as { id: string };

  const r = await pool.query<ApprovalRow>(
    `SELECT id, correlation_id, status, requested_at, requested_by, decided_at, decided_by, decision_reason
     FROM approvals
     WHERE id = $1::uuid`,
    [id]
  );

  if (r.rowCount === 0)
    return reply.code(404).send({ error: "approval_not_found" });
  return r.rows[0];
});

/**
 * Approvals: decide
 */
app.post<{ Body: ApprovalDecideBody }>(
  "/approvals/:id/decide",
  async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = req.body;

    if (!b?.decision || !b?.approver_id) {
      return reply.code(400).send({ error: "missing_required_fields" });
    }

    const row = await pool.query(
      `SELECT id, correlation_id, status FROM approvals WHERE id = $1::uuid`,
      [id]
    );
    if (row.rowCount === 0)
      return reply.code(404).send({ error: "approval_not_found" });

    const approval = row.rows[0] as {
      id: string;
      correlation_id: string;
      status: string;
    };
    if (approval.status !== "requested") {
      return reply
        .code(409)
        .send({ error: "approval_not_pending", status: approval.status });
    }

    await pool.query(
      `UPDATE approvals
     SET status = $2, decided_at = now(), decided_by = $3, decision_reason = $4
     WHERE id = $1::uuid`,
      [id, b.decision, b.approver_id, b.reason ?? null]
    );

    // Emit approval.decided
    await appendAuditEvent({
      correlation_id: approval.correlation_id,
      actor_type: "human",
      actor_id: b.approver_id,
      action_type: "approval.decided",
      tool: "approvals",
      resource: { approval_id: id },
      payload_redacted: { reason: b.reason ?? null },
      decision: b.decision,
    });

    // For follow-on events, try to preserve original context (tool/resource/action)
    const ctx = await getActionRequestedContext(approval.correlation_id);

    if (b.decision === "approved") {
      await appendAuditEvent({
        correlation_id: approval.correlation_id,
        actor_type: "human",
        actor_id: b.approver_id,
        action_type: "action.executed",
        tool: ctx?.tool ?? "approvals",
        resource: ctx?.resource ?? { approval_id: id },
        payload_redacted: { note: "stub_execution_after_approval" },
        decision: "success",
      });

      return {
        status: "executed",
        approval_id: id,
        correlation_id: approval.correlation_id,
      };
    }

    await appendAuditEvent({
      correlation_id: approval.correlation_id,
      actor_type: "human",
      actor_id: b.approver_id,
      action_type: "action.blocked",
      tool: ctx?.tool ?? "approvals",
      resource: ctx?.resource ?? { approval_id: id },
      payload_redacted: {
        note: "blocked_by_approver",
        reason: b.reason ?? null,
      },
      decision: "denied",
    });

    return reply.code(403).send({
      status: "denied",
      approval_id: id,
      correlation_id: approval.correlation_id,
    });
  }
);

/**
 * =========================
 * Startup
 * =========================
 */
async function main() {
  app.log.info({
    msg: "startup",
    database_url: (DATABASE_URL ?? "").replace(/:(?:[^:@]+)@/, ":***@"),
    port: PORT,
  });

  // Fail fast if DB auth/connect is broken
  const r = await pool.query<{
    current_user: string;
    current_database: string;
  }>("SELECT current_user, current_database();");

  if (r.rowCount !== 1) {
    throw new Error("db_check_failed: unexpected_rowcount");
  }

  app.log.info({
    msg: "db_ok",
    user: r.rows[0]!.current_user,
    database: r.rows[0]!.current_database,
  });

  await app.listen({ port: PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
