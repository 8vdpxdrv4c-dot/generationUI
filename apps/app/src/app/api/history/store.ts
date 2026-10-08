/**
 * Persistent store for generated pages, shaped as design assets.
 *
 * An asset is one page (title + ordered versions). Each version keeps the
 * page's separated source plus the request it answers, so "重新设计" can hand
 * the agent a baseline that matches its own generateSandboxedUi contract and a
 * requirement chain that carries the design intent — instead of replaying a
 * whole conversation.
 *
 * Records live in a JSON file on disk (default `apps/app/.data/history.json`,
 * override with HISTORY_DATA_DIR) so they survive a dev-server restart. Writes
 * go to a temp file and are renamed over the target, so a crash mid-write can
 * never truncate the store.
 *
 * All operations are synchronous on purpose: every handler is a single
 * request/response with no awaits in between, so JS's single thread already
 * serialises the read-modify-write cycle and no lock is needed.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  guessTitleFromSource,
  sourceBytes,
  toAssetMeta,
  type DesignAsset,
  type DesignAssetMeta,
  type DesignSource,
  type DesignVersion,
} from "@/lib/history";
import { splitStandaloneSource } from "@/lib/history/split-standalone";

const FILE_NAME = "history.json";
const SCHEMA_VERSION = 2;
const MAX_ASSETS = 500;
const MAX_VERSIONS_PER_ASSET = 60;
const MAX_VERSION_BYTES = 4 * 1024 * 1024; // 4 MB per version

interface StoreFile {
  schema: number;
  assets: DesignAsset[];
}

function dataDir(): string {
  const override = process.env.HISTORY_DATA_DIR?.trim();
  return override && override.length > 0 ? override : join(process.cwd(), ".data");
}

function storePath(): string {
  return join(dataDir(), FILE_NAME);
}

let cache: { key: string; assets: DesignAsset[] } | null = null;

/** Cache key. mtime alone is not enough on Windows: two writes inside the
 *  same millisecond keep the same mtimeMs, so the size is folded in too. */
function statKey(file: string): string {
  try {
    const stat = statSync(file);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeSource(raw: unknown, legacyHtml?: unknown): DesignSource | null {
  if (isRecord(raw)) {
    if (raw.format === "sandboxed-ui") {
      return {
        format: "sandboxed-ui",
        css: str(raw.css),
        html: str(raw.html),
        jsFunctions: str(raw.jsFunctions),
        jsExpressions: Array.isArray(raw.jsExpressions)
          ? raw.jsExpressions.filter((e): e is string => typeof e === "string")
          : [],
      };
    }
    if (raw.format === "standalone" && typeof raw.html === "string") {
      return { format: "standalone", html: raw.html };
    }
  }
  // Legacy records only carried a standalone document.
  if (typeof legacyHtml === "string" && legacyHtml.trim()) {
    return splitStandaloneSource(legacyHtml);
  }
  return null;
}

function normalizeVersion(raw: unknown, index: number, assetId: string): DesignVersion | null {
  if (!isRecord(raw)) return null;
  const source = normalizeSource(raw.source, raw.html);
  if (!source) return null;
  const createdAt = str(raw.createdAt, new Date(0).toISOString());
  const version =
    typeof raw.version === "number" && Number.isFinite(raw.version)
      ? Math.max(1, Math.floor(raw.version))
      : index + 1;
  return {
    // Deterministic ids keep migration idempotent across cache misses.
    id: str(raw.id) || `${assetId}-v${version}`,
    version,
    source,
    requirement: str(raw.requirement),
    componentType: str(raw.componentType, "openGenUI"),
    createdAt,
  };
}

function sortVersions(versions: DesignVersion[]): DesignVersion[] {
  return versions.slice().sort((a, b) => a.version - b.version);
}

function normalizeAsset(raw: unknown): DesignAsset | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  if (!id) return null;

  const createdAt = str(raw.createdAt, new Date().toISOString());

  // Schema 2: an explicit version list.
  let versions: DesignVersion[] = [];
  if (Array.isArray(raw.versions)) {
    versions = raw.versions
      .map((entry, index) => normalizeVersion(entry, index, id))
      .filter((entry): entry is DesignVersion => entry !== null);
  }
  // Schema 1: a single standalone document.
  if (versions.length === 0) {
    const source = normalizeSource(null, raw.html);
    if (!source) return null;
    versions = [
      {
        id: `${id}-v1`,
        version: 1,
        source,
        requirement: "",
        componentType: str(raw.componentType, "openGenUI"),
        createdAt,
      },
    ];
  }

  const first = versions[0];
  return {
    id,
    title: str(raw.title).trim() || guessTitleFromSource(first.source),
    createdAt,
    updatedAt: str(raw.updatedAt, first.createdAt),
    versions: sortVersions(versions),
  };
}

/**
 * Read the whole store. Cheap enough to call per request: we stat the file and
 * only re-parse when its mtime moved (also picks up hand edits).
 */
function readAll(): DesignAsset[] {
  const file = storePath();
  if (!existsSync(file)) {
    cache = { key: "", assets: [] };
    return [];
  }

  const key = statKey(file);
  if (cache && cache.key === key) return cache.assets;

  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    // Schema 1 was a bare array of records; schema 2 wraps them.
    const rawAssets = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.assets)
        ? parsed.assets
        : [];
    const assets = rawAssets
      .map(normalizeAsset)
      .filter((asset): asset is DesignAsset => asset !== null);
    cache = { key, assets };
    return assets;
  } catch {
    // Corrupt file: park it next to the store instead of throwing, start clean.
    try {
      renameSync(file, `${file}.corrupt`);
    } catch {
      /* best effort only */
    }
    cache = { key: "", assets: [] };
    return [];
  }
}

function writeAll(assets: DesignAsset[]): void {
  const dir = dataDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = storePath();
  const tmp = `${file}.${process.pid}.tmp`;
  const payload: StoreFile = { schema: SCHEMA_VERSION, assets };
  writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
  renameSync(tmp, file); // atomic replace
  cache = { key: statKey(file), assets };
}

/** True when two sources would produce the same page. */
function sameSource(a: DesignSource, b: DesignSource): boolean {
  if (a.format === "standalone" || b.format === "standalone") {
    return a.format === b.format && a.html === b.html;
  }
  return (
    a.css === b.css &&
    a.html === b.html &&
    a.jsFunctions === b.jsFunctions &&
    a.jsExpressions.join("\n") === b.jsExpressions.join("\n")
  );
}

/** True when the stored version's page source equals this one. */
function hasSameSource(version: DesignVersion, source: DesignSource): boolean {
  return sameSource(version.source, source);
}

function touch(asset: DesignAsset, now: string): void {
  asset.updatedAt = now;
}

function sortByUpdated(assets: DesignAsset[]): DesignAsset[] {
  return assets.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

/** Newest first, without the page source. */
export function listAssets(): DesignAssetMeta[] {
  return sortByUpdated(readAll()).map(toAssetMeta);
}

export function getAsset(id: string): DesignAsset | undefined {
  return readAll().find((asset) => asset.id === id);
}

/**
 * Page source for an asset. Without a version number the current one is
 * returned. Version numbers are 1-based.
 */
export function getAssetSource(id: string, version?: number): DesignSource | undefined {
  const asset = getAsset(id);
  if (!asset || asset.versions.length === 0) return undefined;
  if (version === undefined) return asset.versions[asset.versions.length - 1].source;
  return asset.versions.find((entry) => entry.version === version)?.source;
}

export interface SaveVersionInput {
  source: DesignSource;
  title?: string;
  requirement?: string;
  componentType?: string;
}

/** Append a version to an existing asset. */
export function appendVersion(
  assetId: string,
  input: SaveVersionInput
): DesignVersion | null {
  if (sourceBytes(input.source) > MAX_VERSION_BYTES) return null;

  const assets = readAll();
  const asset = assets.find((entry) => entry.id === assetId);
  if (!asset) return null;

  const now = new Date().toISOString();
  const last = asset.versions[asset.versions.length - 1];
  if (last && hasSameSource(last, input.source)) {
    // Identical page: the redesign produced no change, so keep that version's
    // existing intent. Recording the new request here would claim an edit that
    // was never actually applied.
    touch(asset, now);
    writeAll(assets);
    return last;
  }

  const version: DesignVersion = {
    id: crypto.randomUUID(),
    version: (last?.version ?? 0) + 1,
    source: input.source,
    requirement: input.requirement?.trim() ?? "",
    componentType: input.componentType?.trim() || last?.componentType || "openGenUI",
    createdAt: now,
  };
  asset.versions = sortVersions([...asset.versions, version]);
  if (asset.versions.length > MAX_VERSIONS_PER_ASSET) {
    // Keep the first version (the original brief) and the most recent ones.
    asset.versions = [asset.versions[0], ...asset.versions.slice(-(MAX_VERSIONS_PER_ASSET - 1))];
  }
  if (input.title?.trim()) asset.title = input.title.trim();
  touch(asset, now);
  writeAll(assets);
  return version;
}

/**
 * Create a new asset, or append to the existing one when the page is byte
 * identical to a stored version (saving twice refreshes instead of duplicating).
 */
export function saveAsset(input: SaveVersionInput): DesignAsset | null {
  if (sourceBytes(input.source) > MAX_VERSION_BYTES) return null;

  const assets = readAll();
  const now = new Date().toISOString();

  for (const asset of assets) {
    const last = asset.versions[asset.versions.length - 1];
    if (last && hasSameSource(last, input.source)) {
      if (input.title?.trim()) asset.title = input.title.trim();
      if (input.requirement?.trim()) last.requirement = input.requirement.trim();
      touch(asset, now);
      writeAll(assets);
      return asset;
    }
  }

  const version: DesignVersion = {
    id: crypto.randomUUID(),
    version: 1,
    source: input.source,
    requirement: input.requirement?.trim() ?? "",
    componentType: input.componentType?.trim() || "openGenUI",
    createdAt: now,
  };

  const asset: DesignAsset = {
    id: crypto.randomUUID(),
    title: input.title?.trim() || guessTitleFromSource(input.source),
    createdAt: now,
    updatedAt: now,
    versions: [version],
  };

  let next = [...assets, asset];
  if (next.length > MAX_ASSETS) {
    next = sortByUpdated(next).slice(0, MAX_ASSETS);
  }
  writeAll(next);
  return asset;
}

export function renameAsset(id: string, title: string): DesignAsset | undefined {
  const assets = readAll();
  const asset = assets.find((entry) => entry.id === id);
  if (!asset) return undefined;
  const next = title.trim();
  if (next) asset.title = next;
  touch(asset, new Date().toISOString());
  writeAll(assets);
  return asset;
}

/** Drop one version. The last remaining version cannot be deleted. */
export function deleteVersion(assetId: string, versionId: string): boolean {
  const assets = readAll();
  const asset = assets.find((entry) => entry.id === assetId);
  if (!asset || asset.versions.length <= 1) return false;
  const next = asset.versions.filter((entry) => entry.id !== versionId);
  if (next.length === asset.versions.length) return false;
  asset.versions = next;
  touch(asset, new Date().toISOString());
  writeAll(assets);
  return true;
}

export function deleteAsset(id: string): boolean {
  const assets = readAll();
  const next = assets.filter((asset) => asset.id !== id);
  if (next.length === assets.length) return false;
  writeAll(next);
  return true;
}
