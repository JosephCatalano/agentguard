import { NextResponse } from "next/server";

export async function POST(
  _req: Request,
  ctx: { params: { id?: string } | Promise<{ id?: string }> }
) {
  const p = await Promise.resolve(ctx.params);
  const id = p?.id;

  if (!id || id === "undefined") {
    return NextResponse.json({ error: "missing_approval_id" }, { status: 400 });
  }

  const body = {
    decision: "denied",
    approver_id: "manager-1",
    reason: "Denied via UI",
  };

  const res = await fetch(`http://localhost:3001/approvals/${id}/decide`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  // Deny will likely come back as 403 from the API — that's expected.
  // We still redirect so the timeline shows the decision + blocked event.
  if (!res.ok && res.status !== 403) {
    const text = await res.text();
    return NextResponse.json(
      { error: "api_failed", status: res.status, body: text },
      { status: 500 }
    );
  }

  return NextResponse.redirect(
    new URL(`/approvals/${id}`, "http://localhost:3000")
  );
}
