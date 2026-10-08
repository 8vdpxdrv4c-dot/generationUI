import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendVersion,
  deleteAsset,
  getAsset,
  getAssetSource,
  listAssets,
  renameAsset,
  saveAsset,
} from "../store";
import {
  formatRelativeTime,
  guessTitleFromHtml,
  sourceBytes,
  type DesignSource,
} from "@/lib/history";
import { splitStandaloneSource } from "@/lib/history/split-standalone";
import { assembleStandaloneHtmlFromActivity } from "@/components/generative-ui/export-utils";

const PAGE_H1 = `<h1>销售看板</h1><div class="card">hi</div>`;
const PAGE_WING = `<div class="wing-header">三号线大屏</div>`;

function source(html: string, css = ".card{color:red}", js = "function boot(){}"): DesignSource {
  return { format: "sandboxed-ui", css, html, jsFunctions: js, jsExpressions: ["boot();"] };
}

let dir = "";

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ogui-history-"));
  process.env.HISTORY_DATA_DIR = dir;
});

afterAll(() => {
  delete process.env.HISTORY_DATA_DIR;
  if (dir) rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  for (const name of ["history.json", "history.json.corrupt"]) {
    const target = join(dir, name);
    if (existsSync(target)) rmSync(target, { force: true });
  }
});

describe("guessTitleFromHtml", () => {
  it("prefers h1, then the wing header, then <title>", () => {
    expect(guessTitleFromHtml(PAGE_H1)).toBe("销售看板");
    expect(guessTitleFromHtml(PAGE_WING)).toBe("三号线大屏");
    expect(guessTitleFromHtml("<html><head><title>纯标题</title></head></html>")).toBe("纯标题");
  });

  it("falls back when there is nothing to read", () => {
    expect(guessTitleFromHtml("<div></div>")).toBe("未命名页面");
    expect(guessTitleFromHtml(undefined)).toBe("未命名页面");
  });
});

describe("formatRelativeTime", () => {
  it("labels recent saves in Chinese", () => {
    const now = Date.parse("2026-09-23T12:00:00Z");
    expect(formatRelativeTime("2026-09-23T11:59:40Z", now)).toBe("刚刚");
    expect(formatRelativeTime("2026-09-23T11:30:00Z", now)).toBe("30 分钟前");
    expect(formatRelativeTime("2026-09-23T09:00:00Z", now)).toBe("3 小时前");
  });
});

describe("splitStandaloneSource", () => {
  it("round-trips an assembled page back to its separated source", () => {
    const original = source(PAGE_H1, ".card { color: red }", "function boot() { go(); }");
    const standalone = assembleStandaloneHtmlFromActivity(
      {
        css: original.format === "sandboxed-ui" ? original.css : "",
        html: [PAGE_H1],
        jsFunctions: original.format === "sandboxed-ui" ? original.jsFunctions : "",
        jsExpressions: original.format === "sandboxed-ui" ? original.jsExpressions : [],
      },
      "销售看板"
    );

    const recovered = splitStandaloneSource(standalone);
    expect(recovered.format).toBe("sandboxed-ui");
    if (recovered.format !== "sandboxed-ui") return;
    expect(recovered.html).toBe(PAGE_H1);
    expect(recovered.css).toBe(".card { color: red }");
    expect(recovered.jsFunctions).toBe("function boot() { go(); }");
    expect(recovered.jsExpressions).toEqual(["boot();"]);
    // The design-system bundle must NOT leak into the recovered css.
    expect(recovered.css).not.toContain("--space-1");
  });

  it("leaves foreign documents opaque", () => {
    const chart = `<!DOCTYPE html><html><head><style>body{margin:0}</style></head><body><canvas id="chart"></canvas></body></html>`;
    const result = splitStandaloneSource(chart);
    expect(result.format).toBe("standalone");
    expect(result.format === "standalone" && result.html).toBe(chart);
  });
});

describe("design asset store", () => {
  it("saves a page, guesses its title and lists metadata without the source", () => {
    const asset = saveAsset({ source: source(PAGE_H1), requirement: "做一个销售看板" });
    expect(asset).not.toBeNull();
    expect(asset?.title).toBe("销售看板");
    expect(asset?.versions).toHaveLength(1);

    const items = listAssets();
    expect(items).toHaveLength(1);
    expect(items[0]).not.toHaveProperty("source");
    expect(items[0].versionCount).toBe(1);
    expect(items[0].currentVersion).toBe(1);
    expect(items[0].versions[0].requirement).toBe("做一个销售看板");
    expect(items[0].bytes).toBe(sourceBytes(source(PAGE_H1)));

    const stored = getAssetSource(asset!.id);
    expect(stored?.format).toBe("sandboxed-ui");
    expect(stored?.format === "sandboxed-ui" && stored.html).toBe(PAGE_H1);
  });

  it("keeps an explicit title, trims it, and rejects an oversized page", () => {
    const named = saveAsset({ source: source(PAGE_WING), title: "  大屏首页  " });
    expect(named?.title).toBe("大屏首页");
    const huge = source("x".repeat(4 * 1024 * 1024 + 1));
    expect(saveAsset({ source: huge })).toBeNull();
  });

  it("appends versions in order and records each request", () => {
    const asset = saveAsset({ source: source(PAGE_H1, ".a{}"), requirement: "第一版" })!;
    const v2 = appendVersion(asset.id, { source: source(PAGE_H1, ".b{}"), requirement: "把颜色改深" });
    expect(v2?.version).toBe(2);

    const v3 = appendVersion(asset.id, { source: source(PAGE_H1, ".c{}"), requirement: "加圆角" });
    expect(v3?.version).toBe(3);

    const meta = listAssets()[0];
    expect(meta.versionCount).toBe(3);
    expect(meta.currentVersion).toBe(3);
    expect(meta.versions.map((v) => v.requirement)).toEqual(["第一版", "把颜色改深", "加圆角"]);
    // Old versions stay reachable by number.
    const first = getAssetSource(asset.id, 1);
    expect(first?.format === "sandboxed-ui" && first.css).toBe(".a{}");
  });

  it("does not pile up a duplicate version for an identical page", () => {
    const asset = saveAsset({ source: source(PAGE_H1), requirement: "初版" })!;
    const again = appendVersion(asset.id, { source: source(PAGE_H1), requirement: "没改动" });
    expect(again?.version).toBe(1);
    expect(listAssets()[0].versionCount).toBe(1);
    // An unchanged page keeps its original intent: the new request was never
    // applied, so recording it would claim a change that did not happen.
    expect(listAssets()[0].versions[0].requirement).toBe("初版");
  });

  it("refreshes an existing asset when the same page is saved again", () => {
    const first = saveAsset({ source: source(PAGE_WING), title: "大屏首页" })!;
    const again = saveAsset({ source: source(PAGE_WING), title: "大屏首页（改名）" });
    expect(again?.id).toBe(first.id);
    expect(listAssets()).toHaveLength(1);
    expect(listAssets()[0].title).toBe("大屏首页（改名）");
  });

  it("renames and deletes assets", () => {
    const asset = saveAsset({ source: source(PAGE_H1), title: "待删" })!;
    expect(renameAsset(asset.id, "改名后")?.title).toBe("改名后");
    expect(renameAsset("missing-id", "x")).toBeUndefined();
    expect(deleteAsset(asset.id)).toBe(true);
    expect(deleteAsset(asset.id)).toBe(false);
    expect(getAsset(asset.id)).toBeUndefined();
  });

  it("writes through to disk and picks up external edits", async () => {
    saveAsset({ source: source(PAGE_H1), title: "A" });
    saveAsset({ source: source(PAGE_WING), title: "B" });

    const file = join(dir, "history.json");
    expect(existsSync(file)).toBe(true);
    const onDisk = JSON.parse(readFileSync(file, "utf8"));
    expect(onDisk.schema).toBe(2);
    expect(onDisk.assets).toHaveLength(2);

    await new Promise((resolve) => setTimeout(resolve, 30));
    writeFileSync(file, JSON.stringify({ schema: 2, assets: [onDisk.assets[0]] }), "utf8");
    expect(listAssets()).toHaveLength(1);
  });

  it("migrates a schema-1 array of standalone pages into versioned assets", () => {
    // A record written by the previous store: one assembled standalone page.
    const standalone = assembleStandaloneHtmlFromActivity(
      { css: ".legacy{color:blue}", html: [PAGE_H1], jsFunctions: "", jsExpressions: [] },
      "旧记录"
    );
    const file = join(dir, "history.json");
    writeFileSync(
      file,
      JSON.stringify([
        {
          id: "legacy-1",
          title: "旧记录",
          html: standalone,
          componentType: "openGenUI",
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      ]),
      "utf8"
    );

    const items = listAssets();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("legacy-1");
    expect(items[0].versionCount).toBe(1);

    // Recovered as separated source, with the design-system CSS dropped.
    const recovered = getAssetSource("legacy-1");
    expect(recovered?.format).toBe("sandboxed-ui");
    expect(recovered?.format === "sandboxed-ui" && recovered.css).toBe(".legacy{color:blue}");

    // Appending works on a migrated asset too.
    expect(appendVersion("legacy-1", { source: source(PAGE_H1), requirement: "改一版" })?.version).toBe(2);
  });

  it("recovers from a corrupt store file instead of throwing", async () => {
    const file = join(dir, "history.json");
    await new Promise((resolve) => setTimeout(resolve, 30));
    writeFileSync(file, "{ not json", "utf8");
    expect(listAssets()).toEqual([]);
    expect(existsSync(`${file}.corrupt`)).toBe(true);
  });
});
