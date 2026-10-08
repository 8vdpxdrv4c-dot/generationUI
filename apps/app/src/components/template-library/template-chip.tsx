"use client";

import { useSyncExternalStore, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useConversationAgent } from "@/hooks/use-conversation-agent";
import { referenceKind, type ReferenceKind } from "./types";

/** Each mounted chip owns its portal. Rebind when CopilotKit replaces its input. */
function createChipContainerStore(active: boolean) {
  let container: HTMLElement | null = null;
  return {
    getSnapshot: () => container,
    subscribe: (notify: () => void) => {
      if (!active) return () => {};
      const sync = () => {
        const textarea = document.querySelector<HTMLElement>('[data-testid="copilot-chat-textarea"]');
        const column = textarea?.parentElement;
        if (container?.isConnected && container.parentElement === column) return;
        container?.remove();
        container = null;
        if (column && textarea) {
          container = document.createElement("div");
          container.setAttribute("data-template-chip", "");
          container.style.cssText = "display: flex; flex-wrap: wrap; min-width: 0; padding: 4px 0 0 0;";
          column.insertBefore(container, textarea);
        }
        notify();
      };
      sync();
      const observer = new MutationObserver(sync);
      observer.observe(document.body, { childList: true, subtree: true });
      return () => {
        observer.disconnect();
        container?.remove();
        container = null;
      };
    },
  };
}

export function TemplateChip({ threadId }: { threadId?: string }) {
  const { agent } = useConversationAgent({ threadId });
  const pending = agent.state?.pending_template as
    | { id: string; name: string; kind?: ReferenceKind }
    | null
    | undefined;

  const active = !!pending?.name;
  const store = useMemo(() => createChipContainerStore(active), [active]);
  const container = useSyncExternalStore(store.subscribe, store.getSnapshot, () => null);

  const handleDismiss = useCallback(() => {
    agent.setState({ ...agent.state, pending_template: null });
  }, [agent]);

  if (!pending?.name) return null;

  const chipContent = (
    <div className="flex flex-wrap items-center gap-2 min-w-0" role="status">
    <div
      className="inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded-md text-xs font-medium select-none"
      style={{
        background:
          "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(16,185,129,0.12))",
        border: "1px solid rgba(99,102,241,0.22)",
        color: "var(--copilot-kit-contrast-color, #1a1a1a)",
        animation: "chipIn 0.15s ease-out",
      }}
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ opacity: 0.55, flexShrink: 0 }}
      >
        <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
      </svg>
      <span className="min-w-0 break-words" style={{ lineHeight: "18px" }}>
        {referenceKind(pending) === "page" ? "页面模板" : "组件参考"}：{pending.name}
      </span>
      <button
        onClick={handleDismiss}
        className="p-0.5 rounded transition-colors duration-100 hover:bg-black/10 dark:hover:bg-white/10"
        style={{ lineHeight: 0 }}
        aria-label="移除参考"
        type="button"
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </div>
    <span className="text-xs" style={{ color: "var(--text-secondary, #666)" }}>
      {referenceKind(pending) === "page" ? "已加入 · 输入页面要求并发送，即可按此模板生成" : "已加入 · 输入组件位置和修改要求并发送"}
    </span>
    </div>
  );

  // Fallback: render inline when CopilotKit DOM structure isn't available
  if (!container) return chipContent;

  return createPortal(chipContent, container);
}
