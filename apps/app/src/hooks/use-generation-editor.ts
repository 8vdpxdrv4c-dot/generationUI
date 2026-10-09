"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { useConversationAgent } from "./use-conversation-agent";
import type { GenerationSession } from "@/lib/generations";
import { applyPageEdit, type PageEdit } from "@/components/generative-ui/open-generative-ui/editor-source";
import type { PreviewEditing, PreviewEditorControls } from "@/components/generative-ui/open-generative-ui/preview-context";

type Agent = ReturnType<typeof useConversationAgent>["agent"];
type Activity = { id: string; activityType?: string; content: Record<string, unknown> };

/** Serial writes prevent an older autosave from finishing after a newer edit. */
export function serializedSaver(save: (payload: unknown) => Promise<void>) {
  let pending = Promise.resolve();
  return (payload: unknown) => {
    pending = pending.catch(() => {}).then(() => save(payload));
    return pending;
  };
}

export function useGenerationEditor(agent: Agent, id: string, session: GenerationSession | null, ready: React.RefObject<{ agent: Agent; id: string } | null>, selectedId: string | null) {
  const [saveState, setSaveState] = useState<PreviewEditing["saveState"]>("idle");
  const controls = useRef(new Map<string, PreviewEditorControls>());
  const committed = useRef(new Map<string, { editedHtml: string; editRevision: number }>());
  const sequence = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serial = useRef<ReturnType<typeof serializedSaver> | null>(null);
  if (!serial.current) serial.current = serializedSaver(async payload => {
    const response = await fetch("/api/generations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), keepalive: JSON.stringify(payload).length < 60_000 });
    if (!response.ok) throw new Error("无法保存页面修改");
  });

  const messagesWithEdits = useCallback(() => agent.messages.map(message => {
    const edit = committed.current.get(message.id);
    if (!edit || message.role !== "activity") return message;
    const activity = message as unknown as Activity;
    if (Number(activity.content.editRevision ?? 0) > edit.editRevision) return message;
    if (activity.content.editRevision === edit.editRevision && activity.content.editedHtml === edit.editedHtml) return message;
    return { ...message, content: { ...activity.content, ...edit } };
  }), [agent]);

  const persist = useCallback(async (finalized = false) => {
    if (ready.current?.agent !== agent || ready.current.id !== id || !session || session.id !== id) return;
    const version = ++sequence.current;
    setSaveState("saving");
    try {
      await serial.current!({ id, title: session.title, status: !finalized && agent.isRunning ? "running" : "complete", messages: messagesWithEdits() });
      if (version === sequence.current) setSaveState("saved");
    } catch (error) {
      if (version === sequence.current) setSaveState("error");
      throw error;
    }
  }, [agent, id, messagesWithEdits, ready, session]);

  const commit = useCallback((messageId: string, edit: PageEdit) => {
    if (agent.isRunning) throw new Error("AI 正在生成，请稍后编辑");
    const activity = agent.messages.find(message => message.id === messageId) as unknown as Activity | undefined;
    if (!activity || activity.activityType !== "open-generative-ui" || activity.content.generating !== false) throw new Error("页面尚未完成");
    const draft = committed.current.get(messageId);
    const previous = draft && draft.editRevision >= Number(activity.content.editRevision ?? 0) ? draft : undefined;
    const html = previous?.editedHtml ?? activity.content.editedHtml ?? (activity.content.html as string[] | undefined)?.join("") ?? "";
    const editedHtml = applyPageEdit(String(html), edit);
    const editRevision = Math.max(previous?.editRevision ?? 0, Number(activity.content.editRevision ?? 0)) + 1;
    committed.current.set(messageId, { editedHtml, editRevision });
    agent.setMessages(messagesWithEdits() as Parameters<Agent["setMessages"]>[0]);
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; void persist().catch(() => {}); }, 650);
  }, [agent, messagesWithEdits, persist]);

  const register = useCallback((messageId: string, value: PreviewEditorControls) => {
    controls.current.set(messageId, value);
    return () => { if (controls.current.get(messageId) === value) controls.current.delete(messageId); };
  }, []);

  const beforeSubmit = useCallback(async () => {
    if (ready.current?.agent !== agent || ready.current.id !== id || !session) throw new Error("页面尚未加载完成，请稍后重试");
    if (selectedId) await controls.current.get(selectedId)?.flush();
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const latest = messagesWithEdits();
    agent.setMessages(latest as Parameters<Agent["setMessages"]>[0]);
    const selected = latest.find(message => message.id === selectedId && message.role === "activity") as unknown as Activity | undefined;
    const { editedHtml, editRevision: _revision, ...content } = selected?.content ?? {};
    // Runtime adapters may filter activity messages before calling Python.
    // Send the selected source explicitly as shared state as well.
    agent.setState({ ...agent.state, selected_generated_ui_id: selectedId?.startsWith("tool:") ? null : selectedId,
      current_generated_ui: selected?.activityType === "open-generative-ui"
        ? { id: selected.id, content: { ...content, ...(typeof editedHtml === "string" ? { html: [editedHtml] } : {}) } } : null });
    await persist();
  }, [agent, selectedId, messagesWithEdits, persist, id, ready, session]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    committed.current.clear();
    sequence.current++;
    setSaveState("idle");
  }, [id]);

  return {
    persist,
    beforeSubmit,
    messages: messagesWithEdits() as typeof agent.messages,
    editing: { isRunning: agent.isRunning, saveState, commit, register, retry: () => { void persist().catch(() => {}); } } satisfies PreviewEditing,
  };
}
