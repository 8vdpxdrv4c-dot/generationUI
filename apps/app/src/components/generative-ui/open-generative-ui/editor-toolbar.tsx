"use client";

import { useEffect, useRef, useState, type ButtonHTMLAttributes } from "react";
import { ALargeSmall, AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowLeftRight, ArrowUpDown, Baseline, Bold, Box, Image as ImageIcon, ImagePlus, Info, Italic, LoaderCircle, LockKeyhole, Move, PaintBucket, Radius, RectangleHorizontal, Redo2, Square, SquarePen, TextCursorInput, Type, Undo2, UnlockKeyhole, type LucideIcon } from "lucide-react";
import type { EditorCommand, EditorKind, EditorSelection, EditorSnapshot } from "./editor-source";

export type ToolbarTool = { id: string; label: string; icon: LucideIcon; property: string } & (
  | { type: "number"; min: number; max: number }
  | { type: "color" }
  | { type: "toggle"; on: string; off: string }
  | { type: "select"; options: { value: string; label: string }[] }
);

const font: ToolbarTool[] = [
  { id: "font-size", label: "字号", icon: ALargeSmall, type: "number", property: "font-size", min: 6, max: 200 },
  { id: "bold", label: "加粗", icon: Bold, type: "toggle", property: "font-weight", on: "700", off: "400" },
  { id: "italic", label: "斜体", icon: Italic, type: "toggle", property: "font-style", on: "italic", off: "normal" },
  { id: "color", label: "文字颜色", icon: Baseline, type: "color", property: "color" },
];
const border: ToolbarTool[] = [
  { id: "border-width", label: "边框", icon: Square, type: "number", property: "border-width", min: 0, max: 30 },
  { id: "border-color", label: "边框颜色", icon: SquarePen, type: "color", property: "border-color" },
  { id: "radius", label: "圆角", icon: Radius, type: "number", property: "border-radius", min: 0, max: 1000 },
];
/** Add a tool definition here to extend the toolbar without changing selection or persistence. */
export const TOOLBAR_TOOLS: Record<EditorKind, ToolbarTool[]> = {
  text: [...font, { id: "align", label: "对齐", icon: AlignLeft, type: "select", property: "text-align", options: [{ value: "left", label: "左对齐" }, { value: "center", label: "居中" }, { value: "right", label: "右对齐" }, { value: "justify", label: "两端对齐" }] }],
  image: border,
  button: [...font, { id: "background", label: "背景", icon: PaintBucket, type: "color", property: "background-color" }, ...border],
  container: [{ id: "background", label: "背景", icon: PaintBucket, type: "color", property: "background-color" }, ...border],
  scene: [],
};
const labels: Record<EditorKind, string> = { text: "文字", image: "图片", button: "按钮", container: "容器", scene: "Canvas / 3D" };
const kindIcons: Record<EditorKind, LucideIcon> = { text: Type, image: ImageIcon, button: RectangleHorizontal, container: Square, scene: Box };
const alignIcons: Record<string, LucideIcon> = { left: AlignLeft, center: AlignCenter, right: AlignRight, justify: AlignJustify };
const control = "h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
const iconControl = `${control} inline-flex w-8 shrink-0 items-center justify-center !px-0 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-500 aria-pressed:border-blue-400 aria-pressed:bg-blue-50 aria-pressed:text-blue-700 dark:hover:bg-slate-700 dark:aria-pressed:bg-blue-950 dark:aria-pressed:text-blue-300`;

function IconButton({ label, icon: Icon, className = "", ...props }: { label: string; icon: LucideIcon } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" aria-label={label} title={label} className={`${iconControl} ${className}`} {...props}><Icon size={18} strokeWidth={1.75} aria-hidden="true" /></button>;
}

function HintIcon({ label, icon: Icon = Info }: { label: string; icon?: LucideIcon }) {
  return <span role="img" aria-label={label} title={label} className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-slate-400"><Icon size={18} strokeWidth={1.75} aria-hidden="true" /></span>;
}

function colorHex(value: string) {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  const match = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  return match ? `#${match.slice(1).map(part => Math.min(255, Number(part)).toString(16).padStart(2, "0")).join("")}` : "#000000";
}

function NumberControl({ label, icon: Icon, value, min = 16, max = 10_000, onCommit }: { label: string; icon: LucideIcon; value: number; min?: number; max?: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(Math.round(value * 100) / 100));
  const focused = useRef(false);
  const cancelled = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(String(Math.round(value * 100) / 100)); }, [value]);
  const commit = () => {
    const next = Number(draft);
    if (draft.trim() && Number.isFinite(next) && next >= min && next <= max) { if (Math.abs(next - value) > 0.01) onCommit(next); }
    else setDraft(String(Math.round(value * 100) / 100));
  };
  return <label title={label} className="flex items-center gap-1 text-xs whitespace-nowrap"><Icon size={18} strokeWidth={1.75} aria-hidden="true" /><input aria-label={label} type="number" min={min} max={max} step="1" value={draft}
    className={`${control} w-[4.5rem]`} onFocus={() => { focused.current = true; }} onChange={event => setDraft(event.target.value)}
    onBlur={() => { focused.current = false; if (!cancelled.current) commit(); cancelled.current = false; }} onKeyDown={event => {
      if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
      if (event.key === "Escape") { cancelled.current = true; setDraft(String(Math.round(value * 100) / 100)); focused.current = false; event.currentTarget.blur(); }
    }} /></label>;
}

function ToolControl({ tool, selection, command }: { tool: ToolbarTool; selection: EditorSelection; command: (value: EditorCommand) => void }) {
  const value = selection.styles[tool.property] ?? "";
  const patch = (next: string) => {
    const styles: Record<string, string> = { [tool.property]: next };
    if (tool.property === "border-width" || tool.property === "border-color") styles["border-style"] = "solid";
    command({ kind: "patch", node: selection.node, styles });
  };
  if (tool.type === "number") return <NumberControl label={tool.label} icon={tool.icon} value={parseFloat(value) || 0} min={tool.min} max={tool.max} onCommit={next => patch(`${next}px`)} />;
  if (tool.type === "color") return <label title={tool.label} className="flex items-center gap-1 text-xs whitespace-nowrap"><tool.icon size={18} strokeWidth={1.75} aria-hidden="true" /><input aria-label={tool.label} title={tool.label} type="color" value={colorHex(value)} className="h-8 w-8 cursor-pointer rounded border border-slate-200 bg-white p-1" onChange={event => patch(event.target.value)} /></label>;
  if (tool.type === "toggle") {
    const active = tool.property === "font-weight" ? value === "bold" || Number(value) >= 600 : value === tool.on;
    return <IconButton label={tool.label} icon={tool.icon} aria-pressed={active} onClick={() => patch(active ? tool.off : tool.on)} />;
  }
  const selected = tool.options.some(option => option.value === value) ? value : "left";
  return <div role="group" aria-label={tool.label} className="flex items-center gap-1">{tool.options.map(option => <IconButton key={option.value} label={option.label} icon={alignIcons[option.value] ?? tool.icon} aria-pressed={selected === option.value} onClick={() => patch(option.value)} />)}</div>;
}

export function EditorToolbar({ snapshot, command, disabled, onPending }: { snapshot: EditorSnapshot; command: (value: EditorCommand) => Promise<void>; disabled: boolean; onPending?: (operation: Promise<void>) => void }) {
  const selection = snapshot.selection;
  const KindIcon = selection ? kindIcons[selection.kind] : Info;
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const currentNode = useRef(selection?.node); currentNode.current = selection?.node;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { setError(""); }, [selection?.node]);
  const run = (value: EditorCommand) => { setError(""); void command(value).catch(cause => setError(cause instanceof Error ? cause.message : "操作失败，请重试")); };
  const replaceImage = async (image: File) => {
    if (!selection) return;
    const node = selection.node;
    setUploading(true); setError("");
    try {
      const form = new FormData(); form.set("file", image);
      const response = await fetch("/api/upload", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok || (typeof result.path !== "string" && typeof result.url !== "string") || !String(result.mimeType).startsWith("image/")) throw new Error(result.error ?? "图片上传失败");
      if (!alive.current || currentNode.current !== node) throw new Error("选择已变化，请重新选中图片后替换");
      // Next's internal request origin can be 0.0.0.0 behind a local/cloud proxy.
      const src = typeof result.path === "string" && result.path.startsWith("/upload/") ? new URL(result.path, window.location.origin).href : result.url;
      await command({ kind: "image", node, src });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "图片替换失败"); throw cause; }
    finally { setUploading(false); if (file.current) file.current.value = ""; }
  };
  return <div data-ogui-toolbar className="sticky top-0 z-30 mb-3 rounded-xl border border-blue-100 bg-white/95 p-2 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/95" aria-label="元素编辑工具条">
    <fieldset disabled={disabled || uploading} className="flex flex-wrap items-center gap-2 border-0 p-0">
      <IconButton label="撤销" icon={Undo2} disabled={!snapshot.canUndo} onClick={() => run({ kind: "undo" })} />
      <IconButton label="重做" icon={Redo2} disabled={!snapshot.canRedo} onClick={() => run({ kind: "redo" })} />
      {selection ? <>
        <span role="img" aria-label={`${labels[selection.kind]} · ${selection.tag}`} title={`${labels[selection.kind]} · ${selection.tag}`} className="inline-flex h-5 items-center border-l border-slate-200 pl-2 text-blue-600"><KindIcon size={18} strokeWidth={1.75} aria-hidden="true" /></span>
        {selection.resizable && <>
          <NumberControl key={`${selection.node}-width`} label="宽" icon={ArrowLeftRight} value={selection.width} onCommit={value => {
            const styles: Record<string, string> = { width: `${value}px`, "box-sizing": "border-box" };
            if (selection.kind === "image" && selection.lockRatio && selection.width > 0) styles.height = `${Math.round(value * selection.height / selection.width * 100) / 100}px`;
            run({ kind: "patch", node: selection.node, styles });
          }} />
          <NumberControl key={`${selection.node}-height`} label="高" icon={ArrowUpDown} value={selection.height} onCommit={value => {
            const styles: Record<string, string> = { height: `${value}px`, "box-sizing": "border-box" };
            if (selection.kind === "image" && selection.lockRatio && selection.height > 0) styles.width = `${Math.round(value * selection.width / selection.height * 100) / 100}px`;
            run({ kind: "patch", node: selection.node, styles });
          }} />
        </>}
        {(selection.kind === "text" || selection.kind === "button") && <IconButton label="修改文字" icon={TextCursorInput} onClick={() => run({ kind: "editText" })} />}
        {selection.kind === "image" && <>
          <IconButton label={selection.lockRatio ? "比例已锁定" : "比例自由"} icon={selection.lockRatio ? LockKeyhole : UnlockKeyhole} aria-pressed={selection.lockRatio} onClick={() => run({ kind: "ratio", node: selection.node, locked: !selection.lockRatio })} />
          <IconButton label={uploading ? "上传中…" : "替换图片"} icon={uploading ? LoaderCircle : ImagePlus} className={uploading ? "[&>svg]:animate-spin" : ""} onClick={() => file.current?.click()} />
          <input ref={file} type="file" aria-label="上传替换图片" accept=".png,.jpg,.jpeg,.gif,.webp,.bmp,.avif" className="hidden" onChange={event => { const image = event.target.files?.[0]; if (image) { const operation = replaceImage(image); onPending?.(operation); void operation.catch(() => {}); } }} />
        </>}
        {TOOLBAR_TOOLS[selection.kind].map(tool => <ToolControl key={`${selection.node}-${tool.id}`} tool={tool} selection={selection} command={run} />)}
        {selection.kind === "scene" && <HintIcon label="绘制场景仅支持整体移动" icon={Move} />}
        {!selection.resizable && selection.kind !== "scene" && <HintIcon label="行内或变换元素可移动，文字大小通过字号调整" />}
      </> : <HintIcon label="单击选中元素 · 拖动手柄移动或缩放 · 双击修改文字" />}
    </fieldset>
    {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
  </div>;
}
