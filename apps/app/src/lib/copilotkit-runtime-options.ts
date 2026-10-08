import { LangGraphHttpAgent } from "@copilotkit/runtime/langgraph";

export interface RuntimeOptionsEnv {
  langgraphUrl?: string;
}

// Normalize Render's fromService hostport (bare host:port) into a full URL
function normalizeLanggraphUrl(raw?: string): string {
  if (!raw) return "http://localhost:8123";
  return raw.startsWith("http") ? raw : `http://${raw}`;
}

export function buildRuntimeOptions(env: RuntimeOptionsEnv) {
  return {
    agents: {
      default: new LangGraphHttpAgent({
        url: normalizeLanggraphUrl(env.langgraphUrl),
      }),
    },
    a2ui: { injectA2UITool: true },
    openGenerativeUI: true as const,
  };
}
