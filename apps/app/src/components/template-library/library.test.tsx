import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UIReference } from "./types";

const mock = vi.hoisted(() => ({
  agent: { state: {} as Record<string, unknown>, setState: vi.fn(), runAgent: vi.fn() },
  useAgent: vi.fn(),
  core: { runtimeConnectionStatus: "connected", subscribe: () => ({ unsubscribe() {} }) },
}));
vi.mock("@copilotkit/react-core/v2", () => ({ useAgent: (options: unknown) => { mock.useAgent(options); return { agent: mock.agent }; }, useCopilotKit: () => ({ copilotkit: mock.core }) }));
vi.mock("./template-card", () => ({ TemplateCard: (props: { id: string; name: string; selected?: boolean; onApply: (id: string) => void }) => <button aria-pressed={props.selected} onClick={() => props.onApply(props.id)}>{props.name}</button> }));

import { TemplateLibrary } from "./index";
import { HomeTemplateGallery } from "../home-template-gallery";
import { TemplateChip } from "./template-chip";
import { mergeReferences, referenceKind } from "./types";
import dashboards from "@/data/dashboard-templates.json";

beforeEach(() => { vi.clearAllMocks(); mock.agent.state = { templates: [], unrelated: "keep" }; });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("separate reference libraries", () => {
  it("reflects the selection in both libraries, preserves the draft, and brings the composer into view", () => {
    vi.useFakeTimers();
    const scroll = vi.fn();
    const view = render(<><textarea data-testid="copilot-chat-textarea" defaultValue="使用我的业务数据" /><HomeTemplateGallery onOpenLibrary={vi.fn()} /><TemplateLibrary open onClose={vi.fn()} /></>);
    const textarea = screen.getByTestId("copilot-chat-textarea") as HTMLTextAreaElement;
    textarea.scrollIntoView = scroll;
    fireEvent.click(screen.getAllByRole("button", { name: dashboards[0].name })[0]);
    mock.agent.state = mock.agent.setState.mock.calls[0][0];
    view.rerender(<><textarea data-testid="copilot-chat-textarea" defaultValue="使用我的业务数据" /><HomeTemplateGallery onOpenLibrary={vi.fn()} /><TemplateLibrary open onClose={vi.fn()} /></>);
    expect(screen.getAllByRole("button", { name: dashboards[0].name }).every(button => button.getAttribute("aria-pressed") === "true")).toBe(true);
    act(() => vi.advanceTimersByTime(100));
    expect(scroll).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
    expect(document.activeElement).toBe(textarea);
    expect(textarea.value).toBe("使用我的业务数据");
    mock.agent.state = { ...mock.agent.state, pending_template: null };
    view.rerender(<HomeTemplateGallery onOpenLibrary={vi.fn()} />);
    expect(screen.getByRole("button", { name: dashboards[0].name }).getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps the selected chip visible when the composer mounts late or is replaced", async () => {
    mock.agent.state.pending_template = { id: dashboards[0].id, name: dashboards[0].name, kind: "page" };
    render(<TemplateChip />);
    const column = document.createElement("div");
    const textarea = document.createElement("textarea");
    textarea.setAttribute("data-testid", "copilot-chat-textarea");
    column.append(textarea);
    document.body.append(column);
    try {
      await waitFor(() => expect(column.querySelector('[data-template-chip]')?.textContent).toContain(dashboards[0].name));
      const replacement = document.createElement("div");
      replacement.append(textarea.cloneNode());
      column.replaceChildren(replacement);
      await waitFor(() => expect(replacement.querySelector('[data-template-chip]')?.textContent).toContain("已加入"));
      expect(screen.getAllByRole("status")).toHaveLength(1);
    } finally {
      column.remove();
    }
  });
  it("keeps image order and preview metadata after selecting a built-in", () => {
    const seeds = dashboards.map((item) => ({ ...item, kind: "page" as const }));
    const merged = mergeReferences(seeds, [{ ...seeds[1], name: "已保存的电商模板" }]);
    expect(merged.map((item) => item.id)).toEqual(seeds.map((item) => item.id));
    expect(merged[1].name).toBe("已保存的电商模板");
    expect(merged[1].preview_width).toBe(1440);
  });
  it.each(dashboards)("attaches $name with its full reference source from the homepage", (template) => {
    render(<HomeTemplateGallery onOpenLibrary={vi.fn()} threadId="dashboard-thread" />);
    fireEvent.click(screen.getByText(template.name));
    const update = mock.agent.setState.mock.calls[0][0];
    expect(update.pending_template).toEqual({ id: template.id, name: template.name, kind: "page" });
    expect(update.templates[0].html).toBe(template.html);
    expect(update.unrelated).toBe("keep");
    expect(mock.agent.runAgent).not.toHaveBeenCalled();
  });
  it("filters official charts and attaches their source to the conversation", () => {
    render(<TemplateLibrary open onClose={vi.fn()} kind="component" />);
    fireEvent.click(screen.getByRole("button", { name: "面积图" }));
    expect(screen.queryByText("饼图 · 环形")).toBeNull();
    fireEvent.click(screen.getByText("面积图 · 渐变"));
    const update = mock.agent.setState.mock.calls[0][0];
    expect(update.pending_template.kind).toBe("component");
    expect(update.templates.find((item: UIReference) => item.id === update.pending_template.id)).toEqual(expect.objectContaining({ source: expect.stringContaining("recharts") }));
    expect(mock.agent.runAgent).not.toHaveBeenCalled();
  });
  it("shows full pages only in the template library and home recommendations", () => {
    const view = render(<TemplateLibrary open onClose={vi.fn()} kind="page" />);
    expect(screen.getByText("业绩仪表盘")).toBeTruthy();
    expect(screen.queryByText("天气卡片")).toBeNull();
    view.unmount();
    render(<HomeTemplateGallery onOpenLibrary={vi.fn()} />);
    expect(screen.getByText("业绩仪表盘")).toBeTruthy();
    expect(screen.queryByText("发票卡片")).toBeNull();
  });

  it("selects a component without sending, clearing input, or losing current state", () => {
    const close = vi.fn();
    render(<><textarea data-testid="copilot-chat-textarea" defaultValue="放到右侧" /><TemplateLibrary open onClose={close} kind="component" threadId="current-thread" /></>);
    expect(screen.queryByText("业绩仪表盘")).toBeNull();
    fireEvent.click(screen.getByText("天气卡片"));
    expect(mock.agent.setState).toHaveBeenCalledWith(expect.objectContaining({
      unrelated: "keep", pending_template: { id: "seed-weather-001", name: "天气卡片", kind: "component" },
    }));
    expect(mock.useAgent).toHaveBeenCalledWith({ threadId: "current-thread" });
    expect(mock.agent.runAgent).not.toHaveBeenCalled();
    expect((screen.getByTestId("copilot-chat-textarea") as HTMLTextAreaElement).value).toBe("放到右侧");
    expect(close).toHaveBeenCalledOnce();
  });

  it("keeps saved components out of pages, and attaches the page kind", () => {
    const saved: UIReference = { id: "saved", name: "小卡片", description: "", html: "", data_description: "", version: 1, kind: "component" };
    mock.agent.state.templates = [saved];
    render(<TemplateLibrary open onClose={vi.fn()} kind="page" />);
    expect(screen.queryByText("小卡片")).toBeNull();
    fireEvent.click(screen.getByText("业绩仪表盘"));
    const update = mock.agent.setState.mock.calls[0][0];
    expect(update.pending_template.kind).toBe("page");
    expect(update.templates).toContainEqual(saved);
  });

  it("labels and dismisses the selected component reference", () => {
    mock.agent.state.pending_template = { id: "seed-weather-001", name: "天气卡片", kind: "component" };
    render(<TemplateChip />);
    expect(screen.getByText("组件参考：天气卡片")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "移除参考" }));
    expect(mock.agent.setState).toHaveBeenCalledWith(expect.objectContaining({ pending_template: null, unrelated: "keep" }));
  });

  it("classifies older records without removing them", () => {
    expect(referenceKind({ id: "seed-invoice-001" })).toBe("component");
    expect(referenceKind({ id: "chart", component_type: "barChart" })).toBe("component");
    expect(referenceKind({ id: "legacy" })).toBe("page");
    expect(referenceKind({ id: "legacy", kind: "component" })).toBe("component");
  });
});
