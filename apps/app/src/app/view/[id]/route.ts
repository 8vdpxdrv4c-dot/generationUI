import { NextRequest, NextResponse } from "next/server";
import { getView, isViewId } from "@/app/api/view/store";
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

const PREPARING = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>正在准备页面预览</title></head>
<body style="font-family:system-ui,sans-serif;display:grid;place-content:center;gap:16px;min-height:100vh;margin:0;text-align:center;color:#475569">
  <p id="status" role="status">正在同步最新编辑内容并准备页面预览…</p>
  <button id="retry" hidden onclick="location.reload()">重新加载</button>
  <noscript>请启用 JavaScript，或稍后刷新此页。</noscript>
  <script>
  (() => {
    const deadline = Date.now() + 30000;
    async function check() {
      try {
        const response = await fetch(location.pathname, { cache: "no-store", signal: AbortSignal.timeout(5000) });
        if (response.ok) { location.replace(location.pathname); return; }
      } catch {}
      if (Date.now() >= deadline) {
        document.getElementById("status").textContent = "预览尚未就绪，请回到编辑页面检查提示并重试查看。";
        document.getElementById("retry").hidden = false;
        return;
      }
      setTimeout(check, 500);
    }
    check();
  })();
  </script>
</body></html>`;

const HTML_HEADERS = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };

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
 * Persistent saved assets take priority, followed by temporary 24h snapshots.
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
      headers: HTML_HEADERS,
    });
  }

  const html = getView(id);
  if (!html) {
    if (isViewId(id) && req.nextUrl.searchParams.get("pending") === "1") {
      return new NextResponse(PREPARING, { headers: HTML_HEADERS });
    }
    return new NextResponse(NOT_FOUND, {
      status: 404,
      headers: HTML_HEADERS,
    });
  }
  return new NextResponse(html, {
    headers: HTML_HEADERS,
  });
}
