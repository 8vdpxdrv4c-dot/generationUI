/** Immutable preview snapshots shared by API/view route bundles and restarts. */
import { linkSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 200;
const MAX_HTML_BYTES = 2 * 1024 * 1024;

export const isViewId = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

function dataDir() {
  return join(process.env.HISTORY_DATA_DIR?.trim() || join(process.cwd(), ".data"), "views");
}

function remove(file: string) {
  try { unlinkSync(file); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function prune(dir: string) {
  const entries = readdirSync(dir).filter(name => name.endsWith(".html") && isViewId(name.slice(0, -5)))
    .flatMap(name => {
      const file = join(dir, name);
      try { return [{ file, time: statSync(file).mtimeMs }]; } catch { return []; }
    }).sort((a, b) => b.time - a.time);
  for (const [index, entry] of entries.entries()) {
    if (index >= MAX_ENTRIES || Date.now() - entry.time >= TTL_MS) remove(entry.file);
  }
}

export function saveView(html: string, requestedId?: string): string | null {
  if (!html || Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) return null;
  const id = requestedId ?? crypto.randomUUID();
  if (!isViewId(id)) return null;
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${id.toLowerCase()}.html`);
  const temp = join(dir, `${id}.${crypto.randomUUID()}.tmp`);
  writeFileSync(temp, html, { encoding: "utf8", flag: "wx" });
  try {
    // Publish the completed file atomically without overwriting a concurrent
    // snapshot; API and view routes may run in different module instances.
    linkSync(temp, file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return null;
    throw error;
  } finally {
    remove(temp);
  }
  prune(dir);
  return id;
}

export function getView(id: string): string | undefined {
  if (!isViewId(id)) return undefined;
  const file = join(dataDir(), `${id.toLowerCase()}.html`);
  try {
    const info = statSync(file);
    if (Date.now() - info.mtimeMs >= TTL_MS) { remove(file); return undefined; }
    if (info.size > MAX_HTML_BYTES) return undefined;
    return readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
