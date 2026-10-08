import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const logDir = path.join(root, ".data", "codespaces-demo");
mkdirSync(logDir, { recursive: true });
const children = new Set();
const timers = new Set();
let stopping = false;

function supervise(name, command, args, cwd, env) {
  let delay = 1_000;
  const launch = () => {
    if (stopping) return;
    const log = createWriteStream(path.join(logDir, `${name}.log`), { flags: "a" });
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env } });
    children.add(child);
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.on("error", (error) => console.error(`${name}: ${error.message}`));
    child.on("close", (code) => {
      children.delete(child);
      log.end();
      if (stopping) return;
      console.error(`${name} exited (${code}); retrying in ${delay / 1000}s`);
      const timer = setTimeout(() => {
        timers.delete(timer);
        launch();
      }, delay);
      timers.add(timer);
      delay = Math.min(delay * 2, 30_000);
    });
  };
  launch();
}

const agentDir = path.join(root, "apps", "agent");
const model = process.env.LLM_MODEL || "deepseek-chat";
const hasModelKey = model.startsWith("deepseek-")
  ? Boolean(process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY)
  : model.startsWith("gpt-")
    ? Boolean(process.env.OPENAI_API_KEY)
    : Boolean(process.env.ANTHROPIC_API_KEY);

if (hasModelKey) {
  supervise("agent", path.join(agentDir, ".venv", "bin", "python"),
    ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8123"],
    agentDir, { LLM_MODEL: model });
} else {
  console.error("Model API key is missing. Add DEEPSEEK_API_KEY in Codespaces secrets, then stop and restart this codespace to enable generation.");
}

const webDir = path.join(root, "apps", "app", ".next", "standalone", "apps", "app");
supervise("web", process.execPath, [path.join(webDir, "server.js")], webDir, {
  NODE_ENV: "production",
  HOSTNAME: "0.0.0.0",
  PORT: "3000",
  LANGGRAPH_DEPLOYMENT_URL: "http://127.0.0.1:8123",
  HISTORY_DATA_DIR: path.join(root, ".data", "history"),
  UPLOAD_DATA_DIR: path.join(root, ".data", "uploads"),
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true;
    for (const timer of timers) clearTimeout(timer);
    for (const child of children) child.kill("SIGTERM");
  });
}
