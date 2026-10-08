/** A persisted chat thread, including its AG-UI activity messages. */
export interface GenerationSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: "running" | "complete";
  messages: unknown[];
}

/** Lightweight list item; message payloads are fetched only when opened. */
export type GenerationSessionMeta = Omit<GenerationSession, "messages"> & {
  messageCount: number;
  generatedCount: number;
};

/** Restore a newer saved preview over an idle runtime's older thread clone.
 * Preserve any current user turn or generated page that has not reached disk. */
export function shouldRestoreGenerationMessages(
  current: readonly unknown[],
  persisted: readonly unknown[],
  isRunning: boolean,
): boolean {
  if (persisted.length === 0) return false;
  if (current.length === 0) return true;
  const durableIds = (messages: readonly unknown[]) => new Set(messages.flatMap((message) => {
    if (!message || typeof message !== "object") return [];
    const { id, role } = message as { id?: unknown; role?: unknown };
    return typeof id === "string" && (role === "user" || role === "activity") ? [id] : [];
  }));
  const local = durableIds(current);
  const saved = durableIds(persisted);
  if (![...local].every((id) => saved.has(id)) || ![...saved].some((id) => !local.has(id))) return false;
  if (!isRunning) return true;
  // A connection can be marked running before any model generation starts.
  // Restore a strict extension of that old snapshot, but never replace new or
  // partially streamed assistant/activity content with an older saved copy.
  const savedById = new Map(persisted.map((message) => {
    const entry = message as { id?: string };
    return [entry?.id, message] as const;
  }));
  return current.every((message) => {
    const entry = message as { id?: string; role?: string; content?: unknown; toolCalls?: unknown };
    if (!entry || (entry.role !== "assistant" && entry.role !== "activity")) return true;
    const old = savedById.get(entry.id) as typeof entry | undefined;
    return !!old && JSON.stringify(entry.content) === JSON.stringify(old.content) &&
      JSON.stringify(entry.toolCalls) === JSON.stringify(old.toolCalls);
  });
}

export function generationMessageText(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const item = part as { type?: unknown; text?: unknown };
      return item.type === "text" && typeof item.text === "string" ? item.text : "";
    })
    .filter(Boolean)
    .join("\n");
}

export function generationSessionTitle(messages: unknown[]): string {
  const firstUserMessage = messages.find(
    (message) =>
      !!message && typeof message === "object" &&
      (message as { role?: unknown }).role === "user",
  );
  const text = generationMessageText(firstUserMessage).replace(/\s+/g, " ").trim();
  if (!text) return "新建生成";
  return text.length > 48 ? `${text.slice(0, 48)}…` : text;
}
