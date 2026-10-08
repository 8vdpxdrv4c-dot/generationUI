#!/usr/bin/env node
/**
 * Single-port launcher for the Open Generative UI demo.
 *
 * Three constraints drive this design:
 *   1. The app is two processes (Next.js web + Python LangGraph agent) but the
 *      deploy sandbox exposes exactly one public port.
 *   2. The sandbox's install step has a 300s budget, which a monorepo
 *      `pnpm install` plus the agent's Python dependencies do not fit into.
 *   3. The sandbox can recycle or restart the process at any time, and the
 *      platform's readiness window is only 30s — so the public port must be
 *      bound immediately, and this process must never die on its own.
 *
 * So this script takes the public port first, prepares everything in the
 * background, reverse-proxies to the web server once it is up, and keeps the
 * port bound in every failure mode. Child processes are supervised (restarted
 * with backoff) instead of taking the launcher down with them.
 *
 * Usage:
 *   PORT=3000 node scripts/start-all.mjs
 *
 * Env overrides:
 *   AGENT_PORT          agent loopback port (default 8123)
 *   INTERNAL_WEB_PORT   web server loopback port (default 3001)
 *   PYTHON_BIN          python interpreter for the agent
 *   PREPARE_TIMEOUT_MS  budget for dependency preparation (default 30 min)
 *   SKIP_PREPARE=1      skip dependency installation entirely
 *   FORCE_REINSTALL=1   ignore the cached dependency marker and reinstall
 *   FORCE_DEV=1         serve `next dev` instead of building + `next start`
 *
 * Diagnostics (always reachable through the public port, even while broken):
 *   GET /__ping           → 200 "ok" (liveness, no side effects)
 *   GET /__launcher       → JSON state: phase, children, memory, ports
 *   GET /__launcher/logs  → tails of the install/run logs
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB_DIR = path.join(ROOT, "apps", "app");
const AGENT_DIR = path.join(ROOT, "apps", "agent");
const INSTALL_SCRIPT = path.join(ROOT, "scripts", "install-all.sh");
const READY_MARKER = path.join(ROOT, ".deploy-ready");
const BUILD_MARKER = path.join(ROOT, ".deploy-build");

const PUBLIC_PORT = process.env.PORT || "3000";
const INTERNAL_WEB_PORT =
  process.env.INTERNAL_WEB_PORT || (PUBLIC_PORT === "3001" ? "3002" : "3001");
const AGENT_PORT = process.env.AGENT_PORT || "8123";
const AGENT_ORIGIN = `http://127.0.0.1:${AGENT_PORT}`;
const WEB_ORIGIN = `http://127.0.0.1:${INTERNAL_WEB_PORT}`;
const PREPARE_TIMEOUT_MS = Number(process.env.PREPARE_TIMEOUT_MS || 1_800_000);

const startedAt = Date.now();
const logs = new Map(); // name → string[]
const procs = new Map(); // name → { child, restarts, lastExit }
let publicServer = null;
let shuttingDown = false;

// preparing → starting → ready → degraded, or failed
let phase = "preparing";
let detail = "starting up";
let agentReady = false;
let depsAreReady = false;

const log = (message) => record("launcher", `[launcher] ${message}`);
const elapsedSeconds = () => Math.round((Date.now() - startedAt) / 1000);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── log ring buffers (mirrored to .run-*.log, readable via /__launcher/logs) ──

function record(name, text) {
  const lines = String(text).replace(/\n+$/, "").split("\n").filter(Boolean);
  if (!lines.length) return;
  const buffer = logs.get(name) || [];
  buffer.push(...lines);
  while (buffer.length > 300) buffer.shift();
  logs.set(name, buffer);
  if (name === "launcher") process.stdout.write(`${lines.join("\n")}\n`);
}

function readTail(file, lines = 25) {
  try {
    return readFileSync(file, "utf8").trimEnd().split("\n").slice(-lines).join("\n");
  } catch {
    return `(no ${path.basename(file)})`;
  }
}

function tailOf(name, lines = 30) {
  const buffer = logs.get(name);
  return buffer?.length ? buffer.slice(-lines).join("\n") : `(no ${name} output)`;
}

// ── dependency cache ────────────────────────────────────────────────────────

function fileHash(file) {
  try {
    return createHash("sha1").update(readFileSync(file)).digest("hex").slice(0, 12);
  } catch {
    return "none";
  }
}

/**
 * Changes to any of these must invalidate a prepared dependency tree. The
 * workspace packages are in here because `install-all.sh` *builds* them
 * (`@repo/design-system` runs `tsc` during install) — a source-only change to
 * a package must therefore force a reinstall, or the app would resolve against
 * a stale `dist` and the Next.js build would fail on a missing export.
 *
 * Only types/config/lockfiles are hashed: cheap to read, and they change
 * whenever a dependency or the package's shape changes.
 */
function depsFingerprint() {
  const hash = createHash("sha1");
  const parts = [
    "v4",
    process.platform,
    fileHash(path.join(ROOT, "pnpm-lock.yaml")),
    fileHash(path.join(AGENT_DIR, "requirements-lock.txt")),
    fileHash(INSTALL_SCRIPT),
  ];
  hash.update(parts.join("|"));

  for (const file of packageShapeFiles()) {
    hash.update(path.relative(ROOT, file));
    try {
      hash.update(readFileSync(file));
    } catch {
      // unreadable files simply do not contribute
    }
  }
  return `${parts.join("-")}-${hash.digest("hex").slice(0, 12)}`;
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  ".turbo",
  "dist",
  "vendor",
  ".venv",
  ".venv-deploy",
]);

/**
 * Type-or-config files of every workspace package. These decide what `tsc`
 * emits for the packages the install step builds, so they belong in both the
 * dependency fingerprint and the build fingerprint.
 */
function packageShapeFiles() {
  const files = [];
  const packagesDir = path.join(ROOT, "packages");
  let entries = [];
  try {
    entries = readdirSync(packagesDir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(packagesDir, entry.name);
    for (const name of ["package.json", "tsconfig.json"]) {
      const file = path.join(dir, name);
      if (existsSync(file)) files.push(file);
    }
  }
  return files;
}

/** Content hash of everything that feeds the production build. */
function sourceFingerprint() {
  const hash = createHash("sha1");
  const files = [];

  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(full);
    }
  };

  walk(path.join(WEB_DIR, "src"));
  walk(path.join(WEB_DIR, "public"));
  walk(path.join(ROOT, "packages", "design-system", "src"));
  for (const extra of [
    path.join(WEB_DIR, "package.json"),
    path.join(WEB_DIR, "next.config.ts"),
    path.join(WEB_DIR, "next.config.js"),
    path.join(WEB_DIR, "tsconfig.json"),
    path.join(ROOT, "pnpm-lock.yaml"),
    ...packageShapeFiles(),
  ]) {
    if (existsSync(extra)) files.push(extra);
  }

  files.sort();
  for (const file of files) {
    hash.update(path.relative(ROOT, file));
    try {
      hash.update(readFileSync(file));
    } catch {
      // unreadable files simply do not contribute
    }
  }
  return hash.digest("hex").slice(0, 12);
}

/** Only the recorded venv counts — never a bare `python3` from PATH. */
function recordedPython() {
  try {
    const recorded = readFileSync(path.join(ROOT, ".deploy-python"), "utf8").trim();
    if (recorded && existsSync(recorded)) return recorded;
  } catch {
    // not recorded yet
  }
  const venv = path.join(AGENT_DIR, ".venv-deploy", "bin", "python");
  if (existsSync(venv)) return venv;
  return null;
}

/** What an install must have produced, regardless of the marker. */
function artifactsReady() {
  if (!existsSync(path.join(WEB_DIR, "node_modules", "next"))) return false;
  if (!existsSync(path.join(WEB_DIR, "public", "vendor", "three"))) return false;
  if (!existsSync(path.join(AGENT_DIR, "main.py"))) return false;
  return Boolean(recordedPython());
}

/**
 * `artifactsReady()` plus the recorded fingerprint — the fast path that lets a
 * restarted launcher skip a (re)install. The marker is written by prepare()
 * *after* the artifacts check, never required in order to pass it.
 */
function depsReady() {
  if (process.env.FORCE_REINSTALL === "1") return false;
  try {
    if (readFileSync(READY_MARKER, "utf8").trim() !== depsFingerprint()) return false;
  } catch {
    return false;
  }
  return artifactsReady();
}

// ── public port: status page, diagnostics, then reverse proxy ────────────────

const escapeHtml = (value) =>
  String(value).replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char]));

function statusPage() {
  const failed = phase === "failed";
  const accent = failed ? "#A32D2D" : phase === "degraded" ? "#8A5A00" : "#185FA5";
  const heading = failed
    ? "应用启动失败"
    : phase === "degraded"
      ? "应用正在自动恢复"
      : phase === "ready"
        ? "应用已就绪"
        : "应用正在准备中";
  const note = failed
    ? "依赖准备失败，下方是日志尾部。"
    : phase === "degraded"
      ? "web 服务刚刚掉线，启动器正在重启它。此页面会自动刷新。"
      : "首次部署需要安装前端与 agent 依赖，通常需要 3-10 分钟。此页面会自动刷新。";

  const logBlock = failed
    ? `<pre style="margin:16px 0 0;padding:12px;max-height:340px;overflow:auto;background:#fff;
         border:0.5px solid rgba(0,0,0,.15);border-radius:8px;font-size:12px;line-height:1.5;
         white-space:pre-wrap;word-break:break-all">${escapeHtml(
           [
             "--- .install-node.log (tail) ---",
             readTail(path.join(ROOT, ".install-node.log"), 20),
             "",
             "--- .install-agent.log (tail) ---",
             readTail(path.join(ROOT, ".install-agent.log"), 20),
           ].join("\n"),
         )}</pre>`
    : "";

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${failed || phase === "ready" ? "" : '<meta http-equiv="refresh" content="6">'}
<title>${heading}</title>
<style>
 body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
      background:#F1EFE8;color:#2C2C2A;font:14px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
 main{max-width:660px;padding:32px}
 h1{margin:0 0 8px;font-size:15px;font-weight:500;color:${accent}}
 p{margin:0 0 12px;color:#5F5E5A}
 a{color:#185FA5}
 dl{margin:16px 0 0;display:grid;grid-template-columns:auto 1fr;gap:4px 12px}
 dt{color:#888780;font-size:13px}
 dd{margin:0;font-size:13px}
</style></head>
<body><main>
<h1>${heading}</h1>
<p>${note}</p>
<dl>
 <dt>阶段</dt><dd>${phase}</dd>
 <dt>状态</dt><dd>${escapeHtml(detail)}</dd>
 <dt>已用时</dt><dd>${elapsedSeconds()}s</dd>
 <dt>agent</dt><dd>${agentReady ? "已就绪" : "未就绪"}</dd>
 <dt>依赖</dt><dd>${depsAreReady ? "已安装" : "未就绪"}</dd>
</dl>
${logBlock}
<p style="margin-top:16px"><a href="/__launcher">运行状态 (JSON)</a> ·
<a href="/__launcher/logs">运行日志</a></p>
</main></body></html>`;
}

function serveHtml(res, status, body) {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function forward(req, res) {
  const upstream = http.request(
    {
      host: "127.0.0.1",
      port: INTERNAL_WEB_PORT,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${INTERNAL_WEB_PORT}` },
    },
    (response) => {
      res.writeHead(response.statusCode || 502, response.headers);
      response.pipe(res);
    },
  );

  upstream.on("error", (error) => {
    record("launcher", `proxy error for ${req.url}: ${error.message}`);
    if (res.headersSent) {
      res.destroy();
      return;
    }
    // Never hand the platform a 5xx when the web server is merely restarting —
    // the status page explains the state and the monitor flips us back.
    markWebDown(`proxy error for ${req.url}: ${error.message}`);
    serveHtml(res, 200, statusPage());
  });

  req.pipe(upstream);
}

function handleRequest(req, res) {
  const url = (req.url || "/").split("?")[0];

  if (url === "/__ping") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("ok");
    return;
  }

  if (url === "/__launcher") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(snapshot(), null, 2));
    return;
  }

  if (url === "/__launcher/logs") {
    const body = [
      `== launcher (${elapsedSeconds()}s, phase=${phase}) ==`,
      tailOf("launcher"),
      "",
      "== web (last 40) ==",
      tailOf("web", 40),
      "",
      "== next build (last 40) ==",
      tailOf("build", 40),
      "",
      "== agent (last 40) ==",
      tailOf("agent", 40),
      "",
      "== .install-node.log ==",
      readTail(path.join(ROOT, ".install-node.log"), 40),
      "",
      "== .install-agent.log ==",
      readTail(path.join(ROOT, ".install-agent.log"), 40),
    ].join("\n");
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    res.end(body);
    return;
  }

  if (phase === "ready") {
    forward(req, res);
    return;
  }

  serveHtml(res, 200, statusPage());
}

function startPublicServer() {
  const server = http.createServer(handleRequest);

  // Next's dev overlay and HMR use websockets; pass the upgrade through once the
  // web server is up.
  server.on("upgrade", (req, socket, head) => {
    if (phase !== "ready") {
      socket.destroy();
      return;
    }
    const target = net.connect(INTERNAL_WEB_PORT, "127.0.0.1", () => {
      const headers = Object.entries(req.headers)
        .map(([key, value]) => `${key}: ${value}`)
        .join("\r\n");
      target.write(`${req.method} ${req.url} HTTP/1.1\r\n${headers}\r\n\r\n`);
      if (head?.length) target.write(head);
      socket.pipe(target).pipe(socket);
    });
    target.on("error", () => socket.destroy());
    socket.on("error", () => target.destroy());
  });

  // A restart can find the previous instance still holding the port for a few
  // seconds; retry forever instead of dying (a dead launcher is what surfaces
  // as "service on port 3000 not ready after 30000ms").
  server.on("error", (error) => {
    record("launcher", `public port ${PUBLIC_PORT} unavailable: ${error.code || error.message} — retry in 2s`);
    setTimeout(bind, 2_000);
  });

  function bind() {
    if (shuttingDown) return;
    try {
      server.listen(Number(PUBLIC_PORT), "0.0.0.0", () => {
        log(`public port ${PUBLIC_PORT} is open (pid ${process.pid})`);
      });
    } catch (error) {
      record("launcher", `listen failed: ${error.message} — retry in 2s`);
      setTimeout(bind, 2_000);
    }
  }

  bind();
  publicServer = server;
  return server;
}

// ── child processes ─────────────────────────────────────────────────────────

function attachLogs(child, name) {
  let stream = null;
  try {
    stream = createWriteStream(path.join(ROOT, `.run-${name}.log`), { flags: "a" });
  } catch {
    stream = null;
  }
  for (const source of [child.stdout, child.stderr]) {
    if (!source) continue;
    source.on("data", (chunk) => {
      const text = chunk.toString();
      try {
        stream?.write(text);
      } catch {
        // logging must never take the launcher down
      }
      record(name, text);
    });
  }
}

/**
 * Keep a child alive instead of letting its death kill the launcher: the public
 * port must stay bound so the platform's readiness probe keeps succeeding.
 */
function supervise(name, factory, { maxRestarts = 50, baseDelayMs = 2_000 } = {}) {
  const state = { child: null, restarts: 0, lastExit: null, startedAt: null };
  procs.set(name, state);

  const restart = (reason) => {
    state.lastExit = reason;
    record("launcher", `[${name}] ${reason}`);
    if (shuttingDown || state.restarts >= maxRestarts) {
      if (!shuttingDown) record("launcher", `[${name}] not restarting again (${state.restarts} attempts)`);
      return;
    }
    state.restarts += 1;
    const delay = Math.min(30_000, baseDelayMs * state.restarts);
    setTimeout(launch, delay).unref?.();
  };

  function launch() {
    if (shuttingDown) return;
    let child;
    try {
      child = factory();
    } catch (error) {
      restart(`spawn failed: ${error.message}`);
      return;
    }
    state.child = child;
    state.startedAt = Date.now();
    attachLogs(child, name);
    child.on("exit", (code, signal) => {
      state.child = null;
      if (name === "agent") agentReady = false;
      if (shuttingDown) return;
      restart(`exited (code=${code ?? "null"} signal=${signal ?? "null"})`);
    });
    child.on("error", (error) => {
      state.child = null;
      if (shuttingDown) return;
      restart(`failed to start: ${error.message}`);
    });
  }

  launch();
  return state;
}

function startAgent() {
  const python = process.env.PYTHON_BIN || process.env.PYTHON || recordedPython() || "python3";
  log(`agent: ${python} -m uvicorn main:app --host 127.0.0.1 --port ${AGENT_PORT}`);
  supervise(
    "agent",
    () =>
      spawn(
        python,
        ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", AGENT_PORT],
        {
          cwd: AGENT_DIR,
          env: { ...process.env, PORT: AGENT_PORT, PYTHONUNBUFFERED: "1" },
          stdio: ["ignore", "pipe", "pipe"],
        },
      ),
    { maxRestarts: 20 },
  );
}

function nextBinary() {
  const nextBin = path.join(WEB_DIR, "node_modules", "next", "dist", "bin", "next");
  return existsSync(nextBin) ? nextBin : null;
}

function hasProductionBuild() {
  return existsSync(path.join(WEB_DIR, ".next", "BUILD_ID"));
}

/**
 * `next dev` is not usable for a long-running deployment here: it exits cleanly
 * (code 0, no signal) every few minutes in this sandbox, which is exactly what
 * used to take the whole service down. So build once and serve `next start`,
 * which is a plain server with no dev workers or file watching. `next build`
 * does not fit the install budget, hence the runtime build. FORCE_DEV=1 keeps
 * the dev server for local work.
 */
async function ensureWebBuild() {
  const nextBin = nextBinary();
  if (!nextBin) return false;

  if (process.env.FORCE_DEV === "1") {
    log("FORCE_DEV=1 — serving `next dev` (not for deployments)");
    return false;
  }

  const want = sourceFingerprint();
  let built = false;
  try {
    built = readFileSync(BUILD_MARKER, "utf8").trim() === want;
  } catch {
    built = false;
  }

  if (built && hasProductionBuild()) {
    log(`production build is current (${want}) — next start`);
    return true;
  }

  if (hasProductionBuild()) {
    log(`source changed since the last build (${want}) — dropping the stale .next`);
    try {
      rmSync(path.join(WEB_DIR, ".next"), { recursive: true, force: true });
    } catch (error) {
      log(`could not remove the stale .next: ${error.message}`);
    }
  }

  phase = "preparing";
  detail = "正在构建生产版本（首次需要几分钟，此页面会自动刷新）";
  log("running `next build` — this can take a few minutes");

  try {
    await run(process.execPath, [nextBin, "build"], {
      cwd: WEB_DIR,
      name: "build",
      env: { NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" },
    });
  } catch (error) {
    log(`next build failed: ${error.message} — falling back to \`next dev\``);
    return false;
  }

  if (!hasProductionBuild()) {
    log("next build reported success but produced no BUILD_ID — using `next dev`");
    return false;
  }

  try {
    writeFileSync(BUILD_MARKER, `${want}\n`);
  } catch (error) {
    log(`could not write ${BUILD_MARKER}: ${error.message}`);
  }

  log(`production build ready after ${elapsedSeconds()}s`);
  return true;
}

function startWebServer() {
  if (!nextBinary()) throw new Error(`next binary not found under ${WEB_DIR}/node_modules`);

  const describe = () => (hasProductionBuild() ? "start" : "dev --webpack");

  log(`web: next ${describe()} -H 127.0.0.1 -p ${INTERNAL_WEB_PORT}`);

  supervise(
    "web",
    () => {
      const mode = hasProductionBuild() ? ["start"] : ["dev", "--webpack"];
      const production = mode[0] === "start";
      return spawn(
        process.execPath,
        [nextBinary(), ...mode, "-H", "127.0.0.1", "-p", INTERNAL_WEB_PORT],
        {
          cwd: WEB_DIR,
          env: {
            ...process.env,
            PORT: INTERNAL_WEB_PORT,
            HOSTNAME: "127.0.0.1",
            NEXT_TELEMETRY_DISABLED: "1",
            NODE_ENV: production ? "production" : "development",
            LANGGRAPH_DEPLOYMENT_URL: process.env.LANGGRAPH_DEPLOYMENT_URL || AGENT_ORIGIN,
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
    },
    { maxRestarts: 50 },
  );
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const state of procs.values()) {
    const child = state.child;
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref?.();
    }
  }
  publicServer?.close();
  setTimeout(() => process.exit(code), 1_000).unref?.();
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(0));
}

// A crash here means nothing listens on the public port, so swallow-and-log
// rather than exit: the port is more valuable than a clean stack trace.
process.on("uncaughtException", (error) => {
  record("launcher", `uncaughtException: ${error?.stack || error}`);
});
process.on("unhandledRejection", (reason) => {
  record("launcher", `unhandledRejection: ${reason?.stack || reason}`);
});

// ── readiness probing and state machine ─────────────────────────────────────

function ping(url, timeout = 8_000) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout }, (response) => {
      response.resume();
      resolve((response.statusCode ?? 0) < 500);
    });
    request.on("error", () => resolve(false));
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitFor(url, { timeoutMs, label }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (shuttingDown) return false;
    if (await ping(url)) return true;
    await sleep(1_000);
  }
  log(`${label} did not answer ${url} within ${timeoutMs}ms`);
  return false;
}

/**
 * Only a *gone* web process counts as down: `next dev` can legitimately take
 * 20s+ to answer a first compile, and flipping to the status page over a slow
 * response would cut off users of a perfectly healthy app.
 */
function markWebDown(reason) {
  const webChild = procs.get("web")?.child ?? null;
  if (phase === "ready" && !webChild) {
    phase = "degraded";
    detail = "web 服务已退出，正在自动重启";
    log(`${reason} — showing the status page until it is back`);
  }
}

async function monitorTick() {
  if (shuttingDown) return;

  const webChild = procs.get("web")?.child;
  const [webOk, agentOk] = await Promise.all([
    ping(`${WEB_ORIGIN}/`, 10_000),
    ping(`${AGENT_ORIGIN}/health`),
  ]);

  agentReady = agentOk;

  if (webOk) {
    if (phase !== "ready") {
      phase = "ready";
      detail = "运行中";
      log(`ready after ${elapsedSeconds()}s — serving on port ${PUBLIC_PORT}`);
    }
  } else if (phase === "ready" && !webChild) {
    markWebDown("web process is not running");
  }
}

// ── preparation ─────────────────────────────────────────────────────────────

function run(command, args, { cwd = ROOT, name = "install", env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    attachLogs(child, name);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(command)} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

async function prepare(attempt) {
  detail = attempt > 1
    ? `安装前端与 agent 依赖（第 ${attempt} 次尝试）`
    : "安装前端与 agent 依赖（3-10 分钟）";
  log(detail);

  const timer = setTimeout(() => {
    detail = `依赖准备已超过 ${Math.round(PREPARE_TIMEOUT_MS / 60_000)} 分钟，仍在进行`;
    log(detail);
  }, PREPARE_TIMEOUT_MS);

  try {
    await run("sh", [INSTALL_SCRIPT]);
  } finally {
    clearTimeout(timer);
  }

  if (!artifactsReady()) {
    throw new Error("install finished but the dependency artifacts are still missing");
  }

  try {
    writeFileSync(READY_MARKER, `${depsFingerprint()}\n`);
  } catch (error) {
    log(`could not write ${READY_MARKER}: ${error.message}`);
  }

  detail = "依赖就绪";
  log(`dependencies ready after ${elapsedSeconds()}s`);
}

async function ensureDeps() {
  if (process.env.SKIP_PREPARE === "1") {
    detail = "依赖准备已跳过";
    depsAreReady = depsReady();
    return depsAreReady;
  }

  if (depsReady()) {
    detail = "复用已安装的依赖";
    depsAreReady = true;
    log(`dependency marker is current (${depsFingerprint()}) — skipping install`);
    return true;
  }

  if (!existsSync(INSTALL_SCRIPT)) {
    phase = "failed";
    detail = `missing ${INSTALL_SCRIPT}`;
    return false;
  }

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await prepare(attempt);
      depsAreReady = true;
      return true;
    } catch (error) {
      log(`preparation attempt ${attempt} failed: ${error.message}`);
      depsAreReady = artifactsReady();
      if (attempt < 2 && !depsAreReady) {
        detail = `${error.message} — 10 秒后重试`;
        await sleep(10_000);
      }
    }
  }

  phase = "failed";
  detail = "依赖准备失败，详见下方日志";
  return false;
}

// ── diagnostics ─────────────────────────────────────────────────────────────

function snapshot() {
  const children = {};
  for (const [name, state] of procs) {
    const running = Boolean(state.child && state.child.exitCode === null);
    children[name] = {
      running,
      pid: state.child?.pid ?? null,
      runningForSeconds: running && state.startedAt
        ? Math.round((Date.now() - state.startedAt) / 1000)
        : null,
      restarts: state.restarts,
      lastExit: state.lastExit,
    };
  }
  return {
    phase,
    detail,
    elapsedSeconds: elapsedSeconds(),
    uptimeSeconds: Math.round(process.uptime()),
    pid: process.pid,
    ports: { public: Number(PUBLIC_PORT), web: Number(INTERNAL_WEB_PORT), agent: Number(AGENT_PORT) },
    agentReady,
    deps: {
      ready: depsAreReady,
      artifacts: artifactsReady(),
      fingerprint: depsFingerprint(),
      python: recordedPython(),
      marker: existsSync(READY_MARKER),
    },
    web: {
      mode: hasProductionBuild() ? "start" : "dev",
      sourceFingerprint: sourceFingerprint(),
      buildMarkerCurrent: (() => {
        try {
          return readFileSync(BUILD_MARKER, "utf8").trim() === sourceFingerprint();
        } catch {
          return false;
        }
      })(),
    },
    children,
    memory: {
      launcherRssBytes: process.memoryUsage().rss,
      freeBytes: os.freemem(),
      totalBytes: os.totalmem(),
    },
  };
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  startPublicServer();

  // Keeps the sandbox warm and gives the platform's probe something to hit
  // without side effects.
  setInterval(() => {
    if (!shuttingDown) ping(`http://127.0.0.1:${PUBLIC_PORT}/__ping`, 3_000);
  }, 60_000).unref?.();

  setInterval(monitorTick, 5_000).unref?.();

  await ensureDeps();

  if (!depsAreReady) {
    // Best effort: a failed install must not stop us from trying any usable
    // leftovers, and the supervisor keeps retrying every spawn.
    log("dependencies are not ready — starting services anyway (status page keeps the detail)");
  } else {
    phase = "starting";
    detail = "启动 agent 与 web 服务";
  }

  if (existsSync(path.join(AGENT_DIR, "main.py"))) startAgent();
  else log("apps/agent/main.py is missing — chat will be unavailable");

  // The production build takes minutes on a cold boot; the public port stays
  // bound and shows the status page the whole time.
  await ensureWebBuild();

  try {
    startWebServer();
  } catch (error) {
    // A missing `next` binary is retried by the supervisor, which keeps the
    // public port bound instead of taking the launcher down.
    log(`web could not start yet: ${error.message}`);
    supervise("web", () => {
      throw new Error(`next binary not found under ${WEB_DIR}/node_modules`);
    }, { maxRestarts: 60, baseDelayMs: 5_000 });
  }

  if (!depsAreReady) return;

  // Give the web server one long window before declaring it slow; the monitor
  // handles the ready transition from here on.
  const webUp = await waitFor(`${WEB_ORIGIN}/`, { timeoutMs: 900_000, label: "web" });
  if (webUp && phase !== "ready") {
    phase = "ready";
    detail = "运行中";
    log(`ready after ${elapsedSeconds()}s — serving on port ${PUBLIC_PORT}`);
  } else if (phase !== "ready") {
    phase = "degraded";
    detail = "web 服务未能在 15 分钟内就绪，仍在重试";
    log(detail);
  }

  waitFor(`${AGENT_ORIGIN}/health`, { timeoutMs: 300_000, label: "agent" }).then((ok) => {
    agentReady = ok;
    log(ok ? `agent healthy at ${AGENT_ORIGIN}` : "agent did not become healthy; chat will be unavailable");
  });
}

main().catch((error) => {
  phase = "failed";
  detail = error.stack || error.message;
  log(`fatal: ${detail}`);
});
