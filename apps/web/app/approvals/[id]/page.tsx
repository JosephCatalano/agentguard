import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type Approval = {
  id: string;
  correlation_id: string;
  status: "requested" | "approved" | "denied" | "expired";
  requested_at: string;
  requested_by: string;
  decided_at: string | null;
  decided_by: string | null;
  decision_reason: string | null;
};

type AuditEvent = {
  id: string;
  ts: string;
  actor_type: string;
  actor_id: string;
  action_type: string;
  tool: string;
  resource: unknown;
  payload_redacted: unknown;
  decision: string;
  prev_hash: string | null;
  hash: string;
  correlation_id: string;
};

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${url} failed: ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

export default async function ApprovalDetailPage({
  params,
}: {
  // Works across Next/Turbopack behaviors where params may be async-ish
  params: { id?: string } | Promise<{ id?: string }>;
}) {
  const p = await Promise.resolve(params);
  const id = p?.id;

  if (!id || id === "undefined") notFound();

  const approval = await apiGet<Approval>(
    `http://localhost:3001/approvals/${id}`
  );

  const timeline = await apiGet<{
    correlation_id: string;
    events: AuditEvent[];
    returned: number;
  }>(`http://localhost:3001/actions/${approval.correlation_id}`);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <a
        href="/approvals"
        style={{ display: "inline-block", marginBottom: 16 }}
      >
        ← Back to approvals
      </a>

      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Approval</h1>

      <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 10 }}>
        <div>
          <b>id:</b> <code>{approval.id}</code>
        </div>
        <div style={{ marginTop: 6 }}>
          <b>status:</b> <code>{approval.status}</code>
        </div>
        <div style={{ marginTop: 6 }}>
          <b>requested_by:</b> <code>{approval.requested_by}</code>
        </div>
        <div style={{ marginTop: 6 }}>
          <b>requested_at:</b> <code>{approval.requested_at}</code>
        </div>
        <div style={{ marginTop: 6 }}>
          <b>correlation_id:</b> <code>{approval.correlation_id}</code>
        </div>
        <div style={{ marginTop: 6 }}>
          <b>decision_reason:</b>{" "}
          <code>{approval.decision_reason ?? "null"}</code>
        </div>
      </div>

      <div
        style={{
          marginTop: 18,
          padding: 16,
          border: "1px solid #ddd",
          borderRadius: 10,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Decide</h2>

        {/* These forms POST to Next route handlers:
            /approvals/[id]/approve and /approvals/[id]/deny */}
        <form
          method="post"
          action={`/approvals/${approval.id}/approve`}
          style={{ display: "inline-block", marginRight: 8 }}
        >
          <button type="submit" style={{ padding: "10px 14px" }}>
            Approve
          </button>
        </form>

        <form
          method="post"
          action={`/approvals/${approval.id}/deny`}
          style={{ display: "inline-block" }}
        >
          <button type="submit" style={{ padding: "10px 14px" }}>
            Deny
          </button>
        </form>

        <p style={{ marginTop: 12, color: "#555" }}>
          After clicking, you’ll be redirected back here and the timeline will
          update.
        </p>
      </div>

      <h2 style={{ marginTop: 24 }}>Action timeline</h2>

      <div style={{ display: "grid", gap: 10 }}>
        {timeline.events.map((e) => (
          <div
            key={e.id}
            style={{ padding: 14, border: "1px solid #eee", borderRadius: 10 }}
          >
            <div style={{ fontWeight: 700 }}>{e.action_type}</div>

            <div style={{ marginTop: 6 }}>
              <b>ts:</b> <code>{e.ts}</code>
            </div>

            <div style={{ marginTop: 6 }}>
              <b>actor:</b>{" "}
              <code>
                {e.actor_type}:{e.actor_id}
              </code>
            </div>

            <div style={{ marginTop: 6 }}>
              <b>tool:</b> <code>{e.tool}</code>
            </div>

            <div style={{ marginTop: 6 }}>
              <b>decision:</b> <code>{e.decision}</code>
            </div>

            <details style={{ marginTop: 8 }}>
              <summary>resource + payload</summary>
              <pre style={{ whiteSpace: "pre-wrap" }}>
                {JSON.stringify(
                  {
                    resource: e.resource,
                    payload_redacted: e.payload_redacted,
                  },
                  null,
                  2
                )}
              </pre>
            </details>
          </div>
        ))}
      </div>
    </main>
  );
}
