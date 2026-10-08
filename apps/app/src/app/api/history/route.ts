import { NextRequest, NextResponse } from "next/server";
import { listAssets, saveAsset } from "./store";
import { toAssetMeta, type DesignSource } from "@/lib/history";
import { splitStandaloneSource } from "@/lib/history/split-standalone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Accept either the separated source, or a legacy standalone document. */
function coerceSource(body: Record<string, unknown>): DesignSource | null {
  const raw = body.source;
  if (raw && typeof raw === "object") {
    const source = raw as Record<string, unknown>;
    if (source.format === "sandboxed-ui") {
      return {
        format: "sandboxed-ui",
        css: typeof source.css === "string" ? source.css : "",
        html: typeof source.html === "string" ? source.html : "",
        jsFunctions: typeof source.jsFunctions === "string" ? source.jsFunctions : "",
        jsExpressions: Array.isArray(source.jsExpressions)
          ? source.jsExpressions.filter((e): e is string => typeof e === "string")
          : [],
      };
    }
    if (source.format === "standalone" && typeof source.html === "string") {
      return { format: "standalone", html: source.html };
    }
  }
  // Legacy payload: an assembled standalone page.
  if (typeof body.html === "string" && body.html.trim()) {
    return splitStandaloneSource(body.html);
  }
  return null;
}

/** GET — list saved design assets (metadata only, newest first) */
export async function GET() {
  return NextResponse.json({ items: listAssets() });
}

/** POST — save a page as a new asset, return its metadata */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const record = (body ?? {}) as Record<string, unknown>;
  const source = coerceSource(record);
  if (!source) {
    return NextResponse.json(
      { error: "source (or html) is required" },
      { status: 400 }
    );
  }

  const asset = saveAsset({
    source,
    title: typeof record.title === "string" ? record.title : undefined,
    requirement: typeof record.requirement === "string" ? record.requirement : undefined,
    componentType:
      typeof record.componentType === "string" ? record.componentType : undefined,
  });
  if (!asset) {
    return NextResponse.json({ error: "page source too large" }, { status: 413 });
  }

  return NextResponse.json({ item: toAssetMeta(asset) }, { status: 201 });
}
