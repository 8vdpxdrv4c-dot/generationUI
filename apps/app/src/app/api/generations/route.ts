import { NextRequest, NextResponse } from "next/server";
import { generationSessionTitle, type GenerationSession } from "@/lib/generations";
import { listGenerationSessions, saveGenerationSession } from "./store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SESSION_BYTES = 16 * 1024 * 1024;
const MAX_MESSAGES = 2_000;

export async function GET() {
  return NextResponse.json({ items: listGenerationSessions() });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid session" }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "";
  const messages = Array.isArray(record.messages) ? record.messages : null;
  if (!/^[\w-]{1,100}$/.test(id) || !messages || messages.length > MAX_MESSAGES) {
    return NextResponse.json({ error: "invalid session" }, { status: 400 });
  }
  if (JSON.stringify(messages).length > MAX_SESSION_BYTES) {
    return NextResponse.json({ error: "session too large" }, { status: 413 });
  }

  const status: GenerationSession["status"] = record.status === "running" ? "running" : "complete";
  const session = saveGenerationSession({
    id,
    title: typeof record.title === "string" ? record.title : generationSessionTitle(messages),
    status,
    messages,
  });
  return NextResponse.json({ item: session });
}
