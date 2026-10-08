"use client";

import { useRef, useEffect, useState } from "react";
import { THEME_CSS } from "@repo/design-system";
import { ShadcnChartPreview } from "../shadcn-charts";

const CHART_COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b",
  "#10b981", "#06b6d4", "#f97316",
];

interface TemplateCardProps {
  id: string;
  name: string;
  description: string;
  html: string;
  componentType?: string;
  componentData?: Record<string, unknown>;
  dataDescription: string;
  version: number;
  previewWidth?: number;
  previewHeight?: number;
  selected?: boolean;
  applyDisabled?: boolean;
  onApply: (id: string) => void;
  onDelete?: (id: string) => void;
}

/** Mini bar chart preview rendered as inline SVG */
function BarChartPreview({ data }: { data: { label: string; value: number }[] }) {
  if (!data?.length) return null;
  const max = Math.max(...data.map((d) => d.value));
  const barWidth = Math.min(40, Math.floor(280 / data.length) - 8);
  const chartWidth = data.length * (barWidth + 8);
  const chartHeight = 100;

  return (
    <svg
      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ padding: 16 }}
    >
      {data.map((d, i) => {
        const h = max > 0 ? (d.value / max) * (chartHeight - 20) : 0;
        return (
          <rect
            key={i}
            x={i * (barWidth + 8)}
            y={chartHeight - h - 10}
            width={barWidth}
            height={h}
            rx={3}
            fill={CHART_COLORS[i % CHART_COLORS.length]}
          />
        );
      })}
    </svg>
  );
}

/** Mini pie chart preview rendered as inline SVG */
function PieChartPreview({ data }: { data: { label: string; value: number }[] }) {
  if (!data?.length) return null;
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return null;

  const cx = 60, cy = 60, r = 50;
  const cumulativeAngles = data.reduce<number[]>((acc, d) => {
    acc.push((acc[acc.length - 1] ?? 0) + d.value);
    return acc;
  }, []);
  const slices = data.map((d, i) => {
    const startAngle = ((cumulativeAngles[i] - d.value) / total) * 2 * Math.PI - Math.PI / 2;
    const endAngle = (cumulativeAngles[i] / total) * 2 * Math.PI - Math.PI / 2;
    const largeArc = d.value / total > 0.5 ? 1 : 0;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    return (
      <path
        key={i}
        d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} Z`}
        fill={CHART_COLORS[i % CHART_COLORS.length]}
      />
    );
  });

  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      {slices}
    </svg>
  );
}

export function TemplateCard({
  id,
  name,
  description,
  html,
  componentType,
  componentData,
  version,
  previewWidth,
  previewHeight,
  selected = false,
  applyDisabled = false,
  onApply,
  onDelete,
}: TemplateCardProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [previewScale, setPreviewScale] = useState(0);
  const [contentSize, setContentSize] = useState({ html: "", height: 0 });
  const frameHeight = Math.max(previewHeight ?? 0, contentSize.html === html ? contentSize.height : 0);
  useEffect(() => {
    if (!previewWidth) return;
    const onSize = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow || event.data?.type !== "template-preview-size") return;
      const height = event.data.height;
      if (typeof height !== "number" || !Number.isFinite(height) || height <= 0 || height > 10_000) return;
      setContentSize({ html, height: Math.ceil(height) });
    };
    window.addEventListener("message", onSize);
    return () => window.removeEventListener("message", onSize);
  }, [html, previewWidth]);
  useEffect(() => {
    const container = previewRef.current;
    if (!container || !previewWidth || !previewHeight) return;
    const resize = () => setPreviewScale(Math.min(container.clientWidth / previewWidth, container.clientHeight / frameHeight));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [previewWidth, previewHeight, frameHeight]);

  const previewHtml = html ? `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
${THEME_CSS}
* { box-sizing: border-box; margin: 0; }
body {
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 16px;
  line-height: 1.7;
  color: var(--color-text-primary);
  background: var(--color-background-primary);
  overflow: hidden;
}
</style></head><body><div id="content">${html}</div>${previewWidth ? `<script>
(() => {
  const content = document.getElementById('content');
  const report = () => parent.postMessage({ type: 'template-preview-size', height: content.getBoundingClientRect().height }, '*');
  new ResizeObserver(report).observe(content);
  report();
})();
</script>` : ""}</body></html>` : "";

  useEffect(() => {
    if (!iframeRef.current || !previewHtml) return;
    iframeRef.current.srcdoc = previewHtml;
  }, [previewHtml]);

  // Determine chart data for mini preview
  const chartData = componentData?.data as { label: string; value: number }[] | undefined;
  const isBarChart = componentType === "barChart";
  const isPieChart = componentType === "pieChart";
  const isChart = isBarChart || isPieChart;

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col"
      style={{
        border: selected ? "1px solid #10b981" : "1px solid var(--color-border-glass, rgba(0,0,0,0.1))",
        outline: selected ? "2px solid rgba(16,185,129,0.2)" : undefined,
        outlineOffset: -2,
        background: "var(--surface-primary, #fff)",
      }}
    >
      {/* Preview */}
      <div
        ref={previewRef}
        className="relative overflow-hidden"
        style={{ height: id.startsWith("seed-shadcn-chart-") ? 340 : 140, background: "var(--color-background-secondary, #f7f6f3)" }}
      >
        {id.startsWith("seed-shadcn-chart-") ? (
          <div className="h-full overflow-auto p-2" style={{ "--chart-1": "#2563eb", "--chart-2": "#14b8a6", "--chart-3": "#8b5cf6", "--chart-4": "#f59e0b", "--chart-5": "#f43f5e" } as React.CSSProperties}>
            <ShadcnChartPreview name={id.replace("seed-shadcn-", "")} />
          </div>
        ) : isChart && chartData ? (
          <div className="flex items-center justify-center h-full">
            {isBarChart && <BarChartPreview data={chartData} />}
            {isPieChart && <PieChartPreview data={chartData} />}
          </div>
        ) : html ? (
          <iframe
            ref={iframeRef}
            sandbox="allow-scripts"
            onLoad={() => setPreviewReady(true)}
            className={previewWidth ? "border-0 absolute origin-top-left" : "border-0 w-[300%] h-[300%] origin-top-left"}
            style={{
              ...(previewWidth && previewHeight ? {
                width: previewWidth,
                height: frameHeight,
                left: "50%",
                top: "50%",
                marginLeft: -previewWidth * previewScale / 2,
                marginTop: -frameHeight * previewScale / 2,
              } : {}),
              transform: `scale(${previewWidth ? previewScale : 0.333})`,
              pointerEvents: "none",
              opacity: previewReady ? 1 : 0,
              transition: "opacity 300ms",
            }}
            title={`Preview: ${name}`}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-tertiary, #999)", opacity: 0.5 }}>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18" />
              <path d="M9 21V9" />
            </svg>
          </div>
        )}
        {/* Version badge */}
        <span
          className="absolute top-2 right-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
          style={{
            background: "var(--color-background-info, #E6F1FB)",
            color: "var(--color-text-info, #185FA5)",
          }}
        >
          v{version}
        </span>
      </div>

      {/* Info */}
      <div className="flex flex-col gap-1 p-3 flex-1">
        <h3
          className="text-sm font-semibold truncate"
          style={{ color: "var(--text-primary, #1a1a1a)" }}
        >
          {name}
        </h3>
        <p
          className="text-xs line-clamp-2"
          style={{ color: "var(--text-secondary, #666)" }}
        >
          {description}
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-2 p-3 pt-0">
        <button
          type="button"
          aria-pressed={selected}
          disabled={applyDisabled}
          onClick={() => onApply(id)}
          className="flex-1 text-xs font-medium py-1.5 rounded-lg transition-all duration-150 hover:scale-[1.02] text-white disabled:opacity-50 disabled:cursor-wait"
          style={{
            background: selected ? "#047857" : "linear-gradient(135deg, var(--color-lilac-dark, #6366f1), var(--color-mint-dark, #10b981))",
          }}
        >
          {applyDisabled ? "正在连接会话…" : selected ? "✓ 已加入当前对话" : "加入当前对话"}
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(id)}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors duration-150"
            style={{
              border: "1px solid var(--color-border-tertiary, rgba(0,0,0,0.1))",
              color: "var(--color-text-danger, #A32D2D)",
            }}
          >
            删除
          </button>
        )}
      </div>
    </div>
  );
}
