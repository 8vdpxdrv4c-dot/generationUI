import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const agent = vi.hoisted(() => ({ state: { templates: [{ id: "existing" }] }, setState: vi.fn() }));
vi.mock("@copilotkit/react-core/v2", () => ({ useAgent: () => ({ agent }) }));
import { ExportOverlay } from "../export-overlay";
import { GenerationPreviewContext } from "../open-generative-ui/preview-context";

beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); });

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
    expect(actionsTarget.querySelectorAll("button")).toHaveLength(3);
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
