import { NextRequest, NextResponse } from "next/server";
import { appendVersion, getAsset } from "../../store";
import { toAssetMeta, type DesignSource } from "@/lib/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — append a new version to an existing asset.
 *
 * This is how a redesign lands: the frontend pairs the finished page with the
 * request that produced it and files both under the same asset, so versions
 * form a chain instead of piling up as unrelated entries.
 */
export async function POST(
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

  const record = (body ?? {}) as Record<string, unknown>;
  const raw = record.source;
  let source: DesignSource | null = null;
  if (raw && typeof raw === "object") {
    const candidate = raw as Record<string, unknown>;
    if (candidate.format === "sandboxed-ui") {
      source = {
        format: "sandboxed-ui",
        css: typeof candidate.css === "string" ? candidate.css : "",
        html: typeof candidate.html === "string" ? candidate.html : "",
        jsFunctions:
          typeof candidate.jsFunctions === "string" ? candidate.jsFunctions : "",
        jsExpressions: Array.isArray(candidate.jsExpressions)
          ? candidate.jsExpressions.filter((e): e is string => typeof e === "string")
          : [],
      };
    } else if (candidate.format === "standalone" && typeof candidate.html === "string") {
      source = { format: "standalone", html: candidate.html };
    }
  }

  if (!source) {
    return NextResponse.json(
      { error: "source is required" },
      { status: 400 }
    );
  }

  const version = appendVersion(id, {
    source,
    title: typeof record.title === "string" ? record.title : undefined,
    requirement: typeof record.requirement === "string" ? record.requirement : undefined,
    componentType:
      typeof record.componentType === "string" ? record.componentType : undefined,
  });
  if (!version) {
    return NextResponse.json(
      { error: "该设计不存在，或页面源码过大" },
      { status: 404 }
    );
  }

  return NextResponse.json({ version: { id: version.id, version: version.version } }, { status: 201 });
}

/** GET — the asset's metadata, handy for a quick refresh after a write. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const asset = getAsset(id);
  if (!asset) {
    return NextResponse.json({ error: "该设计不存在" }, { status: 404 });
  }
  return NextResponse.json({ item: toAssetMeta(asset) });
}
