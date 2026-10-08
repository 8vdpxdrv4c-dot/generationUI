import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  status: "disconnected",
  connectBeforeSubscribe: false,
  listeners: new Set<() => void>(),
  agentStatuses: [] as string[],
}));
vi.mock("@copilotkit/react-core/v2", () => {
  const core = {
    get runtimeConnectionStatus() { return mock.status; },
    subscribe: ({ onRuntimeConnectionStatusChanged }: { onRuntimeConnectionStatusChanged: () => void }) => {
      // Simulate /info completing after render, before the effect can subscribe.
      if (mock.connectBeforeSubscribe) mock.status = "connected";
      mock.listeners.add(onRuntimeConnectionStatusChanged);
      return { unsubscribe: () => mock.listeners.delete(onRuntimeConnectionStatusChanged) };
    },
  };
  return {
    useCopilotKit: () => ({ copilotkit: core }),
    useAgent: () => { mock.agentStatuses.push(mock.status); return { agent: { state: {} } }; },
  };
});
import { useConversationAgent } from "../use-conversation-agent";

beforeEach(() => { mock.status = "disconnected"; mock.connectBeforeSubscribe = false; mock.listeners.clear(); mock.agentStatuses = []; });
afterEach(cleanup);

describe("conversation runtime readiness", () => {
  it("recovers a connection notification missed between render and subscription", () => {
    mock.connectBeforeSubscribe = true;
    const { result } = renderHook(() => useConversationAgent({ threadId: "cold-load" }));
    expect(result.current.isReady).toBe(true);
    expect(mock.agentStatuses).toContain("disconnected");
    expect(mock.agentStatuses.at(-1)).toBe("connected");
  });

  it("waits for connection and cleans up its subscription", () => {
    const view = renderHook(() => useConversationAgent({ threadId: "current" }));
    expect(view.result.current.isReady).toBe(false);
    act(() => { mock.status = "connected"; mock.listeners.forEach(notify => notify()); });
    expect(view.result.current.isReady).toBe(true);
    act(() => { mock.status = "disconnected"; mock.listeners.forEach(notify => notify()); });
    expect(view.result.current.isReady).toBe(false);
    view.unmount();
    expect(mock.listeners.size).toBe(0);
  });
});
