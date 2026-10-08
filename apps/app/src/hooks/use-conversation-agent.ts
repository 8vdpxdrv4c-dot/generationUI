"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useAgent, useCopilotKit } from "@copilotkit/react-core/v2";

/** Catch runtime changes between render and effect subscription on a cold load. */
export function useConversationAgent(options: Parameters<typeof useAgent>[0]) {
  const { copilotkit } = useCopilotKit();
  const subscribe = useCallback((notify: () => void) => {
    const subscription = copilotkit.subscribe({ onRuntimeConnectionStatusChanged: notify });
    return () => subscription.unsubscribe();
  }, [copilotkit]);
  const status = useSyncExternalStore(subscribe, () => copilotkit.runtimeConnectionStatus, () => "disconnected");
  const result = useAgent(options);
  return { ...result, isReady: status === "connected" };
}
