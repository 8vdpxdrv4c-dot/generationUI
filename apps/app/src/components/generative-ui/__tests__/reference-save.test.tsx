import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const agent = vi.hoisted(() => ({ state: { templates: [{ id: "existing" }] }, setState: vi.fn() }));
vi.mock("@copilotkit/react-core/v2", () => ({ useAgent: () => ({ agent }) }));
import { ExportOverlay } from "../export-overlay";
import { GenerationPreviewContext } from "../open-generative-ui/preview-context";

beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each([
  ["保存为页面模板", "page"],
  ["保存为组件", "component"],
])("%s saves the explicit reference kind without removing existing entries", (label, kind) => {
  render(<ExportOverlay title="我的结果" html="<main>test</main>" componentType="openGenUI"><div>结果</div></ExportOverlay>);
  fireEvent.click(screen.getByTitle("选项"));
  fireEvent.click(screen.getByRole("button", { name: label }));
  expect(agent.setState).toHaveBeenCalledOnce();
  const update = agent.setState.mock.calls[0][0];
  expect(update.templates[0]).toEqual({ id: "existing" });
  expect(update.templates[1]).toMatchObject({ name: "我的结果", kind, html: "<main>test</main>" });
});

it("only offers component saving for a native chart", () => {
  render(<ExportOverlay title="图表" componentType="barChart" componentData={{ title: "图表", description: "", data: [{ label: "A", value: 1 }] }}><div>图表</div></ExportOverlay>);
  fireEvent.click(screen.getByTitle("选项"));
  expect(screen.queryByRole("button", { name: "保存为页面模板" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "保存为组件" }));
  expect(agent.setState.mock.calls[0][0].templates[1]).toMatchObject({ kind: "component", component_type: "barChart" });
});

it("renders ready preview actions in the header and removes them when the preview unmounts", () => {
  const actionsTarget = document.createElement("div");
  document.body.append(actionsTarget);
  const element = (ready: boolean) => (
    <GenerationPreviewContext.Provider value={{ target: null, actionsTarget, selectedId: "page", onSelect: vi.fn() }}>
      <ExportOverlay title="页面" html="<main>test</main>" componentType="openGenUI" ready={ready}>
        <div data-testid="preview-content">结果</div>
      </ExportOverlay>
    </GenerationPreviewContext.Provider>
  );
  try {
    const view = render(element(false));
    const content = view.getByTestId("preview-content");
    expect(actionsTarget.querySelectorAll("button")).toHaveLength(0);
    view.rerender(element(true));
    expect(actionsTarget.querySelectorAll("button, a[role=button]")).toHaveLength(3);
    expect(view.container.querySelector("button")).toBeNull();
    expect(view.getByTestId("preview-content")).toBe(content);
    const menu = screen.getByTitle("选项");
    expect(menu.parentElement?.parentElement?.className).toContain("opacity-100");
    fireEvent.click(menu);
    expect(actionsTarget.textContent).toContain("下载文件");
    view.unmount();
    expect(actionsTarget.textContent).toBe("");
  } finally {
    actionsTarget.remove();
  }
});

it("prepares a real view link before clicking and stores freshly committed edits without a popup handle", async () => {
  let finish!: () => void;
  const preparing = new Promise<void>(resolve => { finish = resolve; });
  const prepareExport = vi.fn(async () => {
    await preparing;
    return { source: { format: "standalone" as const, html: "<main>最新文字</main>" }, html: "<main>最新文字</main>" };
  });
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
  const popup = vi.spyOn(window, "open").mockReturnValue(null);
  render(<ExportOverlay title="页面" html="<main>旧文字</main>" componentType="openGenUI" prepareExport={prepareExport}><div>结果</div></ExportOverlay>);
  const link = screen.getByRole("button", { name: "查看页面" });
  const href = link.getAttribute("href")!;
  expect(href).toMatch(/^\/view\/[0-9a-f-]{36}\?pending=1$/);
  expect(link.getAttribute("target")).toBe("_blank");
  fireEvent.click(link);
  expect(prepareExport).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "准备预览…" }).getAttribute("aria-disabled")).toBe("true");
  expect(link.getAttribute("href")).toBe(href);
  expect(fetchMock).not.toHaveBeenCalled();
  await act(async () => { finish(); await preparing; });
  expect(popup).not.toHaveBeenCalled();
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ id: href.split("/").pop()!.split("?")[0], html: "<main>最新文字</main>" });
  expect(screen.getByRole("button", { name: "查看页面" }).getAttribute("href")).not.toBe(href);
});

it("reports preview synchronization failure and retries with a new snapshot address", async () => {
  const prepareExport = vi.fn().mockRejectedValueOnce(new Error("flush failed")).mockResolvedValue({ source: { format: "standalone", html: "<p>恢复</p>" }, html: "<p>恢复</p>" });
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
  render(<ExportOverlay title="页面" html="<p>原文</p>" componentType="openGenUI" prepareExport={prepareExport}><div>结果</div></ExportOverlay>);
  const initialHref = screen.getByRole("button", { name: "查看页面" }).getAttribute("href");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "查看页面" })); });
  expect(screen.getByRole("alert").textContent).toContain("预览生成失败");
  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "重试查看" }).getAttribute("href")).not.toBe(initialHref);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "重试查看" })); });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(fetchMock).toHaveBeenCalledOnce();
});
