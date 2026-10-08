"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock3, Eye, FileCode2, MessageSquareText, Sparkles } from "lucide-react";
import { formatRelativeTime, type DesignAssetMeta } from "@/lib/history";
import type { GenerationSessionMeta } from "@/lib/generations";

export default function GenerationHistoryPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"conversations" | "pages">("conversations");
  const [items, setItems] = useState<GenerationSessionMeta[]>([]);
  const [pages, setPages] = useState<DesignAssetMeta[]>([]);
  const [loading, setLoading] = useState({ conversations: true, pages: true });
  const [error, setError] = useState({ conversations: false, pages: false });

  useEffect(() => {
    let cancelled = false;
    const load = async <T,>(url: string, key: "conversations" | "pages", update: (data: T[]) => void) => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error("history unavailable");
        const data = (await res.json()) as { items?: T[] };
        if (!cancelled) update(Array.isArray(data.items) ? data.items : []);
      } catch {
        if (!cancelled) setError((prev) => ({ ...prev, [key]: true }));
      } finally {
        if (!cancelled) setLoading((prev) => ({ ...prev, [key]: false }));
      }
    };
    void load<GenerationSessionMeta>("/api/generations", "conversations", setItems);
    void load<DesignAssetMeta>("/api/history", "pages", setPages);
    return () => { cancelled = true; };
  }, []);

  const currentLoading = loading[activeTab];
  const currentError = error[activeTab];
  const isEmpty = activeTab === "conversations" ? items.length === 0 : pages.length === 0;

  return (
    <main className="min-h-dvh px-5 py-6 sm:px-8 sm:py-9" style={{ background: "var(--background)", color: "var(--text-primary)" }}>
      <div className="mx-auto max-w-4xl">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="mb-7 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/8"
          style={{ color: "var(--text-secondary)" }}
        >
          <ArrowLeft size={16} /> 返回工作台
        </button>

        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl" style={{ background: "linear-gradient(135deg, var(--color-lilac), var(--color-mint))", color: "white" }}>
            <Sparkles size={18} />
          </div>
          <div>
            <h1 className="m-0 text-xl font-semibold">历史项目</h1>
            <p className="mb-0 mt-1 text-sm" style={{ color: "var(--text-tertiary)" }}>对话自动保存，页面可单独查看</p>
          </div>
        </div>

        <div className="mb-5 flex gap-2 border-b" style={{ borderColor: "var(--color-border-light)" }} role="tablist" aria-label="历史记录类型">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "conversations"}
            onClick={() => setActiveTab("conversations")}
            className="inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors"
            style={{ color: activeTab === "conversations" ? "var(--text-primary)" : "var(--text-tertiary)", borderColor: activeTab === "conversations" ? "var(--text-primary)" : "transparent" }}
          >
            <MessageSquareText size={15} /> 生成对话 <span className="text-xs opacity-60">{items.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "pages"}
            onClick={() => setActiveTab("pages")}
            className="inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors"
            style={{ color: activeTab === "pages" ? "var(--text-primary)" : "var(--text-tertiary)", borderColor: activeTab === "pages" ? "var(--text-primary)" : "transparent" }}
          >
            <FileCode2 size={15} /> 已保存页面 <span className="text-xs opacity-60">{pages.length}</span>
          </button>
        </div>

        {currentLoading ? (
          <p className="py-12 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>正在加载历史记录…</p>
        ) : currentError ? (
          <p className="py-12 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>历史记录加载失败，请刷新后重试。</p>
        ) : isEmpty ? (
          <div className="rounded-2xl border border-dashed p-12 text-center" style={{ borderColor: "var(--color-border-light)", color: "var(--text-tertiary)" }}>
            <p className="m-0 text-sm">{activeTab === "pages" ? "还没有保存的页面" : "还没有生成记录"}</p>
            {activeTab === "pages" && <p className="mb-0 mt-2 text-xs">生成页面后点击结果上方的「保存页面」，保存的成品会出现在这里。</p>}
          </div>
        ) : (
          <div className="grid gap-3">
            {activeTab === "conversations" && items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => router.push(`/generation/${encodeURIComponent(item.id)}`)}
                className="group flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-5"
                style={{ borderColor: "var(--color-border-light)", background: "var(--surface-primary)" }}
              >
                <div className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: "var(--surface-tertiary)", color: "var(--text-secondary)" }}>
                  <MessageSquareText size={18} />
                </div>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                    <span className="inline-flex items-center gap-1"><Clock3 size={12} />{formatRelativeTime(item.updatedAt)}</span>
                    <span>{item.messageCount} 条消息</span>
                    {item.generatedCount > 0 && <span>{item.generatedCount} 项生成</span>}
                    <span>{item.status === "running" ? "生成中" : "已完成"}</span>
                  </span>
                </span>
                <ArrowLeft className="size-4 rotate-180 opacity-40 transition-opacity group-hover:opacity-100" />
              </button>
            ))}
            {activeTab === "pages" && pages.map((page) => (
              <article
                key={page.id}
                className="flex items-center gap-4 rounded-2xl border p-4 sm:p-5"
                style={{ borderColor: "var(--color-border-light)", background: "var(--surface-primary)" }}
              >
                <div className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: "var(--surface-tertiary)", color: "var(--text-secondary)" }}>
                  <FileCode2 size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-sm font-medium">{page.title}</p>
                  <p className="mb-0 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                    <span className="inline-flex items-center gap-1"><Clock3 size={12} />{formatRelativeTime(page.updatedAt)}</span>
                    <span>{page.versionCount} 个版本</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => window.open(`/view/${encodeURIComponent(page.id)}?v=${page.currentVersion}`, "_blank", "noopener,noreferrer")}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-opacity hover:opacity-75"
                  style={{ background: "var(--text-primary)", color: "var(--surface-primary)" }}
                >
                  <Eye size={14} /> 查看页面
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
