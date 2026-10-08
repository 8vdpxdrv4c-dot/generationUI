"use client";

/**
 * 常驻历史侧边栏：列出已保存的设计资产（每项含一条版本链）。
 *
 * 「打开」= 新窗口看 /view/<id>?v=<版本>；「重新设计」= 先 iframe 预览这一版
 * 现在的效果，写下修改需求后提交。提交时：
 *
 *   1. 才去取该版本的源码（预览不必下载它）；
 *   2. 把源码推进 agent state 的 pending_design_asset，对话里只留 id + 需求；
 *   3. 记一个「待归档」标记，页面生成完成后由渲染器自动存成同一资产的新版本。
 *
 * 这样上下文里不会累积整页代码，AI 拿到的也正好是它自己输出契约的形态。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAgent, useCopilotKit } from "@copilotkit/react-core/v2";
import {
  HISTORY_CHANGED_EVENT,
  componentTypeLabel,
  formatRelativeTime,
  type DesignAssetMeta,
  type DesignSource,
  type DesignVersion,
} from "@/lib/history";
import { startPendingRedesign } from "@/lib/history/pending-redesign";
import type { GenerationSessionMeta } from "@/lib/generations";

const COLLAPSE_KEY = "ogui:history-collapsed";

/** The baseline the agent should load, in the shape it already understands. */
function designAssetState(
  asset: DesignAssetMeta,
  version: number,
  requirement: string,
  source: DesignSource
) {
  const separated = source.format === "sandboxed-ui" ? source : null;
  return {
    id: asset.id,
    title: asset.title,
    version,
    requirement,
    format: source.format,
    css: separated?.css ?? "",
    html: source.html,
    jsFunctions: separated?.jsFunctions ?? "",
    jsExpressions: separated?.jsExpressions ?? [],
    componentType: asset.componentType,
  };
}

export function HistorySidebar() {
  const router = useRouter();
  const { agent } = useAgent();
  const { copilotkit } = useCopilotKit();

  const [items, setItems] = useState<DesignAssetMeta[]>([]);
  const [generations, setGenerations] = useState<GenerationSessionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /** The asset version currently open in the redesign dialog. */
  const [target, setTarget] = useState<{ asset: DesignAssetMeta; version: number } | null>(null);
  const [requirement, setRequirement] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const agentRef = useRef(agent);
  const copilotkitRef = useRef(copilotkit);
  useEffect(() => { agentRef.current = agent; }, [agent]);
  useEffect(() => { copilotkitRef.current = copilotkit; }, [copilotkit]);

  const load = useCallback(async () => {
    try {
      const [historyRes, generationsRes] = await Promise.all([
        fetch("/api/history", { cache: "no-store" }),
        fetch("/api/generations", { cache: "no-store" }),
      ]);
      if (!historyRes.ok || !generationsRes.ok) throw new Error("list failed");
      const [historyData, generationsData] = await Promise.all([
        historyRes.json() as Promise<{ items?: DesignAssetMeta[] }>,
        generationsRes.json() as Promise<{ items?: GenerationSessionMeta[] }>,
      ]);
      setItems(Array.isArray(historyData.items) ? historyData.items : []);
      setGenerations(Array.isArray(generationsData.items) ? generationsData.items : []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // The save dialog lives inside the chat tree; refresh when it reports a save,
  // and again when a redesign files itself as a new version.
  useEffect(() => {
    const onChange = () => { void load(); };
    window.addEventListener(HISTORY_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(HISTORY_CHANGED_EVENT, onChange);
  }, [load]);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* localStorage unavailable — keep the default */
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const openPage = useCallback((id: string, version: number) => {
    window.open(`/view/${id}?v=${version}`, "_blank", "noopener,noreferrer");
  }, []);

  const openRedesign = useCallback((asset: DesignAssetMeta, version: number) => {
    setTarget({ asset, version });
    setRequirement("");
    setSubmitting(false);
  }, []);

  const closeRedesign = useCallback(() => {
    setTarget(null);
    setRequirement("");
    setSubmitting(false);
  }, []);

  const submitRedesign = useCallback(async () => {
    const current = target;
    if (!current || !requirement.trim() || submitting) return;
    setSubmitting(true);
    try {
      // Only now do we need the source — the preview used /view/ directly.
      const res = await fetch(
        `/api/history/${current.asset.id}?version=${current.version}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("version fetch failed");
      const data = (await res.json()) as { version?: DesignVersion };
      const version = data.version;
      if (!version) throw new Error("version missing");

      const ask = requirement.trim();
      const a = agentRef.current;

      // Queue the baseline in state (the channel pending_template already uses)
      // and mark that the next finished page belongs to this asset.
      a.setState({
        ...a.state,
        pending_design_asset: designAssetState(current.asset, version.version, ask, version.source),
      });
      startPendingRedesign(current.asset.id, ask);

      a.addMessage({
        id: crypto.randomUUID(),
        content: [
          `重新设计已保存的页面「${current.asset.title}」（id: ${current.asset.id}，基线 v${version.version}）。`,
          "请先调用 read_design_asset 读取它的现有源码，然后在这个版本上按下面的需求修改，",
          "沿用原有结构、设计系统变量与布局类，不要从零重做。完成后调用 clear_pending_design_asset。",
          "",
          "修改需求：",
          ask,
        ].join("\n"),
        role: "user",
      });
      copilotkitRef.current.runAgent({ agent: a });
      closeRedesign();
      setTimeout(() => {
        document.querySelector<HTMLTextAreaElement>('[data-testid="copilot-chat-textarea"]')?.focus();
      }, 100);
    } catch {
      setError(true);
      setSubmitting(false);
    }
  }, [target, requirement, submitting, closeRedesign]);

  const removeAsset = useCallback(async (asset: DesignAssetMeta) => {
    const extra =
      asset.versionCount > 1 ? `（含 ${asset.versionCount} 个版本）` : "";
    if (!window.confirm(`删除「${asset.title}」${extra}？删除后不可恢复。`)) return;
    try {
      const res = await fetch(`/api/history/${asset.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      setItems((prev) => prev.filter((entry) => entry.id !== asset.id));
    } catch {
      setError(true);
    }
  }, []);

  const count = items.length + generations.length;

  if (collapsed) {
    return (
      <aside
        className="h-full flex flex-col items-center gap-2 py-3 shrink-0"
        style={{
          width: 44,
          borderLeft: "1px solid var(--color-border-glass, rgba(0,0,0,0.1))",
          background: "var(--surface-secondary, #fafafa)",
        }}
      >
        <button
          onClick={toggleCollapsed}
          title="展开历史"
          aria-label="展开历史"
          className="p-1.5 rounded-lg transition-colors duration-150"
          style={{ color: "var(--text-secondary, #666)" }}
        >
          <Icon name="panel" />
        </button>
        <span
          className="text-[11px] font-medium px-1.5 py-0.5 rounded-full"
          style={{
            background: "var(--surface-quaternary, #f3f4f6)",
            color: "var(--text-secondary, #666)",
          }}
        >
          {count}
        </span>
      </aside>
    );
  }

  return (
    <aside
      className="h-full flex flex-col shrink-0"
      style={{
        width: 300,
        borderLeft: "1px solid var(--color-border-glass, rgba(0,0,0,0.1))",
        background: "var(--surface-secondary, #fafafa)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 shrink-0"
        style={{ borderBottom: "1px solid var(--color-border-glass, rgba(0,0,0,0.1))" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span style={{ color: "var(--text-secondary, #666)" }}>
            <Icon name="history" />
          </span>
          <h2 className="text-sm font-semibold m-0 truncate" style={{ color: "var(--text-primary, #1a1a1a)" }}>
            历史生成
          </h2>
          <span
            className="text-[11px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
            style={{
              background: "var(--surface-quaternary, #f3f4f6)",
              color: "var(--text-secondary, #666)",
            }}
          >
            {count}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => void load()}
            title="刷新"
            aria-label="刷新"
            className="p-1.5 rounded-lg transition-colors duration-150"
            style={{ color: "var(--text-secondary, #666)" }}
          >
            <Icon name="refresh" />
          </button>
          <button
            onClick={toggleCollapsed}
            title="收起历史"
            aria-label="收起历史"
            className="p-1.5 rounded-lg transition-colors duration-150"
            style={{ color: "var(--text-secondary, #666)" }}
          >
            <Icon name="panel" />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2.5">
        {loading ? (
          <p className="text-xs text-center mt-6" style={{ color: "var(--text-tertiary, #999)" }}>
            加载中…
          </p>
        ) : count === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
            <span style={{ color: "var(--text-tertiary, #999)", opacity: 0.5 }}>
              <Icon name="history" size={40} />
            </span>
            <p className="text-xs font-medium m-0" style={{ color: "var(--text-secondary, #666)" }}>
              还没有生成记录
            </p>
            <p className="text-[11px] m-0" style={{ color: "var(--text-tertiary, #999)" }}>
              发送需求后，对话和生成结果会自动保存在这里。
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {generations.length > 0 && (
              <section className="flex flex-col gap-1.5">
                <h3 className="m-0 px-1 text-[11px] font-semibold" style={{ color: "var(--text-tertiary, #999)" }}>
                  生成过程
                </h3>
                {generations.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    data-generation-id={entry.id}
                    onClick={() => router.push(`/generation/${encodeURIComponent(entry.id)}`)}
                    className="w-full rounded-lg p-2.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                    style={{
                      background: "var(--surface-primary, #fff)",
                      border: "1px solid var(--color-border-glass, rgba(0,0,0,0.1))",
                    }}
                    title="打开完整对话和生成记录"
                  >
                    <span className="block truncate text-xs font-medium" style={{ color: "var(--text-primary, #1a1a1a)" }}>
                      {entry.title}
                    </span>
                    <span className="mt-1 flex items-center justify-between gap-2 text-[10px]" style={{ color: "var(--text-tertiary, #999)" }}>
                      <span>{entry.generatedCount > 0 ? `${entry.generatedCount} 个生成记录` : "生成中或尚无结果"}</span>
                      <span>{formatRelativeTime(entry.updatedAt)}</span>
                    </span>
                  </button>
                ))}
              </section>
            )}
            {items.length > 0 && (
              <h3 className="m-0 px-1 pt-1 text-[11px] font-semibold" style={{ color: "var(--text-tertiary, #999)" }}>
                已保存页面
              </h3>
            )}
            {items.map((item) => {
              const expanded = expandedId === item.id;
              const current = item.versions[item.versions.length - 1];
              return (
                <div
                  key={item.id}
                  data-history-id={item.id}
                  className="group rounded-lg p-2.5 transition-colors duration-150"
                  style={{
                    background: "var(--surface-primary, #fff)",
                    border: "1px solid var(--color-border-glass, rgba(0,0,0,0.1))",
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className="text-xs font-medium m-0 leading-snug line-clamp-2"
                      style={{ color: "var(--text-primary, #1a1a1a)" }}
                      title={item.title}
                    >
                      {item.title}
                    </p>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                      style={{
                        background: "var(--surface-tertiary, #f9fafb)",
                        color: "var(--text-tertiary, #999)",
                      }}
                    >
                      {componentTypeLabel(item.componentType)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 mt-1">
                    {item.versionCount > 1 && (
                      <button
                        onClick={() => setExpandedId(expanded ? null : item.id)}
                        className="text-[11px] px-1.5 py-0.5 rounded-md transition-colors duration-150"
                        style={{
                          color: "var(--text-secondary, #666)",
                          background: "var(--surface-quaternary, #f3f4f6)",
                        }}
                        title={expanded ? "收起版本" : "展开版本"}
                      >
                        v{item.currentVersion} · {item.versionCount} 版 {expanded ? "▾" : "▸"}
                      </button>
                    )}
                    <p className="text-[11px] m-0" style={{ color: "var(--text-tertiary, #999)" }}>
                      {formatRelativeTime(item.updatedAt)}
                    </p>
                  </div>

                  {expanded && (
                    <div
                      className="mt-2 pt-2 flex flex-col gap-1"
                      style={{ borderTop: "1px solid var(--color-border-glass, rgba(0,0,0,0.08))" }}
                    >
                      {item.versions.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center gap-1.5"
                          data-history-version={entry.version}
                        >
                          <span
                            className="text-[11px] shrink-0"
                            style={{ color: "var(--text-tertiary, #999)" }}
                          >
                            v{entry.version}
                          </span>
                          <span
                            className="text-[11px] truncate flex-1"
                            style={{ color: "var(--text-secondary, #666)" }}
                            title={entry.requirement}
                          >
                            {entry.requirement || "未记录需求"}
                          </span>
                          <button
                            onClick={() => openPage(item.id, entry.version)}
                            className="text-[11px] shrink-0 px-1.5 py-0.5 rounded-md"
                            style={{
                              color: "var(--text-secondary, #666)",
                              border: "1px solid var(--color-border-glass, rgba(0,0,0,0.12))",
                            }}
                          >
                            打开
                          </button>
                          <button
                            onClick={() => openRedesign(item, entry.version)}
                            className="text-[11px] shrink-0 px-1.5 py-0.5 rounded-md"
                            style={{
                              color: "var(--text-primary, #1a1a1a)",
                              border: "1px solid var(--color-border-glass, rgba(0,0,0,0.12))",
                            }}
                          >
                            改这版
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 mt-2">
                    <button
                      onClick={() => current && openPage(item.id, current.version)}
                      className="text-[11px] px-2 py-1 rounded-md transition-colors duration-150"
                      style={{
                        color: "var(--text-secondary, #666)",
                        border: "1px solid var(--color-border-glass, rgba(0,0,0,0.12))",
                      }}
                    >
                      打开
                    </button>
                    <button
                      onClick={() => current && openRedesign(item, current.version)}
                      className="text-[11px] px-2 py-1 rounded-md transition-colors duration-150"
                      style={{
                        color: "var(--surface-primary, #fff)",
                        background: "var(--text-primary, #1a1a1a)",
                      }}
                    >
                      重新设计
                    </button>
                    <button
                      onClick={() => void removeAsset(item)}
                      title="删除"
                      aria-label="删除"
                      className="ml-auto p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                      style={{ color: "var(--text-tertiary, #999)" }}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <p className="text-[11px] mt-3 text-center" style={{ color: "var(--color-text-danger, #A32D2D)" }}>
            历史记录读写失败，请重试。
          </p>
        )}
      </div>

      {/* Redesign dialog — portalled: the app shell's backdrop-filter/overflow
          would otherwise trap and clip a fixed overlay. */}
      {target && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)" }}
            onClick={closeRedesign}
          >
            <div
              className="flex flex-col w-full max-w-[900px] max-h-[86vh] rounded-xl overflow-hidden shadow-2xl"
              style={{
                background: "var(--surface-dialog, #fff)",
                border: "1px solid var(--color-border-glass, rgba(0,0,0,0.1))",
                fontFamily: "var(--font-family)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="flex items-center justify-between gap-3 px-4 py-3 shrink-0"
                style={{ borderBottom: "1px solid var(--color-border-glass, rgba(0,0,0,0.1))" }}
              >
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold m-0 truncate" style={{ color: "var(--text-primary, #1a1a1a)" }}>
                    {`重新设计：${target.asset.title} · v${target.version}`}
                  </h3>
                  <p className="text-[11px] m-0 mt-0.5" style={{ color: "var(--text-tertiary, #999)" }}>
                    下面是这一版现在的效果，写下要改的地方，AI 会在这一版上改，改完自动存为新版本。
                  </p>
                </div>
                <button
                  onClick={closeRedesign}
                  aria-label="关闭"
                  className="p-1.5 rounded-lg shrink-0"
                  style={{ color: "var(--text-secondary, #666)" }}
                >
                  <Icon name="close" />
                </button>
              </div>

              <div className="flex-1 min-h-0" style={{ background: "var(--surface-tertiary, #f9fafb)" }}>
                <iframe
                  title="当前效果"
                  src={`/view/${target.asset.id}?v=${target.version}`}
                  className="w-full h-full"
                  style={{ border: "none", background: "#fff", minHeight: 320 }}
                  sandbox="allow-scripts allow-same-origin allow-popups allow-modals"
                />
              </div>

              <div
                className="shrink-0 p-3"
                style={{ borderTop: "1px solid var(--color-border-glass, rgba(0,0,0,0.1))" }}
              >
                {target.asset.versions.find((v) => v.version === target.version)?.requirement ? (
                  <p
                    className="text-[11px] m-0 mb-2 line-clamp-2"
                    style={{ color: "var(--text-tertiary, #999)" }}
                    title={target.asset.versions.find((v) => v.version === target.version)?.requirement}
                  >
                    这一版当初的需求：
                    {target.asset.versions.find((v) => v.version === target.version)?.requirement}
                  </p>
                ) : null}
                <textarea
                  value={requirement}
                  onChange={(e) => setRequirement(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submitRedesign();
                    if (e.key === "Escape") closeRedesign();
                  }}
                  placeholder="输入修改需求，例如：把左右两栏的宽度收窄到 240px，标题栏居中改成左对齐，数据卡片加圆角"
                  rows={3}
                  className="w-full resize-none"
                  style={{
                    padding: "8px 10px",
                    fontSize: 13,
                    lineHeight: 1.6,
                    borderRadius: 8,
                    border: "1px solid var(--color-border-glass, rgba(0,0,0,0.15))",
                    background: "var(--surface-secondary, #fafafa)",
                    color: "var(--text-primary, #1a1a1a)",
                    outline: "none",
                  }}
                />
                <div className="flex items-center justify-between gap-3 mt-2">
                  <span className="text-[11px]" style={{ color: "var(--text-tertiary, #999)" }}>
                    ⌘/Ctrl + Enter 提交
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openPage(target.asset.id, target.version)}
                      className="text-xs px-3 py-1.5 rounded-lg"
                      style={{
                        color: "var(--text-secondary, #666)",
                        border: "1px solid var(--color-border-glass, rgba(0,0,0,0.12))",
                      }}
                    >
                      新窗口打开
                    </button>
                    <button
                      onClick={() => void submitRedesign()}
                      disabled={!requirement.trim() || submitting}
                      className="text-xs px-3 py-1.5 rounded-lg"
                      style={{
                        color: "var(--surface-primary, #fff)",
                        background: "var(--text-primary, #1a1a1a)",
                        opacity: !requirement.trim() || submitting ? 0.5 : 1,
                      }}
                    >
                      {submitting ? "提交中…" : "用这个需求重新生成"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </aside>
  );
}

function Icon({ name, size = 16 }: { name: "history" | "refresh" | "panel" | "trash" | "close"; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (name === "history") {
    return (
      <svg {...common}>
        <path d="M3 3v5h5" />
        <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
        <path d="M12 7v5l4 2" />
      </svg>
    );
  }
  if (name === "refresh") {
    return (
      <svg {...common}>
        <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
        <path d="M21 3v5h-5" />
      </svg>
    );
  }
  if (name === "panel") {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M15 4v16" />
      </svg>
    );
  }
  if (name === "trash") {
    return (
      <svg {...common}>
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
