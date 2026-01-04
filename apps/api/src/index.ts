import Fastify from "fastify";
import crypto from "node:crypto";
import pg from "pg";

const { Pool } = pg;

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://agentguard:agentguard@localhost:5433/agentguard";

const poolConfig = {
  connectionString: DATABASE_URL,
};

const app = Fastify({ logger: true });

const pool = new Pool(poolConfig);

pool.on("connect", (client) => {
  app.log.info({ msg: "db_connected", client_pid: (client as any)?.processID });
});

pool.on("error", (err, client) => {
  app.log.error({ msg: "db_pool_error", error: err });
});

app.get("/health", async () => ({ ok: true }));

type AppendBody = {
  actor_type: string;
  actor_id: string;
  action_type: string;
  tool: string;
  resource?: unknown;
  payload_redacted?: unknown;
  decision: string;
};

function canonicalJson(obj: unknown): string {
  // Stable-ish canonicalization: stringify with sorted keys.
  // Good enough for MVP; we can replace with RFC8785 canonical JSON later.
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

app.post<{ Body: AppendBody }>("/audit/append", async (req) => {
  const body = req.body;
  const tsIso = new Date().toISOString();

  // Get previous hash (latest event)
  const prev = await pool.query<{ hash: string }>(
    "SELECT hash FROM audit_events ORDER BY ts DESC LIMIT 1"
  );
  const prev_hash = prev.rows[0]?.hash ?? null;

  const eventForHash = {
    ts: tsIso,
    actor_type: body.actor_type,
    actor_id: body.actor_id,
    action_type: body.action_type,
    tool: body.tool,
    resource: body.resource ?? {},
    payload_redacted: body.payload_redacted ?? {},
    decision: body.decision,
    prev_hash,
  };

  const hash = sha256Hex((prev_hash ?? "") + canonicalJson(eventForHash));

  const inserted = await pool.query(
    `INSERT INTO audit_events
    (ts, actor_type, actor_id, action_type, tool, resource, payload_redacted, decision, prev_hash, hash)
   VALUES ($1::timestamptz,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10)
   RETURNING id, ts, prev_hash, hash`,
    [
      tsIso,
      body.actor_type,
      body.actor_id,
      body.action_type,
      body.tool,
      JSON.stringify(body.resource ?? {}),
      JSON.stringify(body.payload_redacted ?? {}),
      body.decision,
      prev_hash,
      hash,
    ]
  );
  return inserted.rows[0];
});

app.get("/audit/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const r = await pool.query("SELECT * FROM audit_events WHERE id = $1", [id]);
  if (r.rowCount === 0) {
    return reply.code(404).send({ error: "not_found" });
  }
  return r.rows[0];
});

(async () => {
  try {
    app.log.info({
      msg: "startup",
      database_url: (DATABASE_URL ?? "").replace(/:(?:[^:@]+)@/, ":***@"),
    });

    // Quick DB check to surface auth/connect errors at startup
    try {
      const r = await pool.query("SELECT current_user, current_database();");
      app.log.info({
        msg: "db_ok",
        user: r.rows[0].current_user,
        database: r.rows[0].current_database,
      });
    } catch (dbErr) {
      app.log.error({ msg: "db_check_failed", error: dbErr });
      throw dbErr;
    }

    await app.listen({ port: 3001, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
})().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
