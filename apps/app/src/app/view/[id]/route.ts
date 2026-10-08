import { NextRequest, NextResponse } from "next/server";
import { getView } from "@/app/api/view/store";
import { getAsset } from "@/app/api/history/store";
import { assembleStandaloneHtmlFromActivity } from "@/components/generative-ui/export-utils";
import type { DesignSource } from "@/lib/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_FOUND = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#888;font-size:14px">
  该预览已过期或不存在
</body>
</html>`;

/**
 * Assets store the page's separated source (matching the generateSandboxedUi
 * contract); a standalone document is assembled on the fly for viewing.
 */
function renderSource(source: DesignSource, title: string, moduleOrigin: string): string {
  if (source.format === "standalone") return source.html;
  return assembleStandaloneHtmlFromActivity(
    {
      css: source.css,
      html: source.html ? [source.html] : [],
      jsFunctions: source.jsFunctions,
      jsExpressions: source.jsExpressions,
    },
    title,
    moduleOrigin,
  );
}

/**
 * GET — serve a saved page as a full document.
 *
 * `?v=N` picks a specific version; without it the current version is served.
 * The in-memory view store is checked first (ephemeral shares from 新窗口打开),
 * then the persistent asset store, so a saved page keeps working across
 * restarts and browsers.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const asset = getAsset(id);
  if (asset && asset.versions.length > 0) {
    const raw = req.nextUrl.searchParams.get("v");
    const wanted = raw === null ? Number.NaN : Number.parseInt(raw, 10);
    const version = Number.isFinite(wanted)
      ? asset.versions.find((entry) => entry.version === wanted)
      : asset.versions[asset.versions.length - 1];
    const target = version ?? asset.versions[asset.versions.length - 1];
    return new NextResponse(renderSource(target.source, asset.title, req.nextUrl.origin), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const html = getView(id);
  if (!html) {
    return new NextResponse(NOT_FOUND, {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
