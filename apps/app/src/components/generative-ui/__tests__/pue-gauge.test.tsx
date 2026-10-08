import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PueGauge } from "../pue-gauge";
import { GET } from "@/app/get_pue/route";
import { pueAngle } from "@/lib/pue";

const payload = (pue: number) => ({ pue, updatedAt: "2026-09-28T08:00:00.000Z", source: "mock" });
const response = (pue: number) => ({ ok: true, json: async () => payload(pue) });

describe("PUE HTTP gauge", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("serves changing JSON samples within 1–1.3 without caching", async () => {
    vi.setSystemTime(new Date(0));
    const first = GET();
    const a = await first.json();
    expect(first.headers.get("Cache-Control")).toBe("no-store");
    vi.setSystemTime(new Date(5000));
    const b = await GET().json();
    expect(a.pue).not.toBe(b.pue);
    expect(b.source).toBe("mock");
    expect(b.pue).toBeGreaterThanOrEqual(1);
    expect(b.pue).toBeLessThanOrEqual(1.3);
  });

  it("places scale endpoints correctly and refreshes the needle after five seconds", async () => {
    expect([pueAngle(0), pueAngle(1), pueAngle(2)]).toEqual([-135, 0, 135]);
    const fetcher = vi.fn().mockResolvedValueOnce(response(1.2)).mockResolvedValue(response(1.3));
    vi.stubGlobal("fetch", fetcher);
    await act(async () => { render(<PueGauge />); });
    expect(screen.getByText("1.20")).toBeDefined();
    expect(screen.getByTestId("pue-needle").getAttribute("transform")).toBe("rotate(27 180 164)");
    expect(fetcher.mock.calls[0][0]).toBe("/get_pue");
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.getByText("1.30")).toBeDefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("retains the last valid reading on failure, rejects invalid data and recovers", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(1.2))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(response(9)).mockResolvedValue(response(1.1));
    vi.stubGlobal("fetch", fetcher);
    await act(async () => { render(<PueGauge />); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.getByRole("status").textContent).toContain("上次有效值");
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.getByText("1.20")).toBeDefined();
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.getByText("1.10")).toBeDefined();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not overlap requests and aborts when unmounted", async () => {
    const fetcher = vi.fn().mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetcher);
    const { unmount } = render(<PueGauge />);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(fetcher).toHaveBeenCalledTimes(1);
    unmount();
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
