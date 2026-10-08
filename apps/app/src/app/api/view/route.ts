import { NextRequest, NextResponse } from "next/server";
import { saveView } from "./store";

/** POST — store a generated widget's standalone HTML, return its view id */
export async function POST(req: NextRequest) {
  let html: unknown;
  try {
    const body = await req.json();
    html = body.html;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (typeof html !== "string" || !html.trim()) {
    return NextResponse.json({ error: "html is required" }, { status: 400 });
  }

  const id = saveView(html);
  if (!id) {
    return NextResponse.json({ error: "html too large" }, { status: 413 });
  }

  return NextResponse.json({ id });
}
