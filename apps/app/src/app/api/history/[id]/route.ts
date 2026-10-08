import { NextRequest, NextResponse } from "next/server";
import { deleteAsset, getAsset, renameAsset } from "../store";
import { toAssetMeta } from "@/lib/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — asset metadata plus version summaries.
 *
 * Pass `?version=N` to also receive that version's full source, which is what
 * "重新设计" needs to hand the agent a baseline. Without it the payload stays
 * light (the sidebar only needs the summaries).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const asset = getAsset(id);
  if (!asset) {
    return NextResponse.json({ error: "该设计不存在" }, { status: 404 });
  }

  const meta = toAssetMeta(asset);
  const raw = req.nextUrl.searchParams.get("version");
  if (raw === null) {
    return NextResponse.json({ item: meta });
  }

  const wanted = Number.parseInt(raw, 10);
  const version = Number.isFinite(wanted)
    ? asset.versions.find((entry) => entry.version === wanted)
    : asset.versions[asset.versions.length - 1];
  if (!version) {
    return NextResponse.json({ error: "该版本不存在" }, { status: 404 });
  }
  return NextResponse.json({ item: meta, version });
}

/** PATCH — rename an asset */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { title } = (body ?? {}) as { title?: unknown };
  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const asset = renameAsset(id, title);
  if (!asset) {
    return NextResponse.json({ error: "该设计不存在" }, { status: 404 });
  }
  return NextResponse.json({ item: toAssetMeta(asset) });
}

/** DELETE — drop an asset and all of its versions */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!deleteAsset(id)) {
    return NextResponse.json({ error: "该设计不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
