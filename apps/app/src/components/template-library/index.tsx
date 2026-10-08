"use client";

import { useConversationAgent } from "@/hooks/use-conversation-agent";
import { useState } from "react";
import { TemplateCard } from "./template-card";
import { focusReferenceComposer } from "./focus-composer";
import { SEED_TEMPLATES, SEED_IDS } from "./seed-templates";
import { libraryLabels, mergeReferences, referenceKind, type ReferenceKind, type UIReference } from "./types";

interface TemplateLibraryProps {
  open: boolean;
  onClose: () => void;
  kind?: ReferenceKind;
  threadId?: string;
}

export function TemplateLibrary({ open, onClose, kind = "page", threadId }: TemplateLibraryProps) {
  const [chartFamily, setChartFamily] = useState("");
  const { agent, isReady } = useConversationAgent({ threadId });
  const agentTemplates: UIReference[] = agent.state?.templates || [];
  const label = libraryLabels[kind];

  // Merge seed templates with user-saved ones for display
  const templates = mergeReferences(SEED_TEMPLATES, agentTemplates).filter((item) => referenceKind(item) === kind);

  const handleApplyClick = (id: string) => {
    if (!isReady) return;
    const template = templates.find((t) => t.id === id);
    if (!template) return;

    // Ensure template is in agent state so the backend can retrieve it via apply_template
    const stateTemplates = agentTemplates.some((t) => t.id === id)
      ? agentTemplates
      : [...agentTemplates, template];

    agent.setState({
      ...agent.state,
      templates: stateTemplates,
      pending_template: { id: template.id, name: template.name, kind: referenceKind(template) },
    });
    onClose();

    focusReferenceComposer();
  };

  const handleDelete = (id: string) => {
    agent.setState({
      ...agent.state,
      templates: agentTemplates.filter((t) => t.id !== id),
      ...(agent.state?.pending_template?.id === id ? { pending_template: null } : {}),
    });
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: "rgba(0,0,0,0.3)", backdropFilter: "blur(2px)" }}
          onClick={onClose}
        />
      )}

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-label={label}
        aria-modal={open}
        inert={!open}
        aria-hidden={!open}
        className="fixed top-0 right-0 h-full z-50 flex flex-col transition-transform duration-300 ease-in-out"
        style={{
          width: 380,
          maxWidth: "90vw",
          transform: open ? "translateX(0)" : "translateX(100%)",
          background: "var(--surface-primary, #fff)",
          borderLeft: "1px solid var(--color-border-glass, rgba(0,0,0,0.1))",
          boxShadow: open ? "-8px 0 30px rgba(0,0,0,0.1)" : "none",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{
            borderBottom: "1px solid var(--color-border-glass, rgba(0,0,0,0.1))",
          }}
        >
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-secondary, #666)" }}>
              <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
            </svg>
            <h2
              className="text-base font-semibold"
              style={{ color: "var(--text-primary, #1a1a1a)" }}
            >
              {label}
            </h2>
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{
                background: "var(--color-background-secondary, #f5f5f5)",
                color: "var(--text-secondary, #666)",
              }}
            >
              {templates.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors duration-150"
            style={{ color: "var(--text-secondary, #666)" }}
            aria-label="关闭"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <p className="px-5 py-3 text-xs leading-relaxed" style={{ color: "var(--text-secondary, #666)" }}>
          {kind === "page" ? "完整页面模板，提供整个页面的布局与风格参考。" : "小组件，提供卡片、图表等局部内容的参考，保留页面其他部分。"}
          选择后加入当前对话，填写要求并发送后应用，不会自动生成。
        </p>
        <div className="flex-1 overflow-y-auto p-4">
          {kind === "component" && <div className="flex flex-wrap gap-2 mb-4" aria-label="图表分类">
            {[["", "全部"], ["area", "面积图"], ["bar", "柱状图"], ["line", "折线图"], ["pie", "饼图"], ["radar", "雷达图"], ["radial", "径向图"], ["tooltip", "图表提示"]].map(([value, label]) => (
              <button key={value} type="button" aria-pressed={chartFamily === value} onClick={() => setChartFamily(value)} className={`rounded-full border px-3 py-1 text-xs ${chartFamily === value ? "bg-blue-100 text-blue-800" : ""}`}>{label}</button>
            ))}
          </div>}
          {templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-tertiary, #999)", opacity: 0.5 }}>
                <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
              </svg>
              <p
                className="text-sm font-medium"
                style={{ color: "var(--text-secondary, #666)" }}
              >
                {kind === "page" ? "暂无页面模板" : "暂无组件"}
              </p>
              <p
                className="text-xs"
                style={{ color: "var(--text-tertiary, #999)" }}
              >
                {kind === "page" ? "在生成结果菜单中选择「保存为页面模板」即可复用。" : "在生成结果菜单中选择「保存为组件」即可复用。"}
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {open && templates.filter((t) => kind !== "component" || !chartFamily || t.id.startsWith(`seed-shadcn-chart-${chartFamily}-`)).map((t) => (
                <TemplateCard
                  key={t.id}
                  id={t.id}
                  name={t.name}
                  description={t.description}
                  html={t.html}
                  componentType={t.component_type}
                  componentData={t.component_data}
                  dataDescription={t.data_description}
                  version={t.version}
                  previewWidth={t.preview_width}
                  previewHeight={t.preview_height}
                  selected={agent.state?.pending_template?.id === t.id}
                  applyDisabled={!isReady}
                  onApply={handleApplyClick}
                  onDelete={SEED_IDS.has(t.id) ? undefined : handleDelete}
                />
              ))}
            </div>
          )}
        </div>

      </div>
    </>
  );
}
