import { afterEach, describe, expect, it, vi } from "vitest";
import { EXECUTION_MESSAGE_TYPE, runSandboxExpression } from "../sandbox-execution";
import type { SandboxInstance } from "../websandbox-loader";
import { SANDBOX_RUNTIME_JS } from "../sandbox-runtime";

afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ""; });

function fixture() {
  const iframe = document.createElement("iframe"); document.body.appendChild(iframe);
  const sandbox = { iframe, run: vi.fn().mockResolvedValue(undefined), promise: Promise.resolve(), destroy: vi.fn() } satisfies SandboxInstance;
  const signal = new AbortController();
  const reply = (ok: boolean, source: Window | null = iframe.contentWindow) => {
    const code = sandbox.run.mock.calls[0][0] as string;
    const id = code.match(/id:("[^"]+")/)![1];
    window.dispatchEvent(new MessageEvent("message", { source, data: { type: EXECUTION_MESSAGE_TYPE, id: JSON.parse(id), ok, error: "import failed" } }));
  };
  return { sandbox, signal, reply };
}

describe("sandbox Promise acknowledgement", () => {
  it("does not finish at script insertion or accept another frame's acknowledgement", async () => {
    const { sandbox, signal, reply } = fixture();
    const done = vi.fn();
    const pending = runSandboxExpression(sandbox, "init().catch(showError);", signal.signal).then(done);
    await Promise.resolve(); expect(done).not.toHaveBeenCalled();
    reply(true, window); await Promise.resolve(); expect(done).not.toHaveBeenCalled();
    reply(true); await pending; expect(done).toHaveBeenCalledOnce();
    expect(sandbox.run.mock.calls[0][0]).toContain("return (0, eval)");
  });
  it("rejects initialization errors and aborts on frame replacement", async () => {
    const { sandbox, signal, reply } = fixture();
    const failed = runSandboxExpression(sandbox, "init();", signal.signal);
    reply(false); await expect(failed).rejects.toThrow("import failed");
    const aborted = runSandboxExpression(sandbox, "init();", signal.signal);
    signal.abort(); await expect(aborted).rejects.toMatchObject({ name: "AbortError" });
  });
  it("times out without leaving a pending initialization forever", async () => {
    vi.useFakeTimers();
    const { sandbox, signal } = fixture();
    const failed = expect(runSandboxExpression(sandbox, "init();", signal.signal)).rejects.toThrow("超时");
    await vi.advanceTimersByTimeAsync(45000); await failed;
    expect(vi.getTimerCount()).toBe(0);
  });
});

it("bounds backing store allocation and cancels resources at disposal", () => {
  const iframe = document.createElement("iframe"); document.body.appendChild(iframe);
  const frame = iframe.contentWindow! as Window & typeof globalThis;
  const cancel = vi.fn(), disconnect = vi.fn(), loseContext = vi.fn();
  const viewport = vi.fn();
  class GL { viewport = undefined; }
  Object.assign(GL.prototype, { viewport, getParameter: () => null, FRAMEBUFFER_BINDING: 1,
    drawingBufferWidth: 2048, drawingBufferHeight: 1024 });
  Object.assign(frame, { WebGLRenderingContext: GL });
  frame.requestAnimationFrame = vi.fn(() => 7); frame.cancelAnimationFrame = cancel;
  class Observer { observe() {} disconnect() { disconnect(); } }
  Object.assign(frame, { ResizeObserver: Observer, MutationObserver: Observer, IntersectionObserver: Observer });
  frame.HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ getExtension: () => ({ loseContext }) })) as never;
  frame.eval(SANDBOX_RUNTIME_JS);
  frame.eval("WebGLRenderingContext.prototype.viewport(0, 0, 8000, 4000)");
  expect(viewport).toHaveBeenCalledWith(0, 0, 2048, 1024);
  const canvas = frame.document.createElement("canvas");
  canvas.width = 1e9; canvas.height = 1e9;
  expect(canvas.width * canvas.height).toBe(2048 * 2048);
  canvas.getContext("webgl");
  frame.requestAnimationFrame(() => {});
  new frame.ResizeObserver(() => {}).observe(canvas);
  frame.eval("window.__oguiDispose(); window.__oguiDispose();");
  expect(cancel).toHaveBeenCalledOnce(); expect(disconnect).toHaveBeenCalledOnce(); expect(loseContext).toHaveBeenCalledOnce();
  expect(frame.requestAnimationFrame(() => {})).toBe(0);
});
