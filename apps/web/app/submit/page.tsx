import Link from "next/link";

export const dynamic = "force-dynamic";

export default function SubmitPage() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <Link href="/" style={{ display: "inline-block", marginBottom: 16 }}>
        ← Home
      </Link>

      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Submit action</h1>
      <p style={{ color: "#555", marginBottom: 18 }}>
        Submits an action request to the API. External email domains should
        trigger approval.
      </p>

      <form
        method="post"
        action="/submit/send-email"
        style={{
          display: "grid",
          gap: 12,
          maxWidth: 520,
          padding: 16,
          border: "1px solid #ddd",
          borderRadius: 10,
        }}
      >
        <label style={{ display: "grid", gap: 6 }}>
          <span>To</span>
          <input
            name="to"
            defaultValue="someone@outside.com"
            style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Subject (redacted)</span>
          <input
            name="subject"
            defaultValue="[redacted]"
            style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Actor ID</span>
          <input
            name="actor_id"
            defaultValue="demo-agent"
            style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
          />
        </label>

        <button type="submit" style={{ padding: "10px 14px" }}>
          Submit email.send
        </button>

        <div style={{ color: "#666" }}>
          After submit, you’ll be redirected to the action timeline.
        </div>
      </form>
    </main>
  );
}
