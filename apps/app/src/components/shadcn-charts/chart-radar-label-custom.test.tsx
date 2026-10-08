import type { ReactNode } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({ children }: { children: ReactNode }) => <svg>{children}</svg>,
  ChartTooltip: () => null,
  ChartTooltipContent: () => null,
}));
vi.mock("recharts", () => ({
  RadarChart: ({ children }: { children: ReactNode }) => <g>{children}</g>,
  Radar: () => null,
  PolarGrid: () => null,
  PolarAngleAxis: ({ tick }: { tick: (props: Record<string, unknown>) => ReactNode }) => <g>{tick({
    x: 100, y: 50, textAnchor: "middle", index: 0,
    verticalAnchor: "end", payload: { value: "January" },
    tickFormatter: () => "January",
  })}</g>,
}));

import { ChartRadarLabelCustom } from "./chart-radar-label-custom";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("renders radar labels without forwarding Recharts internal props to SVG", () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const { container } = render(<ChartRadarLabelCustom />);
  const label = container.querySelector("text")!;
  expect(label.getAttribute("x")).toBe("100");
  expect(label.getAttribute("y")).toBe("40");
  expect(label.getAttribute("text-anchor")).toBe("middle");
  expect(label.textContent).toContain("1月");
  for (const attribute of ["verticalAnchor", "payload", "tickFormatter"]) {
    expect(label.hasAttribute(attribute)).toBe(false);
  }
  expect(errors).not.toHaveBeenCalled();
});
