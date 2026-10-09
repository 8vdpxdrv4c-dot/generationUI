"use client";

import React, { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GenerationPreviewContext } from "./preview-context";
import { resolveSizingMode, sizingConfiguration, validContentHeight } from "./sizing";
import { useSandboxFunctions } from "@copilotkit/react-core/v2";
import { ExportOverlay } from "../export-overlay";
import { assembleStandaloneHtmlFromActivity } from "../export-utils";
import { notifyHistoryChanged, type DesignSource } from "@/lib/history";
import {
  consumePendingRedesign,
  peekPendingRedesign,
} from "@/lib/history/pending-redesign";
import { IDIOMORPH_JS } from "../idiomorph-inline";
import type { OpenGenUIContent } from "./schema";
import {
  buildFinalFrameContent,
  buildPreviewBodyMorph,
  buildPreviewHeadContent,
  MEASUREMENT_JS,
  PREVIEW_FRAME_CONTENT,
  RESIZE_MESSAGE_TYPE,
} from "./frame-content";
import { extractCompleteStyles, processPartialHtml } from "./process-partial-html";
import { loadWebsandbox, type SandboxInstance } from "./websandbox-loader";
import {
  getJavaScriptSyntaxError,
  repairGeneratedJavaScript,
} from "./generated-code";
import { runSandboxExpression } from "./sandbox-execution";
import { completedContentError } from "./content-validation";
import { localizeResourceReferences } from "@repo/design-system";
import { applyPageEdit, prepareEditableHtml, isEditorSnapshot, type PageEdit, type EditorSnapshot, type EditorCommand } from "./editor-source";
import { editorRuntimeScript } from "./editor-runtime";
import { EditorToolbar } from "./editor-toolbar";

export const THROTTLE_MS = 1000;

/**
 * Clamp a sandbox-reported height to the allowed range. Returns null for
 * anything that is not a finite number (NaN/Infinity pass a bare typeof
 * check and would otherwise poison the container height).
 */
export function clampReportedHeight(height: unknown): number | null {
  return validContentHeight(height, "component");
}

export const LOADING_PHRASES = [
  "正在勾勒像素",
  "正在连接节点",
  "正在铺上渐变",
  "正在编译画面",
  "正在排列元素",
  "正在渲染效果",
  "正在打磨细节",
];

function useLoadingPhrase(active: boolean) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % LOADING_PHRASES.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [active]);
  return LOADING_PHRASES[index];
}

interface OpenGenUIActivityRendererProps {
  activityType: string;
  content: OpenGenUIContent;
  message: unknown;
  agent: unknown;
}

/**
 * Returns true when the inner component should re-render immediately
 * (no throttle delay).
 */
function shouldFlushImmediately(
  prev: OpenGenUIContent | null,
  next: OpenGenUIContent
): boolean {
  if (next.cssComplete && (!prev || !prev.cssComplete)) return true;
  if (next.htmlComplete && !prev?.htmlComplete) return true;
  if (next.htmlComplete && next.html !== prev?.html && next.html?.join("") !== prev?.html?.join("")) return true;
  if (next.generating === false && prev?.generating !== false) return true;
  if (next.jsFunctionsComplete && !prev?.jsFunctionsComplete) return true;
  if (next.jsExpressionsComplete && !prev?.jsExpressionsComplete) return true;
  if (next.error !== prev?.error) return true;
  if (next.editRevision !== prev?.editRevision) return true;
  if (next.jsFunctions && (!prev || !prev.jsFunctions)) return true;
  if ((next.jsExpressions?.length ?? 0) > (prev?.jsExpressions?.length ?? 0))
    return true;
  if (next.html?.length && (!prev || !prev.html?.length)) return true;
  return false;
}

/**
 * Outer wrapper — absorbs every parent re-render but only forwards
 * throttled content snapshots to the memoized inner component.
 */
export const OpenGenUIActivityRenderer: React.FC<OpenGenUIActivityRendererProps> =
  function OpenGenUIActivityRenderer(props) {
    const preview = useContext(GenerationPreviewContext);
    if (!preview) return <ThrottledActivityRenderer {...props} />;
    const messageId = (props.message as { id?: string })?.id;
    const selected = messageId === preview.selectedId;
    return <>
      <button type="button" className="my-2 rounded-lg border px-3 py-2 text-xs" onClick={() => messageId && preview.onSelect(messageId)}>
        {props.content.generating ? "页面生成中" : "生成的页面"} · {selected ? "正在右侧预览" : "查看预览"}
      </button>
      {selected && preview.target && createPortal(<ThrottledActivityRenderer {...props} />, preview.target, messageId)}
    </>;
  };

const ThrottledActivityRenderer: React.FC<OpenGenUIActivityRendererProps> =
  function OpenGenUIActivityRenderer({ content, message }) {
    const [throttledContent, setThrottledContent] =
      useState<OpenGenUIContent>(content);
    const [prevContent, setPrevContent] = useState(content);
    const latestContentRef = useRef(content);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Synchronous state adjustment during render (React-approved pattern):
    // immediate-flush updates reach the inner component in the same pass.
    if (content !== prevContent) {
      setPrevContent(content);
      if (shouldFlushImmediately(throttledContent, content)) {
        setThrottledContent(content);
      }
    }

    useEffect(() => {
      latestContentRef.current = content;
    });

    const flush = useCallback(() => {
      timerRef.current = null;
      setThrottledContent(latestContentRef.current);
    }, []);

    useEffect(() => {
      if (throttledContent === content) {
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        return;
      }
      if (timerRef.current === null) {
        timerRef.current = setTimeout(flush, THROTTLE_MS);
      }
    }, [content, throttledContent, flush]);

    useEffect(() => {
      return () => {
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
        }
      };
    }, []);

    return <OpenGenUIActivityRendererInner content={throttledContent} messageId={(message as { id?: string })?.id} />;
  };

interface InnerProps {
  content: OpenGenUIContent;
  messageId?: string;
}

function styleIframe(iframe: HTMLIFrameElement) {
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "none";
  iframe.style.backgroundColor = "transparent";
}

const OpenGenUIActivityRendererInner = React.memo(
  function OpenGenUIActivityRendererInner({ content, messageId }: InnerProps) {
    const preview = useContext(GenerationPreviewContext);
    const editing = preview?.editing;
    const editingRef = useRef(editing);
    editingRef.current = editing;
    const editable = !!editing && !!messageId;
    const [editingEnabled, setEditingEnabled] = useState(true);
    const [editorSnapshot, setEditorSnapshot] = useState<EditorSnapshot>({ selection: null, canUndo: false, canRedo: false });
    const [editorReady, setEditorReady] = useState(false);
    const [editorError, setEditorError] = useState<string | null>(null);
    const editorErrorRef = useRef<string | null>(null);
    const editorChannel = useRef("");
    const pendingToolbar = useRef<Promise<void> | null>(null);
    const [toolbarBusy, setToolbarBusy] = useState(false);
    const effectiveHtml = content.editedHtml ?? (content.html ?? []).join("");
    const effectiveHtmlRef = useRef(effectiveHtml);
    effectiveHtmlRef.current = effectiveHtml;
    const sizingMode = resolveSizingMode((content.html ?? []).join(""), !!preview);
    const [viewportHeight, setViewportHeight] = useState(0);
    const initialHeight = validContentHeight(content.initialHeight, sizingMode) ?? 200;
    const [autoHeight, setAutoHeight] = useState<number | null>(null);
    const [runtimeError, setRuntimeError] = useState<string | null>(null);
    const outputError = completedContentError(content);
    const sandboxFunctions = useSandboxFunctions();
    const functionsRef = useRef(sandboxFunctions);
    useLayoutEffect(() => { functionsRef.current = sandboxFunctions; }, [sandboxFunctions]);
    const functionNames = sandboxFunctions.map((fn) => fn.name).sort().join("\0");
    const localApi = useMemo(() => {
      const api: Record<string, (args: unknown) => unknown> = {};
      for (const name of functionNames.split("\0").filter(Boolean)) {
        api[name] = (args) => functionsRef.current.find((fn) => fn.name === name)?.handler(args);
      }
      return api;
    }, [functionNames]);

    const fullHtml =
      !outputError && content.htmlComplete && content.html?.length
        ? repairGeneratedJavaScript(content.html.join(""))
        : undefined;

    const assetOrigin = typeof window === "undefined" ? undefined : window.location.origin;
    const css = content.cssComplete ? localizeResourceReferences(content.css ?? "", assetOrigin) : undefined;
    const jsFunctions = useMemo(
      () => localizeResourceReferences(repairGeneratedJavaScript(content.jsFunctions ?? ""), assetOrigin),
      [content.jsFunctions, assetOrigin],
    );
    const jsExpressions = useMemo(
      () => (content.jsExpressions ?? []).map(code => localizeResourceReferences(repairGeneratedJavaScript(code), assetOrigin)),
      [content.jsExpressions, assetOrigin],
    );
    const jsFunctionsReady =
      content.jsFunctionsComplete === true ||
      (content.jsFunctionsComplete === undefined && content.generating === false);

    // CSS-first gating: no visible preview until cssComplete.
    const cssReady = !!content.cssComplete;
    const partialHtml =
      !content.htmlComplete && content.html?.length
        ? content.html.join("")
        : undefined;
    const previewBody = partialHtml ? processPartialHtml(partialHtml) : undefined;
    const previewStyles = partialHtml ? extractCompleteStyles(partialHtml) : "";
    const hasPreview = cssReady && !!previewBody?.trim();
    const hasVisibleSandbox = !!fullHtml || hasPreview;

    const containerRef = useRef<HTMLDivElement>(null);
    /** When this widget mounted — a redesign marker set before that instant
     *  belongs to some other widget, not to this one. */
    const [mountTime] = useState(() => Date.now());
    const sandboxRef = useRef<SandboxInstance | null>(null);
    const previewSandboxRef = useRef<SandboxInstance | null>(null);
    const previewReadyRef = useRef(false);
    const sandboxReadyRef = useRef(false);
    const executedIndexRef = useRef(0);
    const jsFunctionsInjectedRef = useRef(false);
    const executionRef = useRef<Promise<unknown>>(Promise.resolve());
    const abortRef = useRef<AbortController | null>(null);
    const executionFailedRef = useRef(false);
    const pumpRef = useRef<() => void>(() => {});
    const sizingRef = useRef({ mode: sizingMode, viewportHeight });

    // Source + nonce validation is required: the frame has an opaque origin.
    useEffect(() => {
      if (!editable) return;
      const receive = (event: MessageEvent) => {
        if (event.source !== sandboxRef.current?.iframe.contentWindow || event.data?.channel !== editorChannel.current) return;
        if (event.data?.type === "__ogui_editor_state") {
          if (isEditorSnapshot(event.data.snapshot)) setEditorSnapshot(event.data.snapshot);
          return;
        }
        if (event.data?.type !== "__ogui_edit") return;
        try {
          editingRef.current?.commit(messageId!, event.data.edit as PageEdit);
          effectiveHtmlRef.current = applyPageEdit(effectiveHtmlRef.current, event.data.edit as PageEdit);
          editorErrorRef.current = null;
          setEditorError(null);
        } catch (error) {
          editorErrorRef.current = error instanceof Error ? error.message : "无法同步页面修改";
          setEditorError(editorErrorRef.current);
        }
      };
      window.addEventListener("message", receive);
      return () => window.removeEventListener("message", receive);
    }, [editable, messageId]);

    const executeEditor = useCallback(async (command?: EditorCommand) => {
      const sandbox = sandboxRef.current;
      if (!sandbox || !sandboxReadyRef.current || !editorChannel.current) {
        if (command) throw new Error("页面已切换，请重新选择元素");
        return;
      }
      const channel = editorChannel.current;
      const request = crypto.randomUUID();
      await new Promise<void>((resolve, reject) => {
        const finish = (error?: Error) => { clearTimeout(timeout); window.removeEventListener("message", receive); error ? reject(error) : resolve(); };
        const receive = (event: MessageEvent) => {
          if (event.source === sandbox.iframe.contentWindow && event.data?.channel === channel && event.data?.type === "__ogui_edit_flushed" && event.data.request === request) finish(editorErrorRef.current ? new Error(editorErrorRef.current) : undefined);
        };
        const timeout = setTimeout(() => finish(new Error("页面编辑同步超时，请重试")), 4000);
        window.addEventListener("message", receive);
        const operation = command ? `command(${JSON.stringify(command)})` : "flush()";
        void sandbox.run(`window.__oguiEditor?.${operation};parent.postMessage({type:"__ogui_edit_flushed",channel:${JSON.stringify(channel)},request:${JSON.stringify(request)}},"*");`).catch(error => finish(error instanceof Error ? error : new Error("无法同步页面编辑")));
      });
    }, []);
    const flushEditor = useCallback(async () => {
      if (pendingToolbar.current) await pendingToolbar.current;
      await executeEditor();
    }, [executeEditor]);

    useEffect(() => {
      if (!editable || !editing || !messageId) return;
      return editing.register(messageId, { flush: flushEditor });
    }, [editable, editing?.register, messageId, flushEditor]);

    useEffect(() => {
      if (!editorReady) return;
      const enabled = editingEnabled && !editing?.isRunning && content.generating === false;
      void sandboxRef.current?.run(`window.__oguiEditor?.enable(${JSON.stringify(enabled)});`);
    }, [editingEnabled, editing?.isRunning, editorReady, content.generating]);

    // Observe the scroll viewport, not the content whose height we are changing.
    useEffect(() => {
      if (sizingMode !== "page") return;
      const viewport = containerRef.current?.closest<HTMLElement>("[data-ui-preview-viewport]");
      const measure = () => {
        const style = viewport ? getComputedStyle(viewport) : null;
        const padding = style ? (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0) : 0;
        const toolbar = containerRef.current?.parentElement?.querySelector<HTMLElement>("[data-ogui-toolbar]");
        const toolsHeight = toolbar ? toolbar.offsetHeight + (parseFloat(getComputedStyle(toolbar).marginBottom) || 0) : 0;
        setViewportHeight(Math.max(0, (viewport?.clientHeight ?? window.innerHeight) - padding - toolsHeight));
      };
      measure();
      const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
      if (viewport) observer?.observe(viewport);
      const toolbar = containerRef.current?.parentElement?.querySelector<HTMLElement>("[data-ogui-toolbar]");
      if (toolbar) observer?.observe(toolbar);
      window.addEventListener("resize", measure);
      return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
    }, [sizingMode, preview?.target, editingEnabled, editorReady]);

    useEffect(() => {
      sizingRef.current = { mode: sizingMode, viewportHeight };
      const code = sizingConfiguration(sizingMode, viewportHeight);
      if (sandboxReadyRef.current) sandboxRef.current?.run(code);
      if (previewReadyRef.current) previewSandboxRef.current?.run(code);
    }, [sizingMode, viewportHeight]);

    // Streaming and final frames share the same resize protocol.
    useEffect(() => {
      const onMessage = (event: MessageEvent) => {
        if (!event.source || (event.source !== sandboxRef.current?.iframe.contentWindow && event.source !== previewSandboxRef.current?.iframe.contentWindow)) return;
        if (event.data?.type !== RESIZE_MESSAGE_TYPE) return;
        const next = validContentHeight(event.data.height, sizingRef.current.mode);
        if (next !== null) setAutoHeight(next);
      };
      window.addEventListener("message", onMessage);
      return () => window.removeEventListener("message", onMessage);
    }, []);

    // Effect 0 — Preview sandbox creation
    useEffect(() => {
      const container = containerRef.current;
      if (!container || fullHtml || !hasPreview || previewSandboxRef.current)
        return;

      let cancelled = false;

      loadWebsandbox()
        .then((Websandbox) => {
          if (cancelled) return;

          const sandbox = Websandbox.create(
            {},
            {
              frameContainer: container,
              frameContent: PREVIEW_FRAME_CONTENT,
              allowAdditionalAttributes: "",
            }
          );
          previewSandboxRef.current = sandbox;
          styleIframe(sandbox.iframe);

          sandbox.promise.then(() => {
            if (cancelled) return;
            previewReadyRef.current = true;

            sandbox.run(IDIOMORPH_JS);
            sandbox.run(
              `document.head.innerHTML = ${JSON.stringify(
                buildPreviewHeadContent(css, previewStyles)
              )}`
            );
            if (previewBody) {
              sandbox.run(buildPreviewBodyMorph(previewBody));
            }
            sandbox.run(MEASUREMENT_JS);
            sandbox.run(sizingConfiguration(sizingRef.current.mode, sizingRef.current.viewportHeight));
          });
        })
        .catch((err: unknown) => {
          console.error("[OpenGenUI] Failed to load sandbox module:", err);
        });

      return () => {
        cancelled = true;
      };
    }, [hasPreview, fullHtml]); // eslint-disable-line react-hooks/exhaustive-deps

    // Effect 0b — Preview content updates (head styles + morphed body)
    useEffect(() => {
      const sandbox = previewSandboxRef.current;
      if (!sandbox || !previewReadyRef.current) return;
      sandbox.run(
        `document.head.innerHTML = ${JSON.stringify(
          buildPreviewHeadContent(css, previewStyles)
        )}`
      );
      if (!previewBody) return;
      sandbox.run(buildPreviewBodyMorph(previewBody));
      sandbox.run(sizingConfiguration(sizingRef.current.mode, sizingRef.current.viewportHeight));
    }, [previewBody, previewStyles, css]);

    // Effect 1 — Final sandbox lifecycle (depends on fullHtml)
    useEffect(() => {
      const container = containerRef.current;
      if (!container || !fullHtml) return;

      if (previewSandboxRef.current) {
        previewSandboxRef.current.destroy();
        previewSandboxRef.current = null;
        previewReadyRef.current = false;
      }

      let cancelled = false;

      executedIndexRef.current = 0;
      jsFunctionsInjectedRef.current = false;
      sandboxReadyRef.current = false;
      executionRef.current = Promise.resolve();
      executionFailedRef.current = false;
      const abort = new AbortController();
      abortRef.current = abort;
      setEditorReady(false);
      const channel = editable ? crypto.randomUUID() : "";
      editorChannel.current = channel;
      const prepared = editable ? prepareEditableHtml(repairGeneratedJavaScript(effectiveHtmlRef.current)) : null;

      loadWebsandbox()
        .then((Websandbox) => {
          if (cancelled) return;

          setRuntimeError(null);
          const sandbox = Websandbox.create(localApi, {
            frameContainer: container,
            frameContent: buildFinalFrameContent(prepared?.html ?? fullHtml, css, window.location.origin),
            allowAdditionalAttributes: "",
          });
          sandboxRef.current = sandbox;
          styleIframe(sandbox.iframe);

          sandbox.promise.then(async () => {
            if (cancelled) return;
            sandboxReadyRef.current = true;

            sandbox.run(MEASUREMENT_JS);
            sandbox.run(sizingConfiguration(sizingRef.current.mode, sizingRef.current.viewportHeight));

            if (prepared) {
              await sandbox.run(editorRuntimeScript(prepared.nodes, channel));
              if (cancelled) return;
              setEditorReady(true);
            }

            pumpRef.current();
          });
        })
        .catch((err: unknown) => {
          console.error("[OpenGenUI] Failed to load sandbox module:", err);
        });

      return () => {
        cancelled = true;
        abort.abort();
        if (previewSandboxRef.current) {
          previewSandboxRef.current.destroy();
          previewSandboxRef.current = null;
          previewReadyRef.current = false;
        }
        if (sandboxRef.current) {
          sandboxRef.current.destroy();
          sandboxRef.current = null;
        }
        sandboxReadyRef.current = false;
        setAutoHeight(null);
      };
    }, [fullHtml, css, localApi, editable]);

    // One execution queue per frame: async initialization must finish before
    // subsequent expressions bind buttons or inspect the scene.
    useEffect(() => {
      pumpRef.current = () => {
        const sandbox = sandboxRef.current;
        const abort = abortRef.current;
        if (!sandbox || !sandboxReadyRef.current || !abort || abort.signal.aborted || executionFailedRef.current) return;
        if (jsFunctions && !jsFunctionsReady) return;
        const scripts: Array<{ code: string; expression: boolean }> = [];
        if (jsFunctions && !jsFunctionsInjectedRef.current) {
          const syntaxError = getJavaScriptSyntaxError(jsFunctions);
          if (syntaxError) {
            executionFailedRef.current = true;
            setRuntimeError("页面交互代码不完整，请重新生成。");
            return;
          }
          jsFunctionsInjectedRef.current = true;
          scripts.push({ code: jsFunctions, expression: false });
        }
        // Do not start expressions from a partial definitions snapshot.
        if (jsFunctionsReady) {
          scripts.push(...jsExpressions.slice(executedIndexRef.current).map((code) => ({ code, expression: true })));
          executedIndexRef.current = jsExpressions.length;
        }
        executionRef.current = executionRef.current.then(async () => {
          for (const script of scripts) {
            if (abort.signal.aborted || executionFailedRef.current) return;
            if (script.expression) await runSandboxExpression(sandbox, script.code, abort.signal);
            else await sandbox.run(script.code);
          }
        }).catch((error: unknown) => {
          if (abort.signal.aborted) return;
          executionFailedRef.current = true;
          console.error("[OpenGenUI] Scene initialization failed:", error);
          setRuntimeError("场景初始化失败或超时，请重新生成。 ");
        });
      };
      pumpRef.current();
    }, [jsFunctions, jsFunctionsReady, jsExpressions]);

    // Effect 4 — destroy any remaining sandbox on unmount
    useEffect(() => {
      return () => {
        if (previewSandboxRef.current) {
          previewSandboxRef.current.destroy();
          previewSandboxRef.current = null;
        }
        if (sandboxRef.current) {
          sandboxRef.current.destroy();
          sandboxRef.current = null;
        }
      };
    }, []);

    const height = sizingMode === "page"
      ? Math.max(viewportHeight, autoHeight ?? initialHeight)
      : autoHeight ?? initialHeight;
    const isGenerating = content.generating !== false;
    const showLoading = isGenerating && !hasVisibleSandbox;
    const loadingPhrase = useLoadingPhrase(showLoading);

    const isComplete = !isGenerating && !!content.htmlComplete && !outputError && !runtimeError;
    const exportHtml = useMemo(
      () =>
        isComplete
          ? assembleStandaloneHtmlFromActivity({
              css: content.css,
              html: [repairGeneratedJavaScript(effectiveHtml)],
              jsFunctions,
              jsExpressions,
            }, "generated-widget", typeof window === "undefined" ? undefined : window.location.origin)
          : undefined,
      [isComplete, content, effectiveHtml, jsFunctions, jsExpressions]
    );

    // The page's *source*, in the same shape the generateSandboxedUi contract
    // uses. Stored instead of the assembled document so a later redesign hands
    // the agent a baseline it does not have to reverse-engineer.
    const pageSource = useMemo<DesignSource | undefined>(
      () =>
        isComplete && content.htmlComplete
          ? {
              format: "sandboxed-ui",
              css: content.css ?? "",
              html: repairGeneratedJavaScript(effectiveHtml),
              jsFunctions,
              jsExpressions,
            }
          : undefined,
      [isComplete, content, effectiveHtml, jsFunctions, jsExpressions]
    );

    // A redesign started in the sidebar leaves a marker. The first page that
    // completes after it was set is that redesign's output, so file it back as
    // a new version of the same asset instead of leaving an orphan entry.
    const filedRef = useRef(false);
    useEffect(() => {
      if (!isComplete || !pageSource || filedRef.current) return;
      const pending = peekPendingRedesign();
      // A widget that mounted *before* the redesign was submitted is not its
      // output — only a page that appeared afterwards belongs to this asset.
      if (!pending || mountTime < pending.startedAt) return;
      consumePendingRedesign();
      filedRef.current = true;
      void fetch(`/api/history/${pending.assetId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: pageSource,
          requirement: pending.requirement,
          componentType: "openGenUI",
        }),
      })
        .then(() => notifyHistoryChanged())
        .catch(() => {
          /* the page is still on screen; only the filing failed */
        });
    }, [isComplete, pageSource, mountTime]);

    const frame = (<>
      {editorError && <p role="alert" className="text-xs text-red-600">{editorError}</p>}
      {(outputError || runtimeError) && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">{outputError || runtimeError}</div>}
      <div
        ref={containerRef}
        data-ui-sizing={sizingMode}
        style={{
          position: "relative",
          width: "100%",
          height: `${height}px`,
          borderRadius: "12px",
          backgroundColor: hasVisibleSandbox
            ? "transparent"
            : "var(--color-background-secondary, #f7f6f3)",
          border: hasVisibleSandbox
            ? "none"
            : "1px solid var(--color-border-tertiary, rgba(0, 0, 0, 0.15))",
          overflow: "hidden",
          transition: sizingMode === "page" ? "none" : "height 200ms ease-out",
          display: outputError ? "none" : undefined,
        }}
      >
        {showLoading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                border: "2px solid var(--color-border-tertiary, rgba(0, 0, 0, 0.1))",
                borderTopColor: "var(--color-text-secondary, #73726c)",
                animation: "ogui-spin 0.8s linear infinite",
                flexShrink: 0,
              }}
            />
            <span
              className="generation-status-shimmer"
            >
              {loadingPhrase}…
            </span>
            <style>{`@keyframes ogui-spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}
      </div>
    </>);

    // Always wrap in ExportOverlay so the rendered tree shape never changes:
    // switching the root from the bare frame div to a wrapper when isComplete
    // flips would remount the container and silently destroy the live
    // websandbox iframe created during the htmlComplete && generating window.
    return (
      <ExportOverlay
        title="generated-widget"
        html={exportHtml}
        source={pageSource}
        componentType="openGenUI"
        ready={isComplete}
        prepareExport={editable ? async () => {
          await flushEditor();
          const source: DesignSource = { format: "sandboxed-ui", css: content.css ?? "", html: repairGeneratedJavaScript(effectiveHtmlRef.current), jsFunctions, jsExpressions };
          return { source, html: assembleStandaloneHtmlFromActivity({ ...source, html: [source.html] }, "generated-widget", window.location.origin) };
        } : undefined}
        editorActions={editable ? <>
          <button type="button" aria-pressed={editingEnabled} disabled={!isComplete || !editorReady || editing?.isRunning || toolbarBusy}
            className="rounded-lg border px-2.5 py-2 text-xs disabled:opacity-40" onClick={() => setEditingEnabled(value => !value)}>
            {editingEnabled ? "交互预览" : "返回编辑"}
          </button>
          <span role="status" className="text-xs opacity-70">
            {editing?.saveState === "saving" ? "保存中…" : editing?.saveState === "saved" ? "已自动保存" : ""}
          </span>
          {editing?.saveState === "error" && <button type="button" className="text-xs text-red-600" onClick={editing.retry}>保存失败，重试</button>}
        </> : undefined}
      >
        {editable && isComplete && editingEnabled && <EditorToolbar snapshot={editorSnapshot} command={executeEditor} disabled={!editorReady || !!editing?.isRunning} onPending={operation => {
          pendingToolbar.current = operation;
          setToolbarBusy(true);
          const clear = () => { if (pendingToolbar.current === operation) { pendingToolbar.current = null; setToolbarBusy(false); } };
          void operation.then(clear, clear);
        }} />}
        {frame}
      </ExportOverlay>
    );
  },
  (prev, next) => prev.content === next.content && prev.messageId === next.messageId
);
