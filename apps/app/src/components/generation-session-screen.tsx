"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  CopilotChat,
  CopilotChatInput,
  CopilotChatConfigurationProvider,
} from "@copilotkit/react-core/v2";
import { useConversationAgent } from "@/hooks/use-conversation-agent";
import { useGenerationEditor } from "@/hooks/use-generation-editor";
import { GenerationToolCallsView } from "@/components/generative-ui/generation-tool-calls";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { GenerationPreviewContext, latestPreviewMessageId } from "@/components/generative-ui/open-generative-ui/preview-context";
import { shouldRestoreGenerationMessages, type GenerationSession } from "@/lib/generations";
import { TemplateLibrary } from "@/components/template-library";
import { TemplateChip } from "@/components/template-library/template-chip";
import type { ReferenceKind } from "@/components/template-library/types";

const OpenLibraryContext = createContext<(kind: ReferenceKind) => void>(() => {});
const BeforeSubmitContext = createContext<() => Promise<void>>(async () => {});
const GenerationMessagesContext = createContext<ComponentProps<typeof CopilotChat.View>["messages"]>(undefined);

const GenerationChatView = Object.assign(function GenerationChatView(props: ComponentProps<typeof CopilotChat.View>) {
  const beforeSubmit = useContext(BeforeSubmitContext);
  const messages = useContext(GenerationMessagesContext);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const submit = async (value: string) => {
    if (submitting) return;
    setSubmitting(true); setSubmitError(false);
    try { await beforeSubmit(); props.onSubmitMessage?.(value); }
    catch { setSubmitError(true); }
    finally { setSubmitting(false); }
  };
  return <>
    {submitError && <p role="alert" className="px-3 text-xs text-red-600">页面修改尚未保存，需求未发送。请重试发送。</p>}
    <CopilotChat.View {...props} messages={messages ?? props.messages} isRunning={props.isRunning || submitting} onSubmitMessage={submit} />
  </>;
}, CopilotChat.View);

const GenerationChatInput = Object.assign(function GenerationChatInput(props: ComponentProps<typeof CopilotChatInput>) {
  const openLibrary = useContext(OpenLibraryContext);
  return <div className="shrink-0">
    <div className="flex flex-wrap gap-2 px-2 pb-2" aria-label="参考库">
      <button type="button" className="rounded-full border border-black/10 px-3 py-1.5 text-xs dark:border-white/15" onClick={() => openLibrary("page")}>模板库</button>
      <button type="button" className="rounded-full border border-black/10 px-3 py-1.5 text-xs dark:border-white/15" onClick={() => openLibrary("component")}>组件库</button>
    </div>
    <CopilotChatInput {...props} />
  </div>;
}, CopilotChatInput);

export function GenerationSessionScreen({
  mode,
}: {
  mode: "overlay" | "page";
}) {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { agent, isReady } = useConversationAgent({ threadId: id });
  const isRunning = agent.isRunning;
  const [session, setSession] = useState<GenerationSession | null>(null);
  const [error, setError] = useState(false);
  const [libraryKind, setLibraryKind] = useState<ReferenceKind | null>(null);
  const readyRef = useRef<{ agent: typeof agent; id: string } | null>(null);
  // CopilotKit replaces its provisional thread clone after connecting. An old
  // subscription must never save that clone's empty messages over disk history.
  useLayoutEffect(() => { readyRef.current = null; }, [agent, id]);
  const [previewTarget, setPreviewTarget] = useState<HTMLDivElement | null>(null);
  const [previewActionsTarget, setPreviewActionsTarget] = useState<HTMLDivElement | null>(null);
  const [selectedPreviewId, setSelectedPreviewId] = useState<string | null>(null);
  const latestPreviewId = useRef<string | null>(null);
  const { persist, beforeSubmit, editing, messages: editedMessages } = useGenerationEditor(agent, id, session, readyRef, selectedPreviewId);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/generations/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("generation session not found");
        return (await res.json()) as { item: GenerationSession };
      })
      .then(({ item }) => {
        if (cancelled) return;
        // A full reload creates a fresh client thread clone. Restore its saved
        // AG-UI messages, including generated activity payloads.
        if (shouldRestoreGenerationMessages(agent.messages, item.messages, isRunning)) {
          agent.setMessages(item.messages as Parameters<typeof agent.setMessages>[0]);
        }
        setSession(item);
        const previewId = latestPreviewMessageId(agent.messages) ?? latestPreviewMessageId(item.messages);
        latestPreviewId.current = previewId;
        setSelectedPreviewId(previewId);
        readyRef.current = { agent, id };
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => { cancelled = true; };
    // Connecting also marks a thread running; check again when it becomes idle.
  }, [agent, id, isRunning]);

  useEffect(() => {
    if (!session) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const queueSave = () => {
      const previewId = latestPreviewMessageId(agent.messages);
      if (previewId !== latestPreviewId.current) {
        latestPreviewId.current = previewId;
        setSelectedPreviewId(previewId);
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void persist().catch(() => {}); }, 650);
    };
    const subscription = agent.subscribe({
      onMessagesChanged: queueSave,
      onRunInitialized: queueSave,
      onRunFinalized: () => { void persist(true).catch(() => {}); },
      onRunFailed: () => { void persist(true).catch(() => {}); },
    });
    queueSave();
    return () => {
      if (timer) clearTimeout(timer);
      subscription.unsubscribe();
      void persist().catch(() => {});
    };
  }, [agent, persist, session]);

  // Activity renderers require the registered agent, not the provisional cold-load clone.
  const conversation = !isReady ? <p className="p-3 text-xs opacity-60">正在连接生成服务…</p> : mode === "overlay" ? (
    <CopilotChatConfigurationProvider threadId={id}>
      <CopilotChat.View
        messageView={{ assistantMessage: { toolCallsView: GenerationToolCallsView } }}
        messages={editedMessages}
        isRunning={agent.isRunning}
        input="hidden"
        welcomeScreen={false}
      />
    </CopilotChatConfigurationProvider>
  ) : (
    <>
      <TemplateChip threadId={id} />
      <OpenLibraryContext.Provider value={setLibraryKind}>
        <BeforeSubmitContext.Provider value={beforeSubmit}>
          <GenerationMessagesContext.Provider value={editedMessages}>
            <CopilotChat threadId={id} chatView={GenerationChatView} input={GenerationChatInput} messageView={{ assistantMessage: { toolCallsView: GenerationToolCallsView } }} labels={{ chatDisclaimerText: "生成内容和对话会自动保存到历史记录。" }} />
          </GenerationMessagesContext.Provider>
        </BeforeSubmitContext.Provider>
      </OpenLibraryContext.Provider>
    </>
  );

  return (
    <main
      className={`brand-shell generation-session-screen generation-session-screen--${mode} h-dvh${mode === "overlay" ? " fixed inset-0 z-[100]" : ""}`}
      style={{ position: mode === "overlay" ? "fixed" : "relative", zIndex: 100 }}
    >
      <div className="brand-glass-container">
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/30 dark:border-white/8">
          <div className="min-w-0">
            <p className="m-0 text-xs" style={{ color: "var(--text-tertiary)" }}>生成过程</p>
            <h1 className="m-0 truncate text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {session?.title ?? (error ? "记录不存在" : "正在加载…")}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium"
            style={{
              color: "var(--text-secondary)",
              border: "1px solid var(--color-border-glass, rgba(0,0,0,0.12))",
              background: "var(--surface-primary, rgba(255,255,255,0.6))",
            }}
          >
            返回新建
          </button>
        </header>
        {error ? (
          <div className="flex flex-1 items-center justify-center text-sm" style={{ color: "var(--text-secondary)" }}>
            找不到这条生成记录。
          </div>
        ) : session ? (
          <GenerationPreviewContext.Provider value={{ target: previewTarget, actionsTarget: previewActionsTarget, selectedId: selectedPreviewId, onSelect: setSelectedPreviewId, editing }}>
            <ResizablePanelGroup orientation="horizontal" className="generation-split flex-1 min-h-0" id={`generation-${id}`}>
              <ResizablePanel id="conversation" defaultSize="30%" minSize="20%">
                <section aria-label="生成对话" className="generation-conversation h-full min-h-0 flex flex-col px-3">
                  {conversation}
                </section>
              </ResizablePanel>
              <ResizableHandle withHandle aria-label="调整对话与预览宽度" className="w-2 cursor-col-resize bg-black/5 hover:bg-blue-400/30 dark:bg-white/10" />
              <ResizablePanel id="preview" defaultSize="70%" minSize="30%">
                <section aria-label="生成页面预览" className="h-full min-h-0 flex flex-col">
                  <div className="relative z-20 flex shrink-0 items-center justify-between gap-3 border-b border-black/5 px-4 py-2 text-xs dark:border-white/10">
                    <span className="shrink-0">页面预览</span>
                    <div ref={setPreviewActionsTarget} className="flex min-w-0 items-center" aria-label="页面预览操作" />
                  </div>
                  <div data-ui-preview-viewport className="flex-1 min-h-0 overflow-auto p-4">
                    {!selectedPreviewId && <p className="text-sm text-center opacity-60 mt-12">生成的页面将在这里实时显示</p>}
                    <div ref={setPreviewTarget} className="generation-preview min-w-0" />
                  </div>
                </section>
              </ResizablePanel>
            </ResizablePanelGroup>
          </GenerationPreviewContext.Provider>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm" style={{ color: "var(--text-secondary)" }}>
            正在加载对话和生成内容…
          </div>
        )}
      </div>
      {mode === "page" && <TemplateLibrary threadId={id} kind={libraryKind ?? "page"} open={libraryKind !== null} onClose={() => setLibraryKind(null)} />}
    </main>
  );
}
