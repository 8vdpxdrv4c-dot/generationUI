import { afterEach, describe, expect, it, vi } from "vitest";
import { applyPageEdit, EDIT_NODE_ATTRIBUTE, prepareEditableHtml, type EditorCommand } from "../editor-source";
import { editorRuntimeScript, installPageEditor } from "../editor-runtime";

afterEach(() => {
  (window as Window & { __oguiEditor?: { destroy: () => void } }).__oguiEditor?.destroy();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("source-only page edits", () => {
  const html = '<main><h1 id="title">你好 <strong>世界</strong>！</h1><canvas id="scene"></canvas><script>window.original = true;</script></main>';
  it("marks original HTML content, protects scripts and roots, and treats a canvas as a single node", () => {
    const prepared = prepareEditableHtml(`<!doctype html><html><head><style>h1{color:red}</style></head><body>${html}</body></html>`);
    const doc = new DOMParser().parseFromString(prepared.html, "text/html");
    expect(doc.querySelectorAll(`[${EDIT_NODE_ATTRIBUTE}]`)).toHaveLength(4);
    expect(doc.body.hasAttribute(EDIT_NODE_ATTRIBUTE)).toBe(false);
    expect(doc.querySelector("script")?.hasAttribute(EDIT_NODE_ATTRIBUTE)).toBe(false);
    expect(doc.querySelector("canvas")?.hasAttribute(EDIT_NODE_ATTRIBUTE)).toBe(true);
    expect(prepared.nodes[1].texts).toEqual([{ index: 0, anchor: 0, value: "你好 " }, { index: 2, anchor: 1, value: "！" }]);
  });
  it("changes an individual text node without deleting nested markup or interpreting pasted HTML", () => {
    const edited = applyPageEdit(html, { kind: "text", node: "1", index: 0, before: "你好 ", value: "修改后\n<b>纯文本</b> " });
    const doc = new DOMParser().parseFromString(edited, "text/html");
    expect(doc.querySelector("h1")?.firstChild?.textContent).toBe("修改后\n<b>纯文本</b> ");
    expect(doc.querySelector("strong")?.textContent).toBe("世界");
    expect(doc.querySelector("b")).toBeNull();
    expect(doc.querySelector("script")?.textContent).toBe("window.original = true;");
    expect(edited).not.toContain(EDIT_NODE_ATTRIBUTE);
  });
  it("preserves transforms and flow while moving repeatedly", () => {
    const initial = '<div style="display:grid"><button style="transform:rotate(10deg);translate:5px 8px">移动</button><p>邻居</p></div>';
    const first = applyPageEdit(initial, { kind: "move", node: "1", x: 12, y: -4, baseTranslate: "5px 8px" });
    const second = applyPageEdit(first, { kind: "move", node: "1", x: 3, y: 2, baseTranslate: "17px 4px" });
    const doc = new DOMParser().parseFromString(second, "text/html");
    expect(doc.querySelector("button")?.style.transform).toBe("rotate(10deg)");
    expect(doc.querySelector("button")?.style.translate).toBe("calc(17px + 3px) calc(4px + 2px)");
    expect(doc.querySelector("button")?.style.position).toBe("");
    expect(doc.querySelector("p")?.textContent).toBe("邻居");
    expect(second).not.toContain("ogui-editor");
  });
  it("keeps text anchors stable when a previous text is cleared", () => {
    const cleared = applyPageEdit(html, { kind: "text", node: "1", index: 0, anchor: 0, before: "你好 ", value: "" });
    const edited = applyPageEdit(cleared, { kind: "text", node: "1", index: 2, anchor: 1, before: "！", value: "再见" });
    const restored = applyPageEdit(edited, { kind: "text", node: "1", index: 0, anchor: 0, before: "", value: "欢迎 " });
    expect(new DOMParser().parseFromString(restored, "text/html").querySelector("h1")?.innerHTML).toBe("欢迎 <strong>世界</strong>再见");
  });
  it("rejects stale text, malformed coordinates, protected nodes and script-like styles", () => {
    expect(() => applyPageEdit(html, { kind: "text", node: "1", index: 0, before: "stale", value: "x" })).toThrow();
    expect(() => applyPageEdit(html, { kind: "move", node: "999", x: 1, y: 2, baseTranslate: "none" })).toThrow();
    expect(() => applyPageEdit(html, { kind: "move", node: "0", x: NaN, y: 2, baseTranslate: "none" })).toThrow();
    expect(() => applyPageEdit(html, { kind: "move", node: "0", x: 1, y: 2, baseTranslate: "0;position:fixed" })).toThrow();
    expect(() => applyPageEdit(html, { kind: "patch", node: "1", styles: { position: "absolute" } })).toThrow();
    expect(() => applyPageEdit(html, { kind: "patch", node: "1", attributes: { onclick: "alert(1)" } })).toThrow();
    expect(() => applyPageEdit(html, { kind: "patch", node: "1", styles: { color: "red;background:black" } })).toThrow();
  });
});

describe("sandbox editor", () => {
  function fixture(html: string) {
    const prepared = prepareEditableHtml(html);
    document.body.innerHTML = prepared.html;
    let shadow: ShadowRoot | null = null;
    const attach = HTMLElement.prototype.attachShadow;
    vi.spyOn(HTMLElement.prototype, "attachShadow").mockImplementation(function (this: HTMLElement, init) { shadow = attach.call(this, init); return shadow; });
    const send = vi.spyOn(window, "postMessage");
    // Verify the exact serialized script is self-contained, as in the opaque iframe.
    new Function(editorRuntimeScript(prepared.nodes, "test-channel"))();
    const api = (window as unknown as Window & { __oguiEditor: { enable: (value: boolean) => void; flush: () => void; command: (value: EditorCommand) => void } }).__oguiEditor;
    api.enable(true);
    return { api, send, get edits() { return send.mock.calls.filter(([data]) => data.type === "__ogui_edit").map(([data]) => data.edit); }, get shadow() { return shadow!; } };
  }
  it("intercepts generated actions only while editing and excludes dynamically inserted clones", () => {
    const test = fixture('<main><button id="action">操作</button></main>');
    const action = document.querySelector<HTMLButtonElement>("#action")!;
    const callback = vi.fn(); action.addEventListener("click", callback);
    action.click(); expect(callback).not.toHaveBeenCalled();
    const clone = action.cloneNode(true) as HTMLElement; document.body.appendChild(clone); clone.click();
    expect(test.shadow.querySelector<HTMLElement>(".selection")!.style.display).toBe("none");
    test.api.enable(false); action.click(); expect(callback).toHaveBeenCalledOnce();
  });
  it("commits plain text on flush, preserves child elements, and cancels with Escape", () => {
    const test = fixture('<p id="text">原标题<strong>保留标签</strong></p>');
    const element = document.querySelector<HTMLElement>("#text")!;
    element.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    let input = test.shadow.querySelector<HTMLTextAreaElement>("textarea")!;
    input.value = "新标题\n第二行";
    test.api.flush();
    expect(element.firstChild?.textContent).toBe("新标题\n第二行");
    expect(element.querySelector("strong")?.textContent).toBe("保留标签");
    expect(test.send).toHaveBeenCalledWith(expect.objectContaining({ channel: "test-channel", edit: expect.objectContaining({ kind: "text", value: "新标题\n第二行" }) }), "*");
    element.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    input = test.shadow.querySelector<HTMLTextAreaElement>("textarea")!;
    input.value = "取消修改"; input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(element.firstChild?.textContent).toBe("新标题\n第二行");
    expect(test.shadow.querySelector("textarea")).toBeNull();
  });
  it("does not edit text overwritten by a script or content inside canvas/scene containers", () => {
    const test = fixture('<main><p id="dynamic">初值</p><div id="scene"><canvas></canvas></div></main>');
    document.querySelector("#dynamic")!.textContent = "实时数据";
    for (const id of ["dynamic", "scene"]) document.querySelector(`#${id}`)!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    expect(test.shadow.querySelector("textarea")).toBeNull();
    expect(test.edits).toHaveLength(0);
  });
  it("moves through the handle, accumulates offsets, and cancels without changing document flow", () => {
    const test = fixture('<div><h1 style="transform:rotate(10deg)">拖动标题</h1><p>邻居</p></div>');
    const title = document.querySelector<HTMLElement>("h1")!;
    title.click();
    const handle = test.shadow.querySelector("button")!;
    const pointer = (name: string, x: number, y: number) => handle.dispatchEvent(new MouseEvent(name, { bubbles: true, composed: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
    pointer("pointerdown", 100, 100); pointer("pointermove", 160, 120); pointer("pointerup", 160, 120);
    expect(title.style.translate).toBe("calc(0px + 60px) calc(0px + 20px)");
    expect(title.style.transform).toBe("rotate(10deg)");
    expect(title.style.position).toBe("");
    expect(test.edits.at(-1)).toEqual({ kind: "move", node: "1", x: 60, y: 20, baseTranslate: "none" });
    const saved = title.style.translate;
    pointer("pointerdown", 160, 120); pointer("pointermove", 190, 140); pointer("pointercancel", 190, 140);
    expect(title.style.translate).toBe(saved);
    expect(test.edits).toHaveLength(1);
  });
  it("tracks scrolled viewport coordinates and treats canvas fallback content as one scene", () => {
    const test = fixture('<main><canvas id="scene"><span>画布内部</span></canvas></main>');
    const scene = document.querySelector<HTMLCanvasElement>("canvas")!;
    expect(scene.querySelector("span")?.hasAttribute(EDIT_NODE_ATTRIBUTE)).toBe(false);
    const rect = { left: 10, top: 50, width: 200, height: 80 };
    vi.spyOn(scene, "getBoundingClientRect").mockImplementation(() => rect as DOMRect);
    scene.click();
    rect.top = -30; window.dispatchEvent(new Event("scroll"));
    expect(test.shadow.querySelector<HTMLElement>(".selection")!.style.top).toBe("-30px");
    const handle = test.shadow.querySelector("button")!;
    handle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, composed: true, cancelable: true, clientX: 20, clientY: 5 }));
    window.dispatchEvent(new MouseEvent("mousemove", { cancelable: true, clientX: 45, clientY: 35 }));
    window.dispatchEvent(new MouseEvent("mouseup", { cancelable: true }));
    expect(scene.style.translate).toBe("calc(0px + 25px) calc(0px + 30px)");
    expect(test.edits.at(-1)).toEqual(expect.objectContaining({ kind: "move", node: "1", x: 25, y: 30 }));
  });
  it("resizes an image from its northwest handle with a locked ratio and undoes the whole gesture", () => {
    const html = '<img src="/old.png" style="width:200px;height:100px;transform:matrix(1,0,0,1,0,0)">';
    const test = fixture(html);
    const image = document.querySelector<HTMLImageElement>("img")!;
    image.click();
    const handle = test.shadow.querySelector('[data-dir="nw"]')!;
    for (const [name, x, y] of [["pointerdown", 100, 100], ["pointermove", 80, 90], ["pointerup", 80, 90]] as const) handle.dispatchEvent(new MouseEvent(name, { bubbles: true, composed: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
    expect(image.style.width).toBe("220px"); expect(image.style.height).toBe("110px");
    expect(image.style.translate).toBe("calc(0px + -20px) calc(0px + -10px)");
    test.api.command({ kind: "undo" });
    expect(image.style.width).toBe("200px"); expect(image.style.height).toBe("100px");
    expect(image.style.translate).toBe(""); expect(image.style.getPropertyPriority("width")).toBe("");
    test.api.command({ kind: "redo" }); expect(image.style.width).toBe("220px");
    const source = test.edits.reduce((source, edit) => applyPageEdit(source, edit), html);
    expect(new DOMParser().parseFromString(source, "text/html").querySelector("img")?.style.width).toBe("220px");
    expect(source).not.toContain("ogui-editor");
  });
  it("restores text, styles and responsive image sources on undo, and clears redo after another edit", () => {
    const html = '<main><p>中文<strong>保留</strong></p><picture><source srcset="/wide.png"><img src="/old.png" srcset="/small.png 1x" sizes="100vw"></picture><button><svg></svg>按钮</button></main>';
    const test = fixture(html);
    const image = document.querySelector<HTMLImageElement>("img")!;
    image.click();
    test.api.command({ kind: "image", node: image.getAttribute(EDIT_NODE_ATTRIBUTE)!, src: "/upload/new.png" });
    expect(image.getAttribute("src")).toBe("/upload/new.png"); expect(image.hasAttribute("srcset")).toBe(false);
    expect(document.querySelector("source")?.hasAttribute("srcset")).toBe(false);
    test.api.command({ kind: "undo" }); expect(image.getAttribute("srcset")).toBe("/small.png 1x");
    expect(document.querySelector("source")?.getAttribute("srcset")).toBe("/wide.png");
    const paragraph = document.querySelector("p")!; paragraph.click();
    paragraph.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    test.shadow.querySelector<HTMLTextAreaElement>("textarea")!.value = "修改文字";
    test.api.flush(); expect(paragraph.firstChild?.textContent).toBe("修改文字");
    test.api.command({ kind: "undo" }); expect(paragraph.firstChild?.textContent).toBe("中文");
    test.api.command({ kind: "redo" }); expect(paragraph.firstChild?.textContent).toBe("修改文字");
    test.api.command({ kind: "undo" });
    test.api.command({ kind: "patch", node: paragraph.getAttribute(EDIT_NODE_ATTRIBUTE)!, styles: { "font-size": "28px", "font-weight": "700" } });
    test.api.command({ kind: "redo" }); expect(image.getAttribute("src")).toBe("/old.png");
    test.api.command({ kind: "undo" }); expect(paragraph.style.fontSize).toBe("");
    expect(paragraph.querySelector("strong")?.textContent).toBe("保留");
    const source = test.edits.reduce((source, edit) => applyPageEdit(source, edit), html);
    expect(new DOMParser().parseFromString(source, "text/html").querySelector("img")?.getAttribute("srcset")).toBe("/small.png 1x");
    document.querySelector("button")!.click();
    const last = test.send.mock.calls.at(-1)![0];
    expect(last.snapshot.selection.kind).toBe("button");
    document.querySelector("button")!.innerHTML = '<span data-runtime-only>临时内容</span>';
    document.querySelector("button span")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    expect(test.shadow.querySelector("textarea")).toBeNull();
  });
});
