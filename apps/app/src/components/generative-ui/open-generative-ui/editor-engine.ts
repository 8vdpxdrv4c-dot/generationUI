import type { EditorCommand, EditorKind, EditorNode, EditorSnapshot, PageEdit } from "./editor-source";

/** Executed by string serialization inside the opaque sandbox; no outer dependencies. */
export function installPageEditor(nodes: EditorNode[], properties: string[], channel: string, attribute: string) {
  type API = { enable: (value: boolean) => void; flush: () => void; command: (command: EditorCommand) => void; destroy: () => void };
  const host = window as Window & { __oguiEditor?: API };
  host.__oguiEditor?.destroy();
  const manifest = new Map(nodes.map(node => [node.id, node]));
  const originals = new Map([...document.querySelectorAll<HTMLElement>(`[${attribute}]`)].map(el => [el.getAttribute(attribute)!, el]));
  const ratios = new Map<string, boolean>();
  const undo: { edit: PageEdit; inverse: PageEdit }[] = [];
  const redo: { edit: PageEdit; inverse: PageEdit }[] = [];
  let enabled = false;
  let selected: HTMLElement | null = null;
  let hovered: HTMLElement | null = null;
  let input: HTMLTextAreaElement | null = null;
  let finishText: ((cancel?: boolean) => void) | null = null;
  const selectionObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => { repaint(); publish(); });
  let gesture: { target: HTMLElement; direction: string; startX: number; startY: number; x: number; y: number; width: number; height: number; scaleX: number; scaleY: number; base: string; old: Record<string, string | null>; priorities: Record<string, string>; styles: Record<string, string>; pointer: boolean } | null = null;
  const root = document.createElement("div");
  root.setAttribute("data-ogui-editor", "");
  root.style.cssText = "position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483647!important;display:none;";
  const shadow = root.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>:host{all:initial}*{box-sizing:border-box}.outline{position:fixed;border:1px solid #60a5fa;pointer-events:none;display:none}.selection{border:2px solid #2563eb}.move{position:absolute;left:-2px;top:-28px;height:26px;padding:2px 10px;background:#2563eb;color:white;border:0;border-radius:5px 5px 0 0;font:12px system-ui;pointer-events:auto;cursor:move;touch-action:none}.resize{position:absolute;pointer-events:auto;background:white;border:2px solid #3b82f6;border-radius:3px;padding:0;width:10px;height:10px;transform:translate(-50%,-50%);touch-action:none}.resize[data-dir=n],.resize[data-dir=s]{width:22px;height:8px;cursor:ns-resize}.resize[data-dir=e],.resize[data-dir=w]{width:8px;height:22px;cursor:ew-resize}.resize[data-dir=nw],.resize[data-dir=se]{cursor:nwse-resize}.resize[data-dir=ne],.resize[data-dir=sw]{cursor:nesw-resize}textarea{position:fixed;pointer-events:auto;box-sizing:border-box;resize:both;min-width:100px;min-height:38px;background:white;color:#111;border:2px solid #2563eb;border-radius:4px;padding:4px;font:16px/1.4 system-ui;z-index:2}</style><div class="outline hover"></div><div class="outline selection"><button class="move" type="button" aria-label="拖动选中元素" title="拖动选中元素"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 9-3 3 3 3M9 5l3-3 3 3m0 14-3 3-3-3m10-4 3-3-3-3M2 12h20M12 2v20"/></svg></button></div>`;
  const hoverBox = shadow.querySelector<HTMLElement>(".hover")!;
  const selectionBox = shadow.querySelector<HTMLElement>(".selection")!;
  const moveHandle = shadow.querySelector<HTMLButtonElement>(".move")!;
  const directions = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  for (const direction of directions) {
    const handle = document.createElement("button");
    handle.type = "button"; handle.className = "resize"; handle.dataset.dir = direction;
    handle.setAttribute("aria-label", `调整大小 ${direction}`);
    handle.style.left = direction.includes("w") ? "0%" : direction.includes("e") ? "100%" : "50%";
    handle.style.top = direction.includes("n") ? "0%" : direction.includes("s") ? "100%" : "50%";
    selectionBox.appendChild(handle);
  }
  document.body.appendChild(root);
  function valid(el: HTMLElement | null): el is HTMLElement {
    if (!el?.isConnected || el.closest("[data-ogui-editor]")) return false;
    const id = el.getAttribute(attribute);
    return id !== null && manifest.has(id) && originals.get(id) === el;
  }
  function byId(id: string) { const el = originals.get(id) ?? null; if (!valid(el)) throw new Error("元素已变化，请重新选择"); return el; }
  function kind(el: HTMLElement): EditorKind {
    if (el.tagName === "IMG") return "image";
    if (el.matches("button,[role=button],input[type=button],input[type=submit]")) return "button";
    if (el.matches("canvas,svg") || el.querySelector("canvas") || (el.children.length === 1 && el.firstElementChild?.namespaceURI === "http://www.w3.org/2000/svg" && !manifest.get(el.getAttribute(attribute)!)?.texts.length)) return "scene";
    if (el.matches("h1,h2,h3,h4,h5,h6,p,span,strong,em,b,i,label,a,li,blockquote,small,figcaption") || (manifest.get(el.getAttribute(attribute)!)?.texts.length && !el.children.length)) return "text";
    return "container";
  }
  function resizable(el: HTMLElement) {
    const css = getComputedStyle(el);
    // Inline text and rotated/skewed boxes need a different geometry model.
    const matrix = css.transform;
    const match = matrix?.match(/^matrix\(([^)]+)\)$/)?.[1].split(",").map(Number);
    const transformed = match ? Math.abs(match[1]) > 0.001 || Math.abs(match[2]) > 0.001 || Math.abs(match[0] - 1) > 0.001 || Math.abs(match[3] - 1) > 0.001 : !!matrix && matrix !== "none";
    return kind(el) !== "scene" && (css.display !== "inline" || el.tagName === "IMG") && !transformed && !el.matches("source,br,hr");
  }
  function publish() {
    const snapshot: EditorSnapshot = { selection: null, canUndo: undo.length > 0, canRedo: redo.length > 0 };
    if (enabled && valid(selected)) {
      const css = getComputedStyle(selected);
      snapshot.selection = { node: selected.getAttribute(attribute)!, tag: selected.tagName.toLowerCase(), kind: kind(selected), resizable: resizable(selected),
        width: selected.offsetWidth || parseFloat(css.width) || 0, height: selected.offsetHeight || parseFloat(css.height) || 0,
        lockRatio: ratios.get(selected.getAttribute(attribute)!) ?? true,
        styles: Object.fromEntries(properties.map(property => [property, css.getPropertyValue(property)])) };
    }
    parent.postMessage({ type: "__ogui_editor_state", channel, snapshot }, "*");
  }
  function draw(box: HTMLElement, el: HTMLElement | null) {
    if (!enabled || !valid(el)) { box.style.display = "none"; return; }
    const rect = el.getBoundingClientRect();
    box.style.cssText = `display:block;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;`;
    if (box === selectionBox) {
      moveHandle.style.top = rect.top < 28 ? "0px" : "-28px";
      shadow.querySelectorAll<HTMLElement>(".resize").forEach(handle => { handle.style.display = resizable(el) ? "block" : "none"; });
    }
  }
  function repaint() { draw(hoverBox, hovered); draw(selectionBox, selected); }
  function send(edit: PageEdit) { parent.postMessage({ type: "__ogui_edit", channel, edit }, "*"); }
  function moveStyle(base: string, x: number, y: number) {
    const parts = (!base || base === "none" ? "0px 0px" : base).trim().split(/\s+(?![^()]*\))/);
    return `calc(${parts[0]} + ${x}px) calc(${parts[1] ?? "0px"} + ${y}px)${parts[2] ? ` ${parts[2]}` : ""}`;
  }
  function apply(edit: PageEdit): PageEdit {
    if (edit.kind === "batch") return { kind: "batch", edits: edit.edits.map(apply).reverse() };
    const el = byId(edit.node);
    if (edit.kind === "text") {
      const text = manifest.get(edit.node)!.texts.find(item => item.index === edit.index);
      const child = el.childNodes[edit.index];
      if (!text || !child || child.nodeType !== 3 || child.textContent !== edit.before || edit.value.length > 20_000) throw new Error("文字已变化，请重新选择");
      child.textContent = edit.value; text.value = edit.value;
      return { ...edit, before: edit.value, value: edit.before };
    }
    const styles = edit.kind === "move" ? { translate: moveStyle(edit.baseTranslate, edit.x, edit.y) } : edit.styles ?? {};
    const old: Record<string, string | null> = {}, priorities: Record<string, string> = {};
    for (const [property, value] of Object.entries(styles)) {
      if (!properties.includes(property) || (value !== null && (value.length > 250 || /[;{}<>]/.test(value)))) throw new Error("无效的样式修改");
      old[property] = el.style.getPropertyValue(property) || null; priorities[property] = el.style.getPropertyPriority(property);
      if (value === null) el.style.removeProperty(property); else el.style.setProperty(property, value, edit.kind === "patch" ? edit.priorities?.[property] ?? "important" : "important");
    }
    const attributes: Record<string, string | null> = {};
    if (edit.kind === "patch") for (const [name, value] of Object.entries(edit.attributes ?? {})) {
      const allowed = el.tagName === "IMG" ? ["src", "srcset", "sizes"] : el.tagName === "SOURCE" && el.parentElement?.tagName === "PICTURE" ? ["srcset", "sizes"] : [];
      if (!allowed.includes(name) || (value !== null && /javascript\s*:|data\s*:text\//i.test(value))) throw new Error("无效的图片属性");
      attributes[name] = el.getAttribute(name);
      if (value === null) el.removeAttribute(name); else el.setAttribute(name, value);
    }
    return { kind: "patch", node: edit.node, styles: old, priorities, attributes };
  }
  function record(edit: PageEdit, inverse: PageEdit) { undo.push({ edit, inverse }); if (undo.length > 100) undo.shift(); redo.length = 0; send(edit); repaint(); publish(); }
  function commit(edit: PageEdit) { const inverse = apply(edit); record(edit, inverse); }
  function stop(event: Event) { event.preventDefault(); event.stopImmediatePropagation(); }
  function inside(event: Event) { return event.composedPath().includes(root); }
  function target(event: Event) {
    if (!(event.target instanceof Element)) return null;
    const button = event.target.closest<HTMLElement>("button,[role=button]");
    return valid(button) ? button : event.target.closest<HTMLElement>(`[${attribute}]`);
  }
  function select(el: HTMLElement | null) {
    selected = valid(el) ? el : null; hovered = null;
    selectionObserver?.disconnect(); if (selected) selectionObserver?.observe(selected);
    repaint(); publish();
  }
  function intercept(event: Event) {
    if (!enabled || inside(event)) return;
    if (event.type === "pointerup" || event.type === "mouseup") finishGesture();
    stop(event);
    if (event.type === "click") { finishText?.(); select(target(event)); }
  }
  function hover(event: PointerEvent) { if (!enabled || gesture || inside(event)) return; hovered = target(event); repaint(); }
  function beginText(el: HTMLElement, hit?: Node | null) {
    finishText?.();
    if (!valid(el) || kind(el) === "scene" || el.matches("iframe,video,audio,input,select,textarea")) return;
    const candidates = [el, ...el.querySelectorAll<HTMLElement>(`[${attribute}]`)].filter(valid).flatMap(owner => {
      const entry = manifest.get(owner.getAttribute(attribute)!)!;
      return entry.texts.filter(text => owner.childNodes[text.index]?.textContent === text.value).map(text => ({ owner, entry, text }));
    });
    const candidate = candidates.find(({ owner, text }) => owner.childNodes[text.index] === hit) ?? candidates[0];
    if (!candidate) return;
    const { entry, text } = candidate;
    select(el);
    const rect = el.getBoundingClientRect();
    const editor = document.createElement("textarea"); input = editor;
    editor.setAttribute("aria-label", "修改页面文字"); editor.value = text.value;
    editor.style.cssText = `left:${Math.max(0, rect.left)}px;top:${Math.max(0, rect.top)}px;width:${Math.max(150, rect.width)}px;height:${Math.max(50, rect.height + 10)}px;`;
    shadow.appendChild(editor);
    const finish = (cancel = false) => {
      if (input !== editor) return;
      input = null; finishText = null; const value = editor.value; editor.remove();
      if (!cancel && value !== text.value && value.length <= 20_000) commit({ kind: "text", node: entry.id, index: text.index, anchor: text.anchor, before: text.value, value });
      repaint();
    };
    finishText = finish;
    editor.addEventListener("blur", () => finish());
    editor.addEventListener("keydown", event => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); finish(true); } });
    editor.addEventListener("paste", event => { event.preventDefault(); editor.setRangeText(event.clipboardData?.getData("text/plain") ?? "", editor.selectionStart, editor.selectionEnd, "end"); });
    editor.focus(); editor.select();
  }
  function doubleClick(event: MouseEvent) {
    if (!enabled || inside(event)) return;
    stop(event);
    const el = target(event); if (!valid(el)) return;
    const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node } | null; caretRangeFromPoint?: (x: number, y: number) => Range | null };
    const hit = doc.caretPositionFromPoint?.(event.clientX, event.clientY)?.offsetNode ?? doc.caretRangeFromPoint?.(event.clientX, event.clientY)?.startContainer;
    beginText(el, hit);
  }
  function startGesture(event: MouseEvent) {
    if (!enabled || !valid(selected) || event.button !== 0 || gesture) return;
    const handle = event.currentTarget as HTMLElement;
    const direction = handle.dataset.dir ?? "move";
    if (direction !== "move" && !resizable(selected)) return;
    stop(event); finishText?.();
    const css = getComputedStyle(selected), parent = selected.parentElement, rect = parent?.getBoundingClientRect();
    const scale = (size: number | undefined, layout: number | undefined) => { const ratio = size && layout ? size / layout : 1; return Math.abs(ratio - 1) < 0.01 ? 1 : ratio; };
    const keys = direction === "move" ? ["translate"] : ["width", "height", "box-sizing", "translate"];
    gesture = { target: selected, direction, startX: event.clientX, startY: event.clientY, x: 0, y: 0,
      width: selected.offsetWidth || parseFloat(css.width) || selected.getBoundingClientRect().width,
      height: selected.offsetHeight || parseFloat(css.height) || selected.getBoundingClientRect().height,
      base: css.translate || "none", old: Object.fromEntries(keys.map(key => [key, selected!.style.getPropertyValue(key) || null])),
      priorities: Object.fromEntries(keys.map(key => [key, selected!.style.getPropertyPriority(key)])), styles: {},
      scaleX: scale(rect?.width, parent?.offsetWidth), scaleY: scale(rect?.height, parent?.offsetHeight), pointer: "pointerId" in event };
    if ("pointerId" in event) handle.setPointerCapture?.((event as PointerEvent).pointerId);
  }
  function drag(event: MouseEvent) {
    const op = gesture; if (!op || (event.type === "mousemove" && op.pointer)) return;
    stop(event);
    op.x = Math.round((event.clientX - op.startX) / (op.scaleX || 1) * 100) / 100;
    op.y = Math.round((event.clientY - op.startY) / (op.scaleY || 1) * 100) / 100;
    if (op.direction === "move") op.styles = { translate: moveStyle(op.base, op.x, op.y) };
    else {
      const d = op.direction, horizontal = /[we]/.test(d), vertical = /[ns]/.test(d);
      let width = Math.max(16, Math.min(10_000, op.width + (d.includes("w") ? -op.x : d.includes("e") ? op.x : 0)));
      let height = Math.max(16, Math.min(10_000, op.height + (d.includes("n") ? -op.y : d.includes("s") ? op.y : 0)));
      const locked = kind(op.target) === "image" && (ratios.get(op.target.getAttribute(attribute)!) ?? true) && op.width > 0 && op.height > 0;
      if (locked) { const ratio = op.width / op.height; if (horizontal && (!vertical || Math.abs(width / op.width - 1) >= Math.abs(height / op.height - 1))) height = width / ratio; else width = height * ratio; }
      op.styles = { "box-sizing": "border-box" };
      if (horizontal || locked) op.styles.width = `${Math.round(width * 100) / 100}px`;
      if (vertical || locked) op.styles.height = `${Math.round(height * 100) / 100}px`;
      if (d.includes("w") || d.includes("n")) op.styles.translate = moveStyle(op.base, d.includes("w") ? op.width - width : 0, d.includes("n") ? op.height - height : 0);
    }
    for (const [key, value] of Object.entries(op.styles)) op.target.style.setProperty(key, value, "important");
    repaint();
  }
  function finishGesture(cancel = false) {
    const op = gesture; if (!op) return; gesture = null;
    if (cancel) for (const [key, value] of Object.entries(op.old)) { if (value === null) op.target.style.removeProperty(key); else op.target.style.setProperty(key, value, op.priorities[key]); }
    else if (op.x || op.y) {
      const id = op.target.getAttribute(attribute)!;
      const edit: PageEdit = op.direction === "move" ? { kind: "move", node: id, x: op.x, y: op.y, baseTranslate: op.base } : { kind: "patch", node: id, styles: op.styles };
      record(edit, { kind: "patch", node: id, styles: Object.fromEntries(Object.keys(op.styles).map(key => [key, op.old[key]])), priorities: op.priorities });
    }
    repaint();
  }
  function endPointer() { finishGesture(); }
  function cancelPointer() { finishGesture(true); }
  function endMouse() { if (gesture && !gesture.pointer) finishGesture(); }
  function key(event: KeyboardEvent) {
    if (!enabled) return;
    if (event.key === "Escape" && gesture) { stop(event); finishGesture(true); return; }
    if (inside(event)) { if (input) { event.stopImmediatePropagation(); if (event.key === "Escape") { event.preventDefault(); finishText?.(true); } } return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { stop(event); command({ kind: event.shiftKey ? "redo" : "undo" }); return; }
    if (event.key === "Escape") { finishText?.(true); select(null); }
    if (!event.ctrlKey && !event.metaKey && !event.altKey) event.preventDefault();
    event.stopImmediatePropagation();
  }
  function command(value: EditorCommand) {
    if (!enabled) return;
    finishText?.(); finishGesture();
    if (value.kind === "undo" || value.kind === "redo") {
      const from = value.kind === "undo" ? undo : redo, to = value.kind === "undo" ? redo : undo;
      const item = from.at(-1); if (!item) return;
      const edit = value.kind === "undo" ? item.inverse : item.edit;
      apply(edit); from.pop(); to.push(item); send(edit); repaint(); publish(); return;
    }
    if (value.kind === "editText") { if (valid(selected)) beginText(selected); return; }
    if (value.kind === "ratio") { byId(value.node); ratios.set(value.node, value.locked); publish(); return; }
    if (value.kind === "image") {
      const el = byId(value.node); if (el.tagName !== "IMG") return;
      const edits: PageEdit[] = [{ kind: "patch", node: value.node, attributes: { src: value.src, srcset: null, sizes: null } }];
      if (el.parentElement?.tagName === "PICTURE") for (const source of el.parentElement.querySelectorAll<HTMLElement>("source")) {
        if (valid(source)) edits.push({ kind: "patch", node: source.getAttribute(attribute)!, attributes: { srcset: null, sizes: null } });
      }
      commit({ kind: "batch", edits }); return;
    }
    commit(value);
  }
  const blocked = ["click", "submit", "contextmenu", "pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend"];
  blocked.forEach(name => window.addEventListener(name, intercept, true));
  window.addEventListener("dblclick", doubleClick, true); window.addEventListener("pointermove", hover, true);
  window.addEventListener("pointermove", drag, true); window.addEventListener("mousemove", drag, true);
  window.addEventListener("pointerup", endPointer, true); window.addEventListener("mouseup", endMouse, true); window.addEventListener("pointercancel", cancelPointer, true);
  window.addEventListener("keydown", key, true); window.addEventListener("scroll", repaint, true); window.addEventListener("resize", repaint);
  shadow.querySelectorAll<HTMLButtonElement>("button").forEach(handle => { handle.addEventListener("pointerdown", startGesture); handle.addEventListener("mousedown", startGesture); });
  host.__oguiEditor = {
    enable(value) { if (!value) { finishText?.(); finishGesture(); } enabled = value; root.style.display = value ? "block" : "none"; repaint(); publish(); },
    flush() { finishText?.(); finishGesture(); }, command,
    destroy() {
      finishText?.(true); finishGesture(true);
      blocked.forEach(name => window.removeEventListener(name, intercept, true));
      window.removeEventListener("dblclick", doubleClick, true); window.removeEventListener("pointermove", hover, true);
      window.removeEventListener("pointermove", drag, true); window.removeEventListener("mousemove", drag, true);
      window.removeEventListener("pointerup", endPointer, true); window.removeEventListener("mouseup", endMouse, true); window.removeEventListener("pointercancel", cancelPointer, true);
      window.removeEventListener("keydown", key, true); window.removeEventListener("scroll", repaint, true); window.removeEventListener("resize", repaint); selectionObserver?.disconnect(); root.remove();
    },
  };
}
