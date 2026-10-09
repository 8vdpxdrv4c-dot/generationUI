import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorToolbar } from "../editor-toolbar";
import type { EditorSelection, EditorSnapshot } from "../editor-source";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const selection: EditorSelection = { node: "1", tag: "h1", kind: "text", resizable: true, width: 200, height: 50, lockRatio: true,
  styles: { "font-size": "30px", "font-weight": "400", "font-style": "normal", color: "rgb(25, 50, 75)" } };
const snapshot = (node = selection): EditorSnapshot => ({ selection: node, canUndo: true, canRedo: false });

describe("contextual editor toolbar", () => {
  it("commits font changes on blur, cancels with Escape and exposes type-specific tools", () => {
    const command = vi.fn().mockResolvedValue(undefined);
    const view = render(<EditorToolbar snapshot={snapshot()} command={command} disabled={false} />);
    const size = view.getByLabelText("字号");
    fireEvent.focus(size); fireEvent.change(size, { target: { value: "42" } }); fireEvent.blur(size);
    expect(command).toHaveBeenCalledWith({ kind: "patch", node: "1", styles: { "font-size": "42px" } });
    command.mockClear();
    fireEvent.focus(size); fireEvent.change(size, { target: { value: "90" } }); fireEvent.keyDown(size, { key: "Escape" }); fireEvent.blur(size);
    expect(command).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole("button", { name: "加粗" }));
    expect(command).toHaveBeenCalledWith({ kind: "patch", node: "1", styles: { "font-weight": "700" } });
    expect(view.queryByRole("button", { name: "替换图片" })).toBeNull();
    view.rerender(<EditorToolbar snapshot={snapshot({ ...selection, kind: "scene" })} command={command} disabled={false} />);
    expect(view.queryByLabelText("字号")).toBeNull();
    expect(view.getByLabelText("绘制场景仅支持整体移动")).not.toBeNull();
  });
  it("tracks image uploads so a pending replacement can be flushed before submission", async () => {
    let finish!: (value: unknown) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise(resolve => { finish = resolve; })));
    const command = vi.fn().mockResolvedValue(undefined), onPending = vi.fn();
    const view = render(<EditorToolbar snapshot={snapshot({ ...selection, kind: "image", tag: "img" })} command={command} disabled={false} onPending={onPending} />);
    fireEvent.change(view.getByLabelText("上传替换图片"), { target: { files: [new File(["image"], "test.png", { type: "image/png" })] } });
    expect(onPending).toHaveBeenCalledOnce(); expect(command).not.toHaveBeenCalled();
    await act(async () => { finish({ ok: true, json: async () => ({ path: "/upload/new.png", url: "http://0.0.0.0:3000/upload/new.png", mimeType: "image/png" }) }); await onPending.mock.calls[0][0]; });
    expect(command).toHaveBeenCalledWith({ kind: "image", node: "1", src: new URL("/upload/new.png", window.location.origin).href });
  });
  it("does not replace a newly selected image when an old upload completes", async () => {
    let finish!: (value: unknown) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise(resolve => { finish = resolve; })));
    const command = vi.fn().mockResolvedValue(undefined);
    const view = render(<EditorToolbar snapshot={snapshot({ ...selection, kind: "image" })} command={command} disabled={false} />);
    fireEvent.change(view.getByLabelText("上传替换图片"), { target: { files: [new File(["image"], "test.png")] } });
    view.rerender(<EditorToolbar snapshot={snapshot({ ...selection, node: "2", kind: "image" })} command={command} disabled={false} />);
    await act(async () => { finish({ ok: true, json: async () => ({ url: "/upload/new.png", mimeType: "image/png" }) }); });
    expect(command).not.toHaveBeenCalled(); expect(view.getByRole("alert").textContent).toContain("选择已变化");
  });
});
