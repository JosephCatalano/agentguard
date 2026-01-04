import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

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

export default async function ActionTimelinePage({
  params,
}: {
  params: { correlation_id?: string } | Promise<{ correlation_id?: string }>;
}) {
  const p = await Promise.resolve(params);
  const correlationId = p?.correlation_id;
  if (!correlationId || correlationId === "undefined") notFound();

  const timeline = await apiGet<{
    correlation_id: string;
    events: AuditEvent[];
    returned: number;
  }>(`http://localhost:3001/actions/${correlationId}`);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <Link href="/" style={{ display: "inline-block", marginBottom: 16 }}>
        ← Home
      </Link>

      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Action timeline</h1>
      <div style={{ marginBottom: 16, color: "#666" }}>
        correlation_id: <code>{timeline.correlation_id}</code>
      </div>

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
