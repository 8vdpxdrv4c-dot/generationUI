import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { GenerationSession, GenerationSessionMeta } from "@/lib/generations";

const FILE_NAME = "generations.json";
const MAX_SESSIONS = 500;

function storePath(): string {
  const override = process.env.HISTORY_DATA_DIR?.trim();
  const dir = override || join(process.cwd(), ".data");
  return join(dir, FILE_NAME);
}

function readAll(): GenerationSession[] {
  const file = storePath();
  if (!existsSync(file)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSession).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

function isSession(value: unknown): value is GenerationSession {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<GenerationSession>;
  return typeof item.id === "string" && typeof item.title === "string" &&
    typeof item.createdAt === "string" && typeof item.updatedAt === "string" &&
    (item.status === "running" || item.status === "complete") && Array.isArray(item.messages);
}

function writeAll(sessions: GenerationSession[]): void {
  const file = storePath();
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(sessions), "utf8");
  renameSync(temp, file);
}

function toMeta(session: GenerationSession): GenerationSessionMeta {
  const generatedCount = session.messages.filter((message) => {
    if (!message || typeof message !== "object") return false;
    const item = message as { activityType?: unknown; role?: unknown };
    return item.activityType === "open-generative-ui" || item.role === "activity";
  }).length;
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    status: session.status,
    messageCount: session.messages.length,
    generatedCount,
  };
}

export function listGenerationSessions(): GenerationSessionMeta[] {
  return readAll().map(toMeta);
}

export function getGenerationSession(id: string): GenerationSession | null {
  return readAll().find((session) => session.id === id) ?? null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function preserveCompletedActivities(previous: unknown[], incoming: unknown[]): unknown[] {
  const byId = new Map(previous.map((message) => [record(message)?.id, message]));
  return incoming.map((message) => {
    const next = record(message);
    const old = record(byId.get(next?.id));
    if (!next || !old || next.role !== "activity") return message;
    const content = record(next.content);
    const saved = record(old.content);
    if (!content || !saved) return message;
    if (!saved.jsFunctions && typeof content.jsFunctions === "string" && content.jsFunctions.trim() &&
        content.generating === false && Array.isArray(content.jsExpressions) && content.jsExpressions.length) {
      return { ...next, content: { ...saved, ...content } };
    }
    // Stream snapshots and final saves may arrive out of order. Once a page is
    // complete, an earlier partial snapshot cannot erase its source or JS.
    if (saved.generating === false && saved.htmlComplete === true) {
      return { ...next, content: { ...content, ...saved } };
    }
    return { ...next, content: { ...saved, ...content } };
  });
}

export function saveGenerationSession(input: {
  id: string;
  title: string;
  status: GenerationSession["status"];
  messages: unknown[];
}): GenerationSession {
  const sessions = readAll();
  const existing = sessions.find((session) => session.id === input.id);
  if (existing) {
    // This endpoint saves full append-only transcripts; deletion has no place
    // here. Ignore stale clones/requests missing already persisted messages.
    // The runtime may prune tool results from its final snapshot. Only user
    // turns and generated pages are durable; tool-message counts can shrink.
    const incomingIds = new Set(input.messages.map((message) => record(message)?.id));
    if (!input.messages.length || existing.messages.some((message) => {
      const item = record(message);
      return (item?.role === "user" || item?.role === "activity") &&
        typeof item.id === "string" && !incomingIds.has(item.id);
    })) return existing;
  }
  const now = new Date().toISOString();
  const session: GenerationSession = {
    id: input.id,
    title: input.title.trim().slice(0, 100) || existing?.title || "新建生成",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    status: input.status,
    messages: existing ? preserveCompletedActivities(existing.messages, input.messages) : input.messages,
  };
  const next = [session, ...sessions.filter((entry) => entry.id !== input.id)]
    .slice(0, MAX_SESSIONS);
  writeAll(next);
  return session;
}
