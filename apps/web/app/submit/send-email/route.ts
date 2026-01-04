import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const form = await req.formData();

  const to = String(form.get("to") ?? "");
  const subject = String(form.get("subject") ?? "[redacted]");
  const actorId = String(form.get("actor_id") ?? "demo-agent");

  if (!to) {
    return NextResponse.json({ error: "missing_to" }, { status: 400 });
  }

  const body = {
    actor_type: "agent",
    actor_id: actorId,
    tool: "gmail",
    action: "email.send",
    resource: { to },
    payload_redacted: { subject },
  };

  const res = await fetch("http://localhost:3001/actions/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: "api_failed", status: res.status, body: text },
      { status: 500 }
    );
  }

  const data = (await res.json()) as { correlation_id: string };

  return NextResponse.redirect(
    new URL(`/actions/${data.correlation_id}`, "http://localhost:3000")
  );
}
