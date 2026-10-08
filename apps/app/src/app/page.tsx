"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ExampleLayout } from "@/components/example-layout";
import { useExampleSuggestions } from "@/hooks";
import { ExplainerCardsPortal } from "@/components/explainer-cards";
import { DemoGallery, type DemoItem } from "@/components/demo-gallery";
import { DesktopTipModal } from "@/components/desktop-tip-modal";
import { QrModal } from "@/components/qr-modal";
import { TemplateLibrary } from "@/components/template-library";
import type { ReferenceKind } from "@/components/template-library/types";
import { TemplateChip } from "@/components/template-library/template-chip";
import { HomeTemplateGallery } from "@/components/home-template-gallery";
import { HomeChatView } from "@/components/home-chat-view";
import { generationSessionTitle } from "@/lib/generations";
import { CopilotChat, useCopilotKit } from "@copilotkit/react-core/v2";
import { useConversationAgent } from "@/hooks/use-conversation-agent";
import { ChevronLeft, ChevronRight, Component, History, Layers3, Plus, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

function subscribeToCompactViewport(onChange: () => void) {
  const media = window.matchMedia("(max-width: 760px)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getCompactViewport() {
  return window.matchMedia("(max-width: 760px)").matches;
}

export default function HomePage() {
  useExampleSuggestions();

  const [demoDrawerOpen, setDemoDrawerOpen] = useState(false);
  const [templateDrawerOpen, setTemplateDrawerOpen] = useState(false);
  const [libraryKind, setLibraryKind] = useState<ReferenceKind>("page");
  const openLibrary = (kind: ReferenceKind) => {
    setLibraryKind(kind);
    setTemplateDrawerOpen(true);
  };
  const compactViewport = useSyncExternalStore(subscribeToCompactViewport, getCompactViewport, () => false);
  const [sidebarOverride, setSidebarOverride] = useState<boolean | null>(null);
  const sidebarCollapsed = sidebarOverride ?? compactViewport;
  const [qrOpen, setQrOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [qrSessionId, setQrSessionId] = useState("");
  const [scanStatus, setScanStatus] = useState<"waiting" | "scanned" | "picked">("waiting");
  const [threadId] = useState(() => crypto.randomUUID());
  const chatAttachments = useMemo(() => ({
    enabled: true,
    accept: "image/png,image/jpeg,image/gif,image/webp,image/bmp,image/avif,.glb,model/gltf-binary,application/octet-stream",
    maxSize: 50 * 1024 * 1024,
    onUpload: async (file: File) => {
      const formData = new FormData();
      setUploadError(null);
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json() as { path?: string; url?: string; mimeType?: string; error?: string };
      if (!res.ok || !data.path || !data.url || !data.mimeType) {
        throw new Error(data.error || "文件上传失败");
      }
      // The model only needs the browser-accessible path. HomeChatView adds
      // it to the text prompt and removes the uploaded file from the
      // multimodal attachment queue, so the model never downloads localhost
      // files or receives a large Base64 payload.
      return {
        type: "url" as const,
        value: data.url,
        mimeType: data.mimeType,
        metadata: { uploadPath: data.path, uploadUrl: data.url },
      };
    },
    onUploadFailed: ({ message }: { message: string }) => setUploadError(message),
  }), []);
  const router = useRouter();
  const { agent } = useConversationAgent({ threadId });
  const { copilotkit } = useCopilotKit();

  useEffect(() => {
    if (!uploadError) return;
    const timer = setTimeout(() => setUploadError(null), 5000);
    return () => clearTimeout(timer);
  }, [uploadError]);

  const toggleSidebar = () => {
    setSidebarOverride(!sidebarCollapsed);
  };

  // Ref to always have the latest agent/copilotkit for async callbacks
  const agentRef = useRef(agent);
  const copilotkitRef = useRef(copilotkit);
  useEffect(() => { agentRef.current = agent; }, [agent]);
  useEffect(() => { copilotkitRef.current = copilotkit; }, [copilotkit]);

  // The chat input owns submission. Observe its thread so button, Enter,
  // suggestions, demos, and QR prompts all open the same persisted session.
  const openedGenerationRef = useRef(false);
  useEffect(() => {
    const openGeneration = () => {
      const messages = [...agent.messages] as unknown[];
      if (openedGenerationRef.current || !messages.some(
        (message) => !!message && typeof message === "object" &&
          (message as { role?: unknown }).role === "user",
      )) return;

      openedGenerationRef.current = true;
      const title = generationSessionTitle(messages);
      void fetch("/api/generations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: threadId, title, status: "running", messages }),
      }).then((res) => {
        if (!res.ok) throw new Error("generation session save failed");
        router.push(`/generation/${threadId}`);
      }).catch((error) => {
        openedGenerationRef.current = false;
        console.error("Unable to save generation session", error);
      });
    };

    const subscription = agent.subscribe({ onMessagesChanged: openGeneration });
    openGeneration();
    return () => subscription.unsubscribe();
  }, [agent, router, threadId]);

  // Guard: prevent duplicate prompt dispatch across re-renders
  const pickedRef = useRef(false);

  const sendPrompt = useCallback((prompt: string) => {
    const a = agentRef.current;
    const ck = copilotkitRef.current;
    a.addMessage({ id: crypto.randomUUID(), content: prompt, role: "user" });
    ck.runAgent({ agent: a });
  }, []);

  const handleTryDemo = (demo: DemoItem) => {
    setDemoDrawerOpen(false);
    sendPrompt(demo.prompt);
  };

  const openQrModal = () => {
    pickedRef.current = false;
    setScanStatus("waiting");
    setQrSessionId(crypto.randomUUID().slice(0, 12));
    setQrOpen(true);
  };

  // Poll for QR pick status
  useEffect(() => {
    if (!qrOpen || !qrSessionId) return;
    const interval = setInterval(async () => {
      if (pickedRef.current) return;
      try {
        const res = await fetch(`/api/pick?sessionId=${qrSessionId}`);
        const data = await res.json();
        if (data.status === "scanned") {
          setScanStatus("scanned");
        } else if (data.status === "picked" && data.prompt && !pickedRef.current) {
          pickedRef.current = true;
          clearInterval(interval);
          setScanStatus("picked");
          setTimeout(() => {
            setQrOpen(false);
            sendPrompt(data.prompt);
          }, 800);
        }
      } catch {
        // ignore polling errors
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [qrOpen, qrSessionId, sendPrompt]);

  // Note: sandbox openLink requests are handled by the Zod-validated
  // Websandbox localApi (src/lib/sandbox/sandbox-functions.ts). The legacy
  // 'open-link' postMessage listener was removed with the retired legacy
  // rail: it had no source/origin check and nothing in the app posts it.

  return (
    <>
      {/* Animated background */}
      <div className="abstract-bg">
        <div className="blob-3" />
      </div>

      <div className={`home-workspace${sidebarCollapsed ? " home-workspace--collapsed" : ""}`} style={{ position: "relative", zIndex: 1 }}>
        <aside className="home-sidebar" aria-label="主导航" style={{ width: sidebarCollapsed ? 76 : 204, paddingInline: sidebarCollapsed ? 10 : 12 }}>
          <div className="home-brand" style={{ justifyContent: sidebarCollapsed ? "center" : "flex-start" }}>
            <span className="home-brand-mark" aria-hidden="true">LK</span>
            {!sidebarCollapsed && <span className="home-brand-name" style={{ display: "inline" }}>生成式 UI</span>}
          </div>

          <button className="home-new-button" style={{ justifyContent: sidebarCollapsed ? "center" : "flex-start", paddingInline: sidebarCollapsed ? 0 : 12 }} type="button" onClick={() => document.querySelector<HTMLTextAreaElement>('[data-testid="copilot-chat-textarea"]')?.focus()} title="新建生成">
            <Plus size={17} strokeWidth={1.8} />
            {!sidebarCollapsed && <span style={{ display: "inline" }}>新建生成</span>}
          </button>

          <nav className="home-nav">
            <button className="home-nav-item" style={{ justifyContent: sidebarCollapsed ? "center" : "flex-start", paddingInline: sidebarCollapsed ? 0 : 12 }} type="button" onClick={() => openLibrary("page")} title="模板库">
              <Layers3 size={18} strokeWidth={1.8} />
              {!sidebarCollapsed && <span style={{ display: "inline" }}>模板库</span>}
            </button>
            <button className="home-nav-item" style={{ justifyContent: sidebarCollapsed ? "center" : "flex-start", paddingInline: sidebarCollapsed ? 0 : 12 }} type="button" onClick={() => openLibrary("component")} title="组件库">
              <Component size={18} strokeWidth={1.8} />
              {!sidebarCollapsed && <span style={{ display: "inline" }}>组件库</span>}
            </button>
            <button className="home-nav-item" style={{ justifyContent: sidebarCollapsed ? "center" : "flex-start", paddingInline: sidebarCollapsed ? 0 : 12 }} type="button" onClick={() => setDemoDrawerOpen(true)} title="演示库">
              <Sparkles size={18} strokeWidth={1.8} />
              {!sidebarCollapsed && <span style={{ display: "inline" }}>演示库</span>}
            </button>
          </nav>

          <div className="home-history-section">
            <button
              className="home-nav-item"
              style={{ justifyContent: sidebarCollapsed ? "center" : "flex-start", paddingInline: sidebarCollapsed ? 0 : 12 }}
              type="button"
              onClick={() => {
                if (sidebarCollapsed) setSidebarOverride(false);
                router.push("/history");
              }}
              title="历史项目"
            >
              <History size={18} strokeWidth={1.8} />
              {!sidebarCollapsed && <span style={{ display: "inline" }}>历史项目</span>}
            </button>
          </div>

          <div className="home-sidebar-footer">
            <button className="home-collapse-button" style={{ justifyContent: sidebarCollapsed ? "center" : "flex-start", paddingInline: sidebarCollapsed ? 0 : 12 }} type="button" onClick={toggleSidebar} aria-label={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"} title={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}>
              {sidebarCollapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
              {!sidebarCollapsed && <span style={{ display: "inline" }}>收起侧边栏</span>}
            </button>
          </div>
        </aside>

        <main className="home-main">
          <div className="home-main-topline">
            <div className="home-topline-label"><Sparkles size={15} /> AI 可视化工作台</div>
            <button className="home-template-link" type="button" onClick={() => openLibrary("page")}>浏览全部模板 <ChevronRight size={14} /></button>
          </div>
          <ExampleLayout
            chatContent={
              <div className="home-chat-area">
                <TemplateChip threadId={threadId} />
                {uploadError && (
                  <div
                    className="pointer-events-none absolute bottom-20 left-1/2 z-20 -translate-x-1/2 rounded-lg px-3 py-2 text-xs shadow-lg"
                    style={{ background: "var(--surface-primary)", color: "var(--color-text-danger, #a32d2d)", border: "1px solid var(--color-border-light)" }}
                    role="alert"
                  >
                    {uploadError}
                  </div>
                )}
                <CopilotChat
                  threadId={threadId}
                  chatView={HomeChatView}
                  attachments={chatAttachments}
                  labels={{
                    chatInputPlaceholder: "输入一条消息...",
                    chatInputToolbarAddButtonLabel: "上传图片或 GLB 文件",
                    welcomeMessageText: "今天做什么可视化内容？",
                    chatDisclaimerText: "可视化由 AI 生成。可重试同一提示，或让 AI 继续优化结果。",
                  }}
                />
              </div>
            }
          />
          <ExplainerCardsPortal />
          <HomeTemplateGallery threadId={threadId} onOpenLibrary={() => openLibrary("page")} />
        </main>
      </div>

      <DemoGallery
        open={demoDrawerOpen}
        onClose={() => setDemoDrawerOpen(false)}
        onTryDemo={handleTryDemo}
      />

      <TemplateLibrary
        kind={libraryKind}
        threadId={threadId}
        open={templateDrawerOpen}
        onClose={() => setTemplateDrawerOpen(false)}
      />

      <DesktopTipModal />

      <QrModal
        isOpen={qrOpen}
        onClose={() => setQrOpen(false)}
        sessionId={qrSessionId}
        scanStatus={scanStatus}
      />
    </>
  );
}
