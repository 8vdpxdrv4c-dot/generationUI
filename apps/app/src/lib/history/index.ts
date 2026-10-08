/**
 * Shared history types and helpers.
 *
 * A "design asset" is one project: a titled page with an ordered list of
 * versions. Each version stores the page's *source* — the same
 * css / html / jsFunctions / jsExpressions shape the generateSandboxedUi
 * contract already uses — rather than the assembled standalone document.
 * That way redesign can hand the agent a baseline that matches its own output
 * format instead of making it reverse-engineer a compiled page.
 *
 * This module is imported by BOTH the server (the JSON store under
 * app/api/history) and client components (the save dialog, the sidebar), so it
 * must stay free of node-only imports.
 */

/** Page source for one version. */
export type DesignSource =
  | {
      /** Live sandbox widget: the four generateSandboxedUi parameters. */
      format: "sandboxed-ui";
      css: string;
      html: string;
      jsFunctions: string;
      jsExpressions: string[];
    }
  | {
      /** Opaque standalone document — charts, and migrated legacy records. */
      format: "standalone";
      html: string;
    };

export interface DesignVersion {
  id: string;
  /** 1-based, monotonically increasing within its asset. */
  version: number;
  source: DesignSource;
  /**
   * The request this version answers: the original brief for v1, the edit
   * request for every later version. This is the design intent — the thing
   * redesign actually needs, and what a raw conversation log is a poor
   * substitute for.
   */
  requirement: string;
  componentType: string;
  createdAt: string;
}

export interface DesignAsset {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** Oldest first; the last entry is the current version. */
  versions: DesignVersion[];
}

/** Version summary for the sidebar (no source payload). */
export interface DesignVersionMeta {
  id: string;
  version: number;
  requirement: string;
  createdAt: string;
  bytes: number;
}

/** List payload: no page source, just enough to render the sidebar. */
export interface DesignAssetMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  versionCount: number;
  currentVersion: number;
  componentType: string;
  bytes: number;
  versions: DesignVersionMeta[];
}

export const HISTORY_CHANGED_EVENT = "ogui:history-changed";

/** Tell every mounted history view that the store changed. */
export function notifyHistoryChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT));
}

/** Approximate byte size of a version's source. */
export function sourceBytes(source: DesignSource): number {
  if (source.format === "standalone") return source.html.length;
  return (
    source.css.length +
    source.html.length +
    source.jsFunctions.length +
    source.jsExpressions.join("").length
  );
}

/** The markup a title can be guessed from: the body, not the whole document. */
export function sourceMarkup(source: DesignSource): string {
  return source.html;
}

const TITLE_MAX = 40;
const DEFAULT_TITLE = "未命名页面";

/**
 * Best-effort title for a saved page, taken from the page itself: first h1,
 * then a big-screen title bar, then <title>, then h2. Used as the default when
 * the user saves without typing a name.
 */
export function guessTitleFromHtml(html: string | undefined, fallback = DEFAULT_TITLE): string {
  if (!html) return fallback;
  const patterns = [
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
    /class="[^"]*wing-header[^"]*"[^>]*>([\s\S]*?)<\/\w/i,
    /<title[^>]*>([\s\S]*?)<\/title>/i,
    /<h2[^>]*>([\s\S]*?)<\/h2>/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match) continue;
    const text = match[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    return text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX)}…` : text;
  }
  return fallback;
}

/** Title inferred from a version's source. */
export function guessTitleFromSource(
  source: DesignSource,
  fallback = DEFAULT_TITLE
): string {
  return guessTitleFromHtml(sourceMarkup(source), fallback);
}

/** Compact "3 分钟前" style label for the history list. */
export function formatRelativeTime(iso: string, now = Date.now()): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "";
  const diff = Math.max(0, now - time);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  const date = new Date(time);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Human label for a stored component type. */
export function componentTypeLabel(componentType: string): string {
  if (componentType === "barChart") return "柱状图";
  if (componentType === "pieChart") return "饼图";
  return "页面";
}

/** Trim a source down to metadata for transport. */
export function toAssetMeta(asset: DesignAsset): DesignAssetMeta {
  const current = asset.versions[asset.versions.length - 1];
  return {
    id: asset.id,
    title: asset.title,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
    versionCount: asset.versions.length,
    currentVersion: current?.version ?? 1,
    componentType: current?.componentType ?? "openGenUI",
    bytes: asset.versions.reduce((sum, v) => sum + sourceBytes(v.source), 0),
    versions: asset.versions.map((v) => ({
      id: v.id,
      version: v.version,
      requirement: v.requirement,
      createdAt: v.createdAt,
      bytes: sourceBytes(v.source),
    })),
  };
}
