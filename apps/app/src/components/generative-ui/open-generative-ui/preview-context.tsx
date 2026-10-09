"use client";

import { createContext } from "react";
import type { PageEdit } from "./editor-source";

export interface PreviewEditorControls {
  flush: () => Promise<void>;
}

export interface PreviewEditing {
  isRunning: boolean;
  saveState: "idle" | "saving" | "saved" | "error";
  commit: (messageId: string, edit: PageEdit) => void;
  register: (messageId: string, controls: PreviewEditorControls) => () => void;
  retry: () => void;
}

export const GenerationPreviewContext = createContext<{
  target: HTMLElement | null;
  actionsTarget?: HTMLElement | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  editing?: PreviewEditing;
} | null>(null);

export const COMPONENT_PREVIEW_LABELS: Record<string, string> = {
  weatherCard: "实时天气", pueGauge: "PUE 仪表盘", pieChart: "饼图", barChart: "柱状图",
};

export function latestPreviewMessageId(messages: readonly unknown[]): string | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index] as { id?: string; activityType?: string; toolCalls?: { id: string; function: { name: string } }[] };
    if (message?.activityType === "open-generative-ui" && message.id) return message.id;
    const call = message?.toolCalls?.findLast(call => COMPONENT_PREVIEW_LABELS[call.function.name]);
    if (call) return `tool:${call.id}`;
  }
  return null;
}
