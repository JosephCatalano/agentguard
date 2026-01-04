import Link from "next/link";

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

async function fetchApprovals(): Promise<Approval[]> {
  const res = await fetch(
    "http://localhost:3001/approvals?status=requested&limit=50",
    { cache: "no-store" }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to load approvals: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { items: Approval[] };
  return data.items;
}

export default async function ApprovalsPage() {
  const approvals = await fetchApprovals();

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>Pending approvals</h1>
      <p style={{ marginBottom: 24, color: "#555" }}>
        Showing approvals with status <code>requested</code>.
      </p>

      {approvals.length === 0 ? (
        <div
          style={{ padding: 16, border: "1px solid #eee", borderRadius: 10 }}
        >
          No pending approvals.
          <div style={{ marginTop: 10, color: "#666" }}>
            Create one by POSTing to <code>/actions/submit</code> with an
            external email domain.
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {approvals.map((a) => (
            <Link
              key={a.id}
              href={`/approvals/${a.id}`}
              style={{
                display: "block",
                padding: 16,
                border: "1px solid #ddd",
                borderRadius: 10,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ fontWeight: 700 }}>{a.id}</div>

              <div style={{ marginTop: 8, color: "#444" }}>
                requested_by: <code>{a.requested_by}</code>
              </div>

              <div style={{ marginTop: 6, color: "#444" }}>
                requested_at: <code>{a.requested_at}</code>
              </div>

              <div style={{ marginTop: 6 }}>
                status: <code>{a.status}</code>
              </div>

              <div style={{ marginTop: 6, color: "#666" }}>
                correlation_id: <code>{a.correlation_id}</code>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
