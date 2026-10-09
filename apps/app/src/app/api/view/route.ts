import { NextRequest, NextResponse } from "next/server";
import { getView, isViewId, saveView } from "./store";

export const runtime = "nodejs";

/** POST — store a generated widget's standalone HTML, return its view id */
export async function POST(req: NextRequest) {
  let html: unknown;
  let requestedId: unknown;
  try {
    const body = await req.json();
    html = body.html;
    requestedId = body.id;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (typeof html !== "string" || !html.trim()) {
    return NextResponse.json({ error: "html is required" }, { status: 400 });
  }

  if (requestedId !== undefined && !isViewId(requestedId)) {
    return NextResponse.json({ error: "invalid view id" }, { status: 400 });
  }
  if (typeof requestedId === "string" && getView(requestedId) !== undefined) {
    return NextResponse.json({ error: "view already exists" }, { status: 409 });
  }

  let id: string | null;
  try { id = saveView(html, requestedId as string | undefined); }
  catch { return NextResponse.json({ error: "preview storage unavailable" }, { status: 500 }); }
  if (!id) {
    return NextResponse.json({ error: "html too large" }, { status: 413 });
  }

  return NextResponse.json({ id });
}
