import { describe, expect, it } from "vitest";
import { shouldRestoreGenerationMessages } from "../generations";

const user = { id: "request", role: "user" };
const original = { id: "preview-v1", role: "activity" };
const revised = { id: "preview-v2", role: "activity" };

describe("saved generation restoration", () => {
  it("restores a revised saved preview over the runtime's nonempty old clone", () => {
    expect(shouldRestoreGenerationMessages([user, original], [user, original, revised], false)).toBe(true);
  });
  it("restores the old snapshot while connecting and preserves active streamed content", () => {
    expect(shouldRestoreGenerationMessages([user, original], [user, original, revised], true)).toBe(true);
    const partial = { id: "response", role: "assistant", content: "new partial output" };
    expect(shouldRestoreGenerationMessages([user, original, partial],
      [user, original, { ...partial, content: "older output" }, revised], true)).toBe(false);
    expect(shouldRestoreGenerationMessages([user, original, partial],
      [user, original, revised], true)).toBe(false);
  });
  it("preserves a new user turn or preview that has not been saved yet", () => {
    expect(shouldRestoreGenerationMessages([user, original, { id: "new-request", role: "user" }],
      [user, original, revised], false)).toBe(false);
    expect(shouldRestoreGenerationMessages([user, original, { id: "new-preview", role: "activity" }],
      [user, original, revised], false)).toBe(false);
  });
  it("ignores tool-result pruning when restoring a newer page", () => {
    expect(shouldRestoreGenerationMessages([user, original, { id: "tool", role: "tool" }],
      [user, original, revised], false)).toBe(true);
  });
  it("does not restore identical durable history on every render", () => {
    expect(shouldRestoreGenerationMessages([user, original], [user, original], false)).toBe(false);
  });
  it("hydrates an empty idle thread and leaves an empty saved history alone", () => {
    expect(shouldRestoreGenerationMessages([], [user, original], false)).toBe(true);
    expect(shouldRestoreGenerationMessages([], [user, original], true)).toBe(true);
    expect(shouldRestoreGenerationMessages([], [], false)).toBe(false);
  });
});
