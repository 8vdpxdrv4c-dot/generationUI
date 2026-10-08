/**
 * In-memory store for the standalone "view" page.
 * A generated widget's standalone HTML is stored under a random id so it can
 * be opened in a new tab at /view/[id] — shareable and refreshable within the
 * TTL. Same module-level-state pattern as the QR pick store.
 */

const views = new Map<string, string>();

const TTL_MS = 24 * 60 * 60 * 1000; // 24h so a shared link survives
const MAX_ENTRIES = 200;
const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MB cap per widget
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function saveView(html: string): string | null {
  if (!html || html.length > MAX_HTML_BYTES) return null;

  const id = crypto.randomUUID();
  views.set(id, html);

  // Evict the oldest entry when over capacity.
  if (views.size > MAX_ENTRIES) {
    const oldest = views.keys().next().value;
    if (oldest !== undefined) {
      views.delete(oldest);
      const t = timers.get(oldest);
      if (t) clearTimeout(t);
      timers.delete(oldest);
    }
  }

  timers.set(
    id,
    setTimeout(() => {
      views.delete(id);
      timers.delete(id);
    }, TTL_MS),
  );

  return id;
}

export function getView(id: string): string | undefined {
  return views.get(id);
}
