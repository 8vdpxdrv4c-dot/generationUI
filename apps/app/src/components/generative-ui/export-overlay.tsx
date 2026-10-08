"use client";

import { useState, useCallback, useMemo, useRef, useEffect, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAgent } from "@copilotkit/react-core/v2";
import type { ReferenceKind } from "@/components/template-library/types";
import {
  chartToStandaloneHtml,
  triggerDownload,
  slugify,
} from "./export-utils";
import { guessTitleFromSource, notifyHistoryChanged, type DesignSource } from "@/lib/history";
import { GenerationPreviewContext } from "./open-generative-ui/preview-context";

interface ExportOverlayProps {
  title: string;
  html?: string;
  /**
   * The page's separated source (generateSandboxedUi's own parameter shape).
   * Saved in preference to `html` so a later redesign gets a baseline in its
   * native format and the design-system CSS stays out of the record.
   */
  source?: DesignSource;
  componentData?: Record<string, unknown>;
  componentType: "openGenUI" | "barChart" | "pieChart";
  ready?: boolean;
  children: ReactNode;
}

export function ExportOverlay({
  title,
  html,
  source,
  componentData,
  componentType,
  ready = true,
  children,
}: ExportOverlayProps) {
  const { agent } = useAgent();
  const preview = useContext(GenerationPreviewContext);
  const actionsTarget = preview?.actionsTarget;
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [saveState, setSaveState] = useState<"idle" | "saved">("idle");
  const [menuOpen, setMenuOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Save-to-history dialog
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyTitle, setHistoryTitle] = useState("");
  const [historyRequirement, setHistoryRequirement] = useState("");
  const [historyState, setHistoryState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [pageSaveState, setPageSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedPageId, setSavedPageId] = useState<string | null>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const exportHtml = useMemo(() => {
    if (componentType === "openGenUI" && html) {
      return html;
    }
    if ((componentType === "barChart" || componentType === "pieChart") && componentData) {
      const chartType = componentType === "barChart" ? "bar" : "pie";
      return chartToStandaloneHtml(
        chartType,
        componentData as { title: string; description: string; data: Array<{ label: string; value: number }> }
      );
    }
    return null;
  }, [componentType, html, componentData]);

  const handleDownload = useCallback(() => {
    if (!exportHtml) return;
    const filename = `${slugify(title) || "visualization"}.html`;
    triggerDownload(exportHtml, filename);
    setMenuOpen(false);
  }, [exportHtml, title]);

  const handleCopy = useCallback(() => {
    const textToCopy = exportHtml;
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy).then(
      () => {
        setCopyState("copied");
        setMenuOpen(false);
        setTimeout(() => setCopyState("idle"), 1800);
      },
      () => {
        // Clipboard write failed (e.g. permission denied, iframe context)
        setMenuOpen(false);
      }
    );
  }, [exportHtml]);

  const handleSaveTemplate = useCallback((kind: ReferenceKind) => {
    if (!exportHtml) return;
    const existing = (agent.state?.templates as Array<{ id: string }> | undefined) ?? [];
    const name = title?.trim() || "未命名模板";
    const template = {
      id: crypto.randomUUID(),
      kind,
      name,
      description: `从生成结果保存：${name}`,
      html: exportHtml,
      data_description: componentData
        ? "Chart or structured component data"
        : "HTML widget markup",
      created_at: new Date().toISOString(),
      version: 1,
      component_type: componentType === "openGenUI" ? undefined : componentType,
      component_data: componentData,
    };
    agent.setState({
      ...agent.state,
      templates: [...existing, template],
    });
    setSaveState("saved");
    setMenuOpen(false);
    setTimeout(() => setSaveState("idle"), 1800);
  }, [agent, exportHtml, title, componentData, componentType]);

  const handleOpenInNewWindow = useCallback(() => {
    if (!exportHtml) return;
    setMenuOpen(false);
    const viewWindow = window.open("about:blank", "_blank");
    if (viewWindow) viewWindow.opener = null;
    (async () => {
      try {
        const res = await fetch("/api/view", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ html: exportHtml }),
        });
        if (res.ok) {
          const { id } = await res.json();
          if (id) {
            if (viewWindow) viewWindow.location.href = `/view/${id}`;
            return;
          }
        }
        throw new Error("view store unavailable");
      } catch {
        // Fallback: open the standalone HTML directly via a blob URL.
        const url = URL.createObjectURL(
          new Blob([exportHtml], { type: "text/html" })
        );
        if (viewWindow) viewWindow.location.href = url;
      }
    })();
  }, [exportHtml]);

  const handleViewPage = useCallback(() => {
    if (savedPageId) {
      window.open(`/view/${savedPageId}`, "_blank", "noopener,noreferrer");
      return;
    }
    handleOpenInNewWindow();
  }, [handleOpenInNewWindow, savedPageId]);

  /**
   * Best guess at the brief behind this page: the most recent thing the user
   * typed. It's the seed of the requirement chain, and it's editable — an
   * empty record just means the next redesign starts without context.
   */
  const lastUserMessage = useCallback((): string => {
    const messages = (agent.messages ?? []) as Array<{ role?: string; content?: unknown }>;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message?.role !== "user") continue;
      const text = typeof message.content === "string" ? message.content.trim() : "";
      if (text) return text.slice(0, 300);
    }
    return "";
  }, [agent]);

  const openHistoryDialog = useCallback(() => {
    setMenuOpen(false);
    // "generated-widget" is the renderer's placeholder title — let the server
    // guess a real name from the page markup in that case.
    const suggestion = title && title !== "generated-widget" ? title : "";
    setHistoryTitle(suggestion);
    setHistoryRequirement(componentType === "openGenUI" ? lastUserMessage() : "");
    setHistoryState("idle");
    setHistoryDialogOpen(true);
  }, [title, componentType, lastUserMessage]);

  const handleSaveToHistory = useCallback(async () => {
    if (!exportHtml || historyState === "saving") return;
    setHistoryState("saving");
    try {
      const payload = source
        ? {
            source,
            title: historyTitle.trim(),
            requirement: historyRequirement.trim(),
            componentType,
          }
        : { html: exportHtml, title: historyTitle.trim(), componentType };
      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("save failed");
      const data = (await res.json()) as { item?: { id?: string } };
      if (data.item?.id) {
        setSavedPageId(data.item.id);
        setPageSaveState("saved");
      }
      setHistoryState("saved");
      setHistoryDialogOpen(false);
      setHistoryTitle("");
      notifyHistoryChanged();
      setTimeout(() => setHistoryState("idle"), 1800);
    } catch {
      setHistoryState("error");
    }
  }, [exportHtml, source, historyTitle, historyRequirement, componentType, historyState]);

  const handleQuickSave = useCallback(async () => {
    if ((!source && !exportHtml) || pageSaveState === "saving" || pageSaveState === "saved") return;
    setPageSaveState("saving");
    try {
      const suggestedTitle = title && title !== "generated-widget"
        ? title.trim()
        : source
          ? guessTitleFromSource(source)
          : "";
      const payload = source
        ? { source, title: suggestedTitle, requirement: lastUserMessage(), componentType }
        : { html: exportHtml, title: suggestedTitle, componentType };
      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("save failed");
      const data = (await res.json()) as { item?: { id?: string } };
      if (data.item?.id) setSavedPageId(data.item.id);
      setPageSaveState("saved");
      notifyHistoryChanged();
    } catch {
      setPageSaveState("error");
    }
  }, [source, exportHtml, pageSaveState, title, lastUserMessage, componentType]);

  const exportable = ready && !!exportHtml;
  const showTrigger = exportable && (!!actionsTarget || hovered || menuOpen);

  const actions = exportable && (
      <div className={`${actionsTarget ? "relative" : "absolute top-2 right-2"} z-10 flex shrink-0 items-center gap-1.5 whitespace-nowrap`}>
        <button
          type="button"
          onClick={handleViewPage}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium shadow-md transition-colors hover:opacity-85"
          style={{ background: "var(--surface-primary, #fff)", border: "1px solid var(--color-border-glass, rgba(0,0,0,0.1))", color: "var(--text-primary, #1a1a1a)" }}
          title="在新窗口查看生成页面"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3h7v7" /><path d="M10 14 21 3" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></svg>
          查看页面
        </button>
        <button
          type="button"
          onClick={handleQuickSave}
          disabled={pageSaveState === "saving" || pageSaveState === "saved"}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium shadow-md transition-colors hover:opacity-85 disabled:cursor-default disabled:opacity-75"
          style={{ background: "var(--text-primary, #1a1a1a)", border: "1px solid transparent", color: "var(--surface-primary, #fff)" }}
          title="保存生成页面"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" /><path d="M17 21v-8H7v8" /><path d="M7 3v5h8" /></svg>
          {pageSaveState === "saving" ? "保存中…" : pageSaveState === "saved" ? "已保存" : pageSaveState === "error" ? "重试保存" : "保存页面"}
        </button>
        <div className={`transition-opacity duration-200 ${showTrigger ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center justify-center rounded-lg p-1.5 shadow-md transition-all duration-150 hover:scale-105"
            style={{
              background: "var(--surface-primary, #fff)",
              border: "1px solid var(--color-border-glass, rgba(0,0,0,0.1))",
              color: "var(--text-secondary, #666)",
            }}
            title="选项"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="19" cy="12" r="1.5" />
            </svg>
          </button>

          {menuOpen && (
            <div
              className="absolute top-full right-0 mt-1 rounded-lg py-1 shadow-lg min-w-[180px]"
              style={{
                background: "var(--surface-primary, #fff)",
                border: "1px solid var(--color-border-glass, rgba(0,0,0,0.1))",
                animation: "tmpl-slideIn 0.15s ease-out",
              }}
            >
              <button
                onClick={handleCopy}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-left transition-colors duration-100"
                style={{ color: copyState === "copied" ? "var(--color-text-success, #3B6D11)" : "var(--text-primary, #1a1a1a)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-background-secondary, #f5f5f5)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {copyState === "copied" ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
                {copyState === "copied" ? "已复制" : "复制到剪贴板"}
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-left transition-colors duration-100"
                style={{ color: "var(--text-primary, #1a1a1a)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-background-secondary, #f5f5f5)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                下载文件
              </button>
              {([...(componentType === "openGenUI" ? ["page" as const] : []), "component" as const]).map((kind) => <button
                key={kind}
                onClick={() => handleSaveTemplate(kind)}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-left transition-colors duration-100"
                style={{
                  color:
                    saveState === "saved"
                      ? "var(--color-text-success, #3B6D11)"
                      : "var(--text-primary, #1a1a1a)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-background-secondary, #f5f5f5)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
                </svg>
                {saveState === "saved" ? "已保存" : kind === "page" ? "保存为页面模板" : "保存为组件"}
              </button>)}
              <button
                onClick={openHistoryDialog}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-left transition-colors duration-100 border-t"
                style={{
                  color: "var(--text-primary, #1a1a1a)",
                  borderColor: "var(--color-border-glass, rgba(0,0,0,0.08))",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-background-secondary, #f5f5f5)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3v5h5" />
                  <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
                  <path d="M12 7v5l4 2" />
                </svg>
                自定义名称保存…
              </button>
            </div>
          )}
        </div>
      </div>
      </div>
      );

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {actionsTarget ? createPortal(actions, actionsTarget) : actions}

      {pageSaveState === "error" && exportable && (
        <div className="absolute top-14 right-2 z-10 rounded-md px-2.5 py-1.5 text-xs shadow" style={{ background: "var(--surface-primary, #fff)", color: "var(--color-text-danger, #A32D2D)" }} role="status">
          保存失败，请点击“重试保存”
        </div>
      )}

      {/* Save-to-history dialog. Portalled to <body>: the app shell uses
          backdrop-filter + overflow:hidden, which would otherwise trap and
          clip a fixed-position overlay. */}
      {historyDialogOpen && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(2px)" }}
            onClick={() => historyState !== "saving" && setHistoryDialogOpen(false)}
          >
            <div
              className="w-full max-w-[400px] rounded-xl p-5 shadow-xl"
              style={{
                background: "var(--surface-dialog, #fff)",
                border: "1px solid var(--color-border-glass, rgba(0,0,0,0.1))",
                fontFamily: "var(--font-family)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3
                className="text-sm font-semibold mb-1"
                style={{ color: "var(--text-primary, #1a1a1a)" }}
              >
                保存到历史
              </h3>
              <p className="text-xs mb-3" style={{ color: "var(--text-tertiary, #999)" }}>
                保存后可在“历史项目 → 已保存页面”中查看。
              </p>
              <input
                type="text"
                autoFocus
                value={historyTitle}
                onChange={(e) => setHistoryTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveToHistory();
                  if (e.key === "Escape") setHistoryDialogOpen(false);
                }}
                placeholder="给这页起个名字（留空则自动取名）"
                className="w-full"
                style={{
                  padding: "7px 10px",
                  fontSize: 13,
                  borderRadius: 8,
                  border: "1px solid var(--color-border-glass, rgba(0,0,0,0.15))",
                  background: "var(--surface-secondary, #fafafa)",
                  color: "var(--text-primary, #1a1a1a)",
                  outline: "none",
                }}
              />
              {componentType === "openGenUI" && (
                <>
                  <label
                    className="block text-xs mt-3 mb-1"
                    style={{ color: "var(--text-secondary, #666)" }}
                  >
                    生成这页时你的需求
                  </label>
                  <textarea
                    value={historyRequirement}
                    onChange={(e) => setHistoryRequirement(e.target.value)}
                    rows={3}
                    placeholder="留空也行——它只是让「重新设计」知道这页原本要做什么"
                    className="w-full resize-none"
                    style={{
                      padding: "7px 10px",
                      fontSize: 13,
                      lineHeight: 1.55,
                      borderRadius: 8,
                      border: "1px solid var(--color-border-glass, rgba(0,0,0,0.15))",
                      background: "var(--surface-secondary, #fafafa)",
                      color: "var(--text-primary, #1a1a1a)",
                      outline: "none",
                    }}
                  />
                </>
              )}
              {historyState === "error" && (
                <p className="text-xs mt-2" style={{ color: "var(--color-text-danger, #A32D2D)" }}>
                  保存失败，请重试。
                </p>
              )}
              <div className="flex items-center justify-end gap-2 mt-4">
                <button
                  onClick={() => setHistoryDialogOpen(false)}
                  disabled={historyState === "saving"}
                  className="text-xs px-3 py-1.5 rounded-lg transition-colors duration-100"
                  style={{
                    color: "var(--text-secondary, #666)",
                    border: "1px solid var(--color-border-glass, rgba(0,0,0,0.12))",
                    background: "transparent",
                  }}
                >
                  取消
                </button>
                <button
                  onClick={handleSaveToHistory}
                  disabled={historyState === "saving"}
                  className="text-xs px-3 py-1.5 rounded-lg transition-colors duration-100"
                  style={{
                    color: "var(--surface-primary, #fff)",
                    background: "var(--text-primary, #1a1a1a)",
                    border: "1px solid transparent",
                    opacity: historyState === "saving" ? 0.6 : 1,
                  }}
                >
                  {historyState === "saving" ? "保存中…" : "保存"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {children}
    </div>
  );
}
