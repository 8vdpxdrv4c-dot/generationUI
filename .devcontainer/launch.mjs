import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const logDir = path.join(root, ".data", "codespaces-demo");
const pidFile = path.join(logDir, "launcher.pid");
mkdirSync(logDir, { recursive: true });
let running = false;
try {
  const pid = Number(readFileSync(pidFile, "utf8").trim());
  // A restarted container can reuse the old PID for an unrelated process.
  running = readFileSync(`/proc/${pid}/cmdline`, "utf8").includes(".devcontainer/run.mjs");
} catch {
  // First start, or the previous launcher has stopped.
}
if (running) {
  console.log(`Generation UI is already running. Logs: ${logDir}`);
} else {
  const log = openSync(path.join(logDir, "launcher.log"), "a");
  const child = spawn(process.execPath, [".devcontainer/run.mjs"], {
    cwd: root,
    detached: true,
    stdio: ["ignore", log, log],
  });
  child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
  if (child.pid) writeFileSync(pidFile, String(child.pid));
  child.unref();
  closeSync(log);
  // Let the detached supervisor initialize before the lifecycle command ends.
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  console.log(`Starting Next.js on 3000 and the internal Python Agent. Logs: ${logDir}`);
}
