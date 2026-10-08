/**
 * Tracks a redesign in flight so the finished page can be filed back as a new
 * version of the asset it came from.
 *
 * Module-level rather than React state on purpose: the sidebar lives in the
 * page shell, but the thing that observes a *finished* page is the renderer
 * inside the chat tree. They share no React ancestor.
 */

/** A redesign older than this is treated as abandoned. */
const TTL_MS = 15 * 60 * 1000;

export interface PendingRedesign {
  assetId: string;
  /** What the user asked for — becomes the new version's requirement. */
  requirement: string;
  /** When the redesign was submitted, used to ignore pre-existing widgets. */
  startedAt: number;
}

let pending: PendingRedesign | null = null;

export function startPendingRedesign(assetId: string, requirement: string): void {
  pending = { assetId, requirement, startedAt: Date.now() };
}

export function cancelPendingRedesign(): void {
  pending = null;
}

/** Read without consuming (a widget may remount before the page completes). */
export function peekPendingRedesign(): PendingRedesign | null {
  if (!pending) return null;
  if (Date.now() - pending.startedAt > TTL_MS) {
    pending = null;
    return null;
  }
  return pending;
}

/** Consume once the finished page has been filed under its asset. */
export function consumePendingRedesign(): PendingRedesign | null {
  const value = peekPendingRedesign();
  pending = null;
  return value;
}
