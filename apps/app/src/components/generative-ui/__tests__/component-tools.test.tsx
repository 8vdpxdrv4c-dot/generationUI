import { StrictMode, useEffect } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CopilotKitProvider, useCopilotKit } from "@copilotkit/react-core/v2";
import { COMPONENT_TOOLS } from "../component-tools";

afterEach(cleanup);

describe("persistent component tool registration", () => {
  it("survives StrictMode effect replay, runtime tool replacement, and route changes", () => {
    let core: ReturnType<typeof useCopilotKit>["copilotkit"] | undefined;
    function Probe() {
      const { copilotkit } = useCopilotKit();
      useEffect(() => { core = copilotkit; }, [copilotkit]);
      return null;
    }
    function App({ sandbox, route }: { sandbox: boolean; route: string }) {
      return <StrictMode>
        <CopilotKitProvider frontendTools={COMPONENT_TOOLS} openGenerativeUI={sandbox ? {} : undefined}>
          <Probe />
          <div key={route}>{route}</div>
        </CopilotKitProvider>
      </StrictMode>;
    }
    const view = render(<App sandbox={false} route="home" />);
    const registered = () => COMPONENT_TOOLS.forEach(tool => {
      expect(core?.getTool({ toolName: tool.name })).toBeDefined();
    });
    registered();
    view.rerender(<App sandbox route="generation" />);
    registered();
    expect(core?.getTool({ toolName: "generateSandboxedUi" })).toBeDefined();
    view.rerender(<App sandbox route="history" />);
    registered();
  });
});
