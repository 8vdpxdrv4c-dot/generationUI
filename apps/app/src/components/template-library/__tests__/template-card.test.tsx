import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TemplateCard } from "../template-card";

vi.mock("../../shadcn-charts", () => ({ ShadcnChartPreview: () => null }));

let resize: (() => void) | undefined;
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resize = undefined; });

describe("dashboard thumbnails", () => {
  it("shows an explicit selected action and remains a non-submitting button", () => {
    const apply = vi.fn();
    const props = { id: "test", name: "测试模板", description: "", html: "", dataDescription: "", version: 1, onApply: apply };
    const view = render(<form><TemplateCard {...props} /></form>);
    const button = screen.getByRole("button", { name: "加入当前对话" });
    expect(button.getAttribute("type")).toBe("button");
    fireEvent.click(button);
    expect(apply).toHaveBeenCalledWith("test");
    view.rerender(<form><TemplateCard {...props} selected /></form>);
    expect(screen.getByRole("button", { name: "✓ 已加入当前对话" }).getAttribute("aria-pressed")).toBe("true");
    view.rerender(<TemplateCard {...props} applyDisabled />);
    const connecting = screen.getByRole("button", { name: "正在连接会话…" }) as HTMLButtonElement;
    expect(connecting.disabled).toBe(true);
    fireEvent.click(connecting);
    expect(apply).toHaveBeenCalledOnce();
  });
  it("fits the complete page after its content grows and ignores foreign or unbounded size reports", () => {
    render(<TemplateCard id="seed-dashboard-test" name="完整大屏" description="" html="<main>页面内容</main>"
      dataDescription="" version={1} previewWidth={1440} previewHeight={980} onApply={vi.fn()} />);
    const iframe = screen.getByTitle("Preview: 完整大屏") as HTMLIFrameElement;
    Object.defineProperties(iframe.parentElement!, {
      clientWidth: { value: 224, configurable: true },
      clientHeight: { value: 112, configurable: true },
    });
    act(() => resize?.());
    expect(iframe.style.height).toBe("980px");
    const report = (source: MessageEventSource | null, height: number) => act(() => {
      window.dispatchEvent(new MessageEvent("message", { source, data: { type: "template-preview-size", height } }));
    });
    report(window, 1400);
    expect(iframe.style.height).toBe("980px");
    report(iframe.contentWindow, 1400);
    expect(iframe.style.height).toBe("1400px");
    expect(iframe.style.transform).toBe("scale(0.08)");
    report(iframe.contentWindow, 50_000);
    report(iframe.contentWindow, Number.NaN);
    expect(iframe.style.height).toBe("1400px");
  });
});
