"use client";

import { useContext } from "react";
import { createPortal } from "react-dom";
import { useRenderToolCall, type CopilotChatToolCallsViewProps } from "@copilotkit/react-core/v2";
import { COMPONENT_PREVIEW_LABELS, GenerationPreviewContext } from "./open-generative-ui/preview-context";

/** Route built-in React components to the same preview pane as generated HTML. */
export function GenerationToolCallsView({ message, messages = [] }: CopilotChatToolCallsViewProps) {
  const renderToolCall = useRenderToolCall();
  const preview = useContext(GenerationPreviewContext);
  return <>{message.toolCalls?.map(call => {
    const result = messages.find(item => item.role === "tool" && item.toolCallId === call.id);
    const rendered = renderToolCall({ toolCall: call, toolMessage: result?.role === "tool" ? result : undefined });
    const label = COMPONENT_PREVIEW_LABELS[call.function.name];
    if (!preview || !label) return <div key={call.id}>{rendered}</div>;
    const id = `tool:${call.id}`;
    const selected = preview.selectedId === id;
    return <div key={call.id}>
      <button type="button" className="my-2 rounded-lg border px-3 py-2 text-xs" aria-pressed={selected} onClick={() => preview.onSelect(id)}>
        {label} · {selected ? "正在右侧预览" : "查看预览"}
      </button>
      {selected && preview.target && createPortal(rendered, preview.target, id)}
    </div>;
  })}</>;
}
