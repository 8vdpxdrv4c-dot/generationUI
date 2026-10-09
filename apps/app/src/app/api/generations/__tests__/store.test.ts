import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getGenerationSession, saveGenerationSession } from "../store";

let dir: string;
let previousDir: string | undefined;
beforeEach(() => {
  previousDir = process.env.HISTORY_DATA_DIR;
  dir = mkdtempSync(join(tmpdir(), "ogui-generations-"));
  process.env.HISTORY_DATA_DIR = dir;
});
afterEach(() => {
  if (previousDir === undefined) delete process.env.HISTORY_DATA_DIR;
  else process.env.HISTORY_DATA_DIR = previousDir;
  rmSync(dir, { recursive: true, force: true });
});
const user = { id: "user", role: "user", content: "立方体" };
const complete = { id: "page", role: "activity", content: {
  generating: false, htmlComplete: true, html: ["<canvas></canvas>"],
  jsFunctions: "async function init() {}", jsExpressions: ["init()"],
} };
function save(messages: unknown[], status: "running" | "complete" = "complete") {
  return saveGenerationSession({ id: "test", title: "test", status, messages });
}
describe("generation persistence", () => {
  it("saves manual edits and rejects stale revisions without replacing generated JS", () => {
    save([user, complete]);
    const latest = { ...complete, content: { ...complete.content, editedHtml: "<canvas style='translate:10px 20px'></canvas>", editRevision: 2 } };
    expect(save([user, latest]).messages[1]).toEqual(latest);
    save([user, { ...latest, content: { ...latest.content, editedHtml: "old", editRevision: 1 } }]);
    save([user, complete]);
    expect(getGenerationSession("test")?.messages[1]).toEqual(latest);
  });
  it("rejects empty and stale thread clones without losing completed history", () => {
    save([user, complete]);
    save([], "running");
    save([user], "running");
    expect(getGenerationSession("test")?.messages).toEqual([user, complete]);
    expect(getGenerationSession("test")?.status).toBe("complete");
  });
  it("retains JS when an older partial activity arrives after the final save", () => {
    save([user, complete]);
    save([user, { id: "page", role: "activity", content: { generating: true, html: ["<canvas>"] } }]);
    expect(getGenerationSession("test")?.messages[1]).toEqual(complete);
  });
  it("accepts a new conversation turn and complete source", () => {
    save([user]);
    save([user, complete]);
    const followup = { id: "followup", role: "user", content: "改变颜色" };
    expect(save([user, complete, followup], "running").messages).toEqual([user, complete, followup]);
  });
  it("accepts final snapshots that prune intermediate tool results", () => {
    save([user, { id: "tool-result", role: "tool", content: "skill" }], "running");
    expect(save([user, complete]).messages).toEqual([user, complete]);
  });
  it("allows the canonical final snapshot to repair a completed record missing JS", () => {
    save([user, { ...complete, content: { generating: false, htmlComplete: true, html: ["<canvas></canvas>"] } }]);
    expect(save([user, complete]).messages[1]).toEqual(complete);
  });
});
