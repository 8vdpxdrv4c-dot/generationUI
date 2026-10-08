import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenerationPreviewContext, latestPreviewMessageId } from "../open-generative-ui/preview-context";

vi.mock("@copilotkit/react-core/v2", () => ({ useRenderToolCall: () => ({ toolCall }: { toolCall: { function: { name: string } } }) => <div>{toolCall.function.name} result</div> }));
import { GenerationToolCallsView } from "../generation-tool-calls";

afterEach(cleanup);
const call = { id: "weather", type: "function" as const, function: { name: "weatherCard", arguments: '{"city":"北京"}' } };
const message = { id: "assistant", role: "assistant" as const, content: "", toolCalls: [call] };

describe("component previews", () => {
  it("selects the latest native component or HTML activity in chronological order", () => {
    const html = { id: "html", activityType: "open-generative-ui" };
    const plan = { toolCalls: [{ id: "plan", function: { name: "plan_visualization" } }] };
    expect(latestPreviewMessageId([html, message, plan])).toBe("tool:weather");
    expect(latestPreviewMessageId([message, html])).toBe("html");
  });
  it("ports only the selected weather card and keeps other tools in the chat", () => {
    const target = document.createElement("div");
    document.body.append(target);
    const select = vi.fn();
    const element = (selectedId: string) => <GenerationPreviewContext.Provider value={{ target, selectedId, onSelect: select }}><GenerationToolCallsView message={message} /></GenerationPreviewContext.Provider>;
    try {
      const view = render(element("other"));
      expect(target.textContent).toBe("");
      fireEvent.click(screen.getByRole("button", { name: "实时天气 · 查看预览" }));
      expect(select).toHaveBeenCalledWith("tool:weather");
      view.rerender(element("tool:weather"));
      expect(target.textContent).toBe("weatherCard result");
      expect(screen.getByRole("button", { name: "实时天气 · 正在右侧预览" }).getAttribute("aria-pressed")).toBe("true");
      view.rerender(element("other"));
      expect(target.textContent).toBe("");
    } finally { target.remove(); }
  });
});
