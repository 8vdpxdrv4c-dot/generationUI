import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { serializedSaver, useGenerationEditor } from "../use-generation-editor";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function fixture() {
  const agent = {
    isRunning: false, state: {} as Record<string, unknown>,
    messages: [{ id: "page", role: "activity", activityType: "open-generative-ui", content: { html: ["<h1>旧标题</h1>"], generating: false } }],
    setMessages: vi.fn(function (messages) { agent.messages = messages; }),
    setState: vi.fn(function (state) { agent.state = state; }),
  };
  const typed = agent as unknown as Parameters<typeof useGenerationEditor>[0];
  const ready = { current: { agent: typed, id: "session" } };
  const session = { id: "session", title: "test", messages: [], status: "complete" as const, createdAt: "", updatedAt: "" };
  const hook = renderHook(() => useGenerationEditor(typed, "session", session, ready, "page"));
  return { agent, ...hook };
}

describe("edit persistence and prompt submission", () => {
  it("flushes active text before saving and selecting the next AI baseline", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetch);
    const { agent, result } = fixture();
    act(() => { result.current.editing.register("page", { flush: async () => {
      result.current.editing.commit("page", { kind: "text", node: "0", index: 0, before: "旧标题", value: "最新标题" });
    } }); });
    await act(async () => { await result.current.beforeSubmit(); });
    const payload = JSON.parse(fetch.mock.calls.at(-1)![1].body);
    expect(payload.messages[0].content.editedHtml).toBe("<h1>最新标题</h1>");
    expect(payload.messages[0].content.editRevision).toBe(1);
    expect(agent.state.selected_generated_ui_id).toBe("page");
    expect(agent.state.current_generated_ui).toEqual({ id: "page", content: { html: ["<h1>最新标题</h1>"], generating: false } });
    expect(result.current.editing.saveState).toBe("saved");
  });
  it("retains edited source after save failure and retries it", async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetch);
    const { agent, result } = fixture();
    act(() => result.current.editing.commit("page", { kind: "text", node: "0", index: 0, before: "旧标题", value: "保留草稿" }));
    await act(async () => { await expect(result.current.beforeSubmit()).rejects.toThrow(); });
    expect(result.current.editing.saveState).toBe("error");
    expect((agent.messages[0].content as { editedHtml?: string }).editedHtml).toContain("保留草稿");
    await act(async () => { await result.current.beforeSubmit(); });
    expect(result.current.editing.saveState).toBe("saved");
  });
  it("serializes requests and continues after failure", async () => {
    let release!: () => void;
    const first = new Promise<void>(resolve => { release = resolve; });
    const write = vi.fn().mockImplementationOnce(() => first).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const save = serializedSaver(write);
    const one = save("one"); const two = save("two"); const three = save("three");
    await Promise.resolve(); await Promise.resolve();
    expect(write.mock.calls.map(call => call[0])).toEqual(["one"]);
    release(); await one; await expect(two).rejects.toThrow("offline"); await three;
    expect(write.mock.calls.map(call => call[0])).toEqual(["one", "two", "three"]);
  });
});
