import type { SandboxInstance } from "./websandbox-loader";
import { expressionInvocation } from "./script-expressions";

export const EXECUTION_MESSAGE_TYPE = "__ogui_execution";

/** websandbox.run only inserts a script. Wait for its expression's Promise too. */
export function runSandboxExpression(sandbox: SandboxInstance, code: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    const id = crypto.randomUUID();
    const finish = (error?: Error) => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      signal.removeEventListener("abort", onAbort);
      if (error) reject(error); else resolve();
    };
    const onAbort = () => finish(new DOMException("Aborted", "AbortError"));
    const onMessage = (event: MessageEvent) => {
      if (event.source !== sandbox.iframe.contentWindow || event.data?.type !== EXECUTION_MESSAGE_TYPE || event.data.id !== id) return;
      finish(event.data.ok ? undefined : new Error(event.data.error || "场景初始化失败"));
    };
    const timer = setTimeout(() => finish(new Error("场景初始化超时，请重新生成或稍后重试。")), 45_000);
    window.addEventListener("message", onMessage);
    signal.addEventListener("abort", onAbort, { once: true });
    const script = `Promise.resolve().then(function() { return ${expressionInvocation(code)}; }).then(function() {
      parent.postMessage({type:${JSON.stringify(EXECUTION_MESSAGE_TYPE)},id:${JSON.stringify(id)},ok:true}, '*');
    }, function(error) {
      parent.postMessage({type:${JSON.stringify(EXECUTION_MESSAGE_TYPE)},id:${JSON.stringify(id)},ok:false,error:String(error && (error.stack || error.message) || error)}, '*');
    });`;
    sandbox.run(script).catch((error: unknown) => finish(error instanceof Error ? error : new Error(String(error))));
  });
}
