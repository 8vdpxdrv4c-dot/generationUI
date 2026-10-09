// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NextRequest } from "next/server";
import { POST } from "../route";
import { GET } from "@/app/view/[id]/route";
import { getView } from "../store";

vi.mock("@/app/api/history/store", () => ({ getAsset: () => undefined }));
let testDir: string;
beforeEach(() => { testDir = mkdtempSync(join(tmpdir(), "ogui-view-test-")); vi.stubEnv("HISTORY_DATA_DIR", testDir); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); rmSync(testDir, { recursive: true, force: true }); });

const post = (body: unknown) => POST(new NextRequest("http://localhost/api/view", { method: "POST", body: JSON.stringify(body) }));
const get = (id: string, pending = false) => GET(new NextRequest(`http://localhost/view/${id}${pending ? "?pending=1" : ""}`), { params: Promise.resolve({ id }) });

it("serves a waiting page at the preallocated address, then the exact latest snapshot", async () => {
  vi.useFakeTimers();
  const id = crypto.randomUUID();
  const waiting = await get(id, true);
  expect(waiting.status).toBe(200);
  expect(waiting.headers.get("cache-control")).toBe("no-store");
  expect(await waiting.text()).toContain("正在同步最新编辑内容");
  expect((await get(id)).status).toBe(404);
  const html = "<!doctype html><main>刚提交的编辑内容</main>";
  const stored = await post({ id, html });
  expect(await stored.json()).toEqual({ id });
  const ready = await get(id);
  expect(ready.status).toBe(200);
  expect(await ready.text()).toBe(html);
  expect(await (await get(id, true)).text()).toBe(html);
});

it("does not allow a preview address to be overwritten and preserves legacy callers", async () => {
  vi.useFakeTimers();
  const legacy = await post({ html: "<p>原始页面</p>" });
  const { id } = await legacy.json();
  expect(typeof id).toBe("string");
  expect((await post({ id, html: "<p>覆盖页面</p>" })).status).toBe(409);
  expect(getView(id)).toBe("<p>原始页面</p>");
  expect((await post({ id: "bad-id", html: "<p>test</p>" })).status).toBe(400);
  expect((await get("bad-id", true)).status).toBe(404);
});

it("survives route module reloads and expires after 24 hours", async () => {
  const { id } = await (await post({ html: "<p>刷新后仍可查看</p>" })).json();
  vi.resetModules();
  const reloaded = await import("../store");
  expect(reloaded.getView(id)).toBe("<p>刷新后仍可查看</p>");
  const expired = new Date(Date.now() - 24 * 60 * 60 * 1000 - 1000);
  utimesSync(join(testDir, "views", `${id}.html`), expired, expired);
  expect(reloaded.getView(id)).toBeUndefined();
});
