import { describe, expect, it, vi } from "vitest";
import { MAX_PREVIEW_HEIGHT, resolveSizingMode, validContentHeight } from "../sizing";
import { buildFinalFrameContent, MEASUREMENT_JS, PREVIEW_FRAME_CONTENT } from "../frame-content";

describe("page and component sizing", () => {
  it("keeps both partial and final documents in standards mode so content can shrink", () => {
    for (const source of ['<main>page</main>', '<html><body>page</body></html>', '<head></head><body>page</body>', '<!DOCTYPE html><html><body>page</body></html>']) {
      const document = new DOMParser().parseFromString(buildFinalFrameContent(source), "text/html");
      expect(document.compatMode).toBe("CSS1Compat");
      expect(document.head.querySelector("style")).not.toBeNull();
    }
    expect(new DOMParser().parseFromString(PREVIEW_FRAME_CONTENT, "text/html").compatMode).toBe("CSS1Compat");
  });
  it("uses an explicit output marker rather than reference-library selection", () => {
    expect(resolveSizingMode('<main data-ui-kind="page"><div data-ui-kind="component"></div></main>', false)).toBe("page");
    expect(resolveSizingMode("<div data-ui-kind='component'>card</div>", true)).toBe("component");
  });
  it("defaults legacy preview pages to page mode and inline chat widgets to component mode", () => {
    expect(resolveSizingMode("<main>old</main>", true)).toBe("page");
    expect(resolveSizingMode("<main>old</main>", false)).toBe("component");
  });
  it("allows long pages but bounds runaway iframe/canvas allocation", () => {
    expect(validContentHeight(9500.5, "page")).toBe(9501);
    expect(validContentHeight(9500.5, "component")).toBe(4000);
    expect(validContentHeight(80, "component")).toBe(80);
    expect(validContentHeight(Infinity, "page")).toBeNull();
    expect(validContentHeight("9000", "page")).toBeNull();
    expect(validContentHeight(1e9, "page")).toBe(MAX_PREVIEW_HEIGHT);
  });
  it("coalesces animated mutations and never reports an unbounded height", () => {
    let mutationCallback = () => {};
    let frameCallback = () => {};
    const schedule = vi.fn((callback) => { frameCallback = callback; return 1; });
    const postMessage = vi.fn();
    const fakeWindow = { addEventListener: vi.fn() };
    const fakeDocument = {
      head: { appendChild: vi.fn() },
      createElement: () => ({ textContent: "" }),
      body: { scrollHeight: 1e9, getBoundingClientRect: () => ({ height: 1e9 }) },
    };
    class Observer {
      observe() {}
    }
    class Mutation extends Observer {
      constructor(callback: () => void) { super(); mutationCallback = callback; }
    }
    new Function("window", "document", "parent", "getComputedStyle", "ResizeObserver", "MutationObserver", "requestAnimationFrame", "setInterval", "setTimeout", MEASUREMENT_JS)(
      fakeWindow, fakeDocument, { postMessage }, () => ({ marginTop: "0", marginBottom: "0" }),
      Observer, Mutation, schedule, () => 1, () => 1,
    );
    expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ height: MAX_PREVIEW_HEIGHT }), "*");
    for (let index = 0; index < 100; index++) mutationCallback();
    expect(schedule).toHaveBeenCalledTimes(1);
    frameCallback();
    mutationCallback();
    expect(schedule).toHaveBeenCalledTimes(2);
  });
});
