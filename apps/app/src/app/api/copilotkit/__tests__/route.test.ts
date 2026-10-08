import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  runtime: vi.fn(), adapter: vi.fn(), endpoint: vi.fn(),
  handle: vi.fn(async (request: unknown) => { void request; return new Response("ok"); }),
}));
vi.mock("@copilotkit/runtime", () => ({
  CopilotRuntime: class { constructor(options: unknown) { mocks.runtime(options); } },
  ExperimentalEmptyAdapter: class { constructor() { mocks.adapter(); } },
  copilotRuntimeNextJSAppRouterEndpoint: (options: unknown) => {
    mocks.endpoint(options); return { handleRequest: mocks.handle };
  },
}));
vi.mock("@/lib/copilotkit-runtime-options", () => ({ buildRuntimeOptions: () => ({ agents: {} }) }));

describe("runtime request lifecycle", () => {
  it("preserves the JSON envelope for real connect/run requests", async () => {
    const { POST } = await import("../route");
    const body = { threadId: "test", messages: [{ role: "user", content: "北京天气 <script>示例</script>" }] };
    const request = new NextRequest("http://localhost:3000/api/copilotkit", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ method: "agent/connect", params: { agentId: "default" }, body }),
    });
    await POST(request);
    const forwarded = mocks.handle.mock.lastCall?.[0] as NextRequest;
    expect((await forwarded.clone().json()).body).toEqual(body);
    mocks.handle.mockClear();
  });
  it("reuses one runtime and forwards independent requests to its handler", async () => {
    const { POST } = await import("../route");
    const requests = Array.from({ length: 4 }, () => ({ headers: new Headers() }));
    const results = await Promise.all(requests.map((request) => POST(request as never)));
    expect(results.every((response) => response.status === 200)).toBe(true);
    expect(mocks.runtime).toHaveBeenCalledOnce();
    expect(mocks.adapter).toHaveBeenCalledOnce();
    expect(mocks.endpoint).toHaveBeenCalledOnce();
    expect(mocks.handle.mock.calls.map((call) => call[0])).toEqual(requests);
  });
});

