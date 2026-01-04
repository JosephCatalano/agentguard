export default function Home() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>AgentGuard</h1>
      <p style={{ color: "#555", marginBottom: 20 }}>
        Demo UI for approvals and action timelines.
      </p>

      <div style={{ display: "grid", gap: 12, maxWidth: 520 }}>
        <a
          href="/approvals"
          style={{
            display: "block",
            padding: 16,
            border: "1px solid #ddd",
            borderRadius: 10,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div style={{ fontWeight: 700 }}>Approvals</div>
          <div style={{ marginTop: 6, color: "#666" }}>
            Review pending approvals and approve/deny.
          </div>
        </a>

        <a
          href="/submit"
          style={{
            display: "block",
            padding: 16,
            border: "1px solid #ddd",
            borderRadius: 10,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div style={{ fontWeight: 700 }}>Submit Action</div>
          <div style={{ marginTop: 6, color: "#666" }}>
            Create a new action request (triggers policy + approvals).
          </div>
        </a>
      </div>
    </main>
  );
}
