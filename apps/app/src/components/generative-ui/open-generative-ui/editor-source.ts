/** Source-only edits. Never serialize the live sandbox or execute its scripts. */
export const EDIT_NODE_ATTRIBUTE = "data-ogui-edit-node";
export const PROTECTED_SELECTOR = "html,body,head,script,style,meta,link,title,base,noscript,template";

export type PageEdit =
  | { kind: "move"; node: string; x: number; y: number; baseTranslate: string }
  | { kind: "text"; node: string; index: number; anchor?: number; before: string; value: string }
  | { kind: "patch"; node: string; styles?: Record<string, string | null>; priorities?: Record<string, string>; attributes?: Record<string, string | null> }
  | { kind: "batch"; edits: PageEdit[] };

export const EDITABLE_STYLES = ["width", "height", "box-sizing", "translate", "font-size", "font-weight", "font-style", "text-align", "color", "background-color", "border-width", "border-style", "border-color", "border-radius"];

export type EditorKind = "text" | "image" | "button" | "container" | "scene";
export interface EditorSelection {
  node: string;
  tag: string;
  kind: EditorKind;
  resizable: boolean;
  width: number;
  height: number;
  lockRatio: boolean;
  styles: Record<string, string>;
}
export interface EditorSnapshot {
  selection: EditorSelection | null;
  canUndo: boolean;
  canRedo: boolean;
}
export type EditorCommand = PageEdit | { kind: "undo" } | { kind: "redo" } | { kind: "editText" } | { kind: "ratio"; node: string; locked: boolean } | { kind: "image"; node: string; src: string };

export function isEditorSnapshot(value: unknown): value is EditorSnapshot {
  if (!value || typeof value !== "object") return false;
  const item = value as EditorSnapshot;
  if (typeof item.canUndo !== "boolean" || typeof item.canRedo !== "boolean") return false;
  const node = item.selection;
  return node === null || (!!node && typeof node.node === "string" && /^\d{1,6}$/.test(node.node) && typeof node.tag === "string" &&
    ["text", "image", "button", "container", "scene"].includes(node.kind) &&
    typeof node.resizable === "boolean" && typeof node.lockRatio === "boolean" &&
    Number.isFinite(node.width) && Number.isFinite(node.height) && !!node.styles && typeof node.styles === "object" &&
    Object.values(node.styles).every(style => typeof style === "string"));
}

export interface EditorNode {
  id: string;
  texts: { index: number; anchor: number; value: string }[];
}

function parse(html: string) {
  const document = new DOMParser().parseFromString(html, "text/html");
  const elements = [...document.body.querySelectorAll<HTMLElement>("*")].filter(element =>
    element.namespaceURI === "http://www.w3.org/1999/xhtml" &&
    !element.matches(PROTECTED_SELECTOR) && !element.closest("script,style,template,noscript,svg,[data-ogui-editor]") &&
    !element.parentElement?.closest("canvas"));
  return { document, elements };
}

function serialize(document: Document, original: string) {
  document.querySelectorAll(`[${EDIT_NODE_ATTRIBUTE}]`).forEach(element => element.removeAttribute(EDIT_NODE_ATTRIBUTE));
  if (/<html[\s>]|<!doctype/i.test(original)) return `<!DOCTYPE html>\n${document.documentElement.outerHTML}`;
  return document.head.innerHTML + document.body.innerHTML;
}

export function prepareEditableHtml(html: string): { html: string; nodes: EditorNode[] } {
  const { document, elements } = parse(html);
  const nodes = elements.map((element, index) => {
    const id = String(index);
    element.setAttribute(EDIT_NODE_ATTRIBUTE, id);
    let anchor = 0;
    const texts = [...element.childNodes].flatMap((child, index) => {
      if (child.nodeType !== 3) { anchor++; return []; }
      return child.textContent?.trim() ? [{ index, anchor, value: child.textContent }] : [];
    });
    return { id, texts };
  });
  // Annotation is runtime-only; source edits use the same deterministic traversal.
  const annotated = /<html[\s>]|<!doctype/i.test(html)
    ? `<!DOCTYPE html>\n${document.documentElement.outerHTML}`
    : document.head.innerHTML + document.body.innerHTML;
  return { html: annotated, nodes };
}

export function translatedPosition(base: string, x: number, y: number): string {
  const parts = (!base || base === "none" ? "0px 0px" : base).trim().split(/\s+(?![^()]*\))/);
  return `calc(${parts[0]} + ${x}px) calc(${parts[1] ?? "0px"} + ${y}px)${parts[2] ? ` ${parts[2]}` : ""}`;
}

export function applyPageEdit(html: string, edit: PageEdit, depth = 0): string {
  if (depth > 3) throw new Error("编辑操作层级过多");
  if (edit?.kind === "batch") {
    if (!Array.isArray(edit.edits) || edit.edits.length > 30) throw new Error("无效的批量修改");
    return edit.edits.reduce((source, item) => applyPageEdit(source, item, depth + 1), html);
  }
  if (!edit || !/^\d{1,6}$/.test(edit.node)) throw new Error("无法定位源代码中的元素");
  const { document, elements } = parse(html);
  const element = elements[Number(edit.node)];
  if (!element) throw new Error("该元素不属于可编辑源码");
  if (edit.kind === "patch") {
    for (const [property, value] of Object.entries(edit.styles ?? {})) {
      if (!EDITABLE_STYLES.includes(property) || (value !== null && (typeof value !== "string" || value.length > 250 || /[;{}<>]/.test(value)))) throw new Error("不支持的样式修改");
      if (value === null) element.style.removeProperty(property);
      else {
        const probe = document.createElement("div"); probe.style.setProperty(property, value);
        if (!probe.style.getPropertyValue(property)) throw new Error("无效的样式值");
        const priority = edit.priorities?.[property] ?? "important";
        if (priority !== "" && priority !== "important") throw new Error("无效的样式优先级");
        element.style.setProperty(property, value, priority);
      }
    }
    for (const [property, value] of Object.entries(edit.attributes ?? {})) {
      const allowed = element.tagName === "IMG" ? ["src", "srcset", "sizes"] : element.tagName === "SOURCE" && element.parentElement?.tagName === "PICTURE" ? ["srcset", "sizes"] : [];
      if (!allowed.includes(property) || (value !== null && (typeof value !== "string" || value.length > 20_000 || /javascript\s*:|data\s*:text\//i.test(value)))) throw new Error("不支持的图片属性");
      if (value === null) element.removeAttribute(property); else element.setAttribute(property, value);
    }
  } else if (edit.kind === "move") {
    if (![edit.x, edit.y].every(value => Number.isFinite(value) && Math.abs(value) <= 100_000) ||
        typeof edit.baseTranslate !== "string" || edit.baseTranslate.length > 250 || /[;{}<>]/.test(edit.baseTranslate)) {
      throw new Error("无效的移动位置");
    }
    element.style.setProperty("translate", translatedPosition(edit.baseTranslate, edit.x, edit.y), "important");
  } else if (edit.kind === "text") {
    let node = element.childNodes[edit.index] as ChildNode | undefined;
    if (edit.anchor !== undefined) {
      if (!Number.isInteger(edit.anchor) || edit.anchor < 0) throw new Error("无效的文字位置");
      // Empty text nodes disappear when HTML is serialized. Anchor to unchanged
      // element/comment siblings so clearing one text does not shift another.
      const boundaries = [...element.childNodes].filter(child => child.nodeType !== 3);
      if (edit.anchor > boundaries.length) throw new Error("文字结构已变化");
      const previous = edit.anchor ? boundaries[edit.anchor - 1] : undefined;
      const candidate = previous ? previous.nextSibling : element.firstChild;
      node = candidate?.nodeType === 3 ? candidate : undefined;
      if (!node && edit.before === "") {
        node = document.createTextNode("");
        element.insertBefore(node, boundaries[edit.anchor] ?? null);
      }
    }
    if (!Number.isInteger(edit.index) || !node || node.nodeType !== 3 || node.textContent !== edit.before ||
        typeof edit.value !== "string" || edit.value.length > 20_000) throw new Error("文字已变化，请重新选择");
    node.textContent = edit.value;
  } else throw new Error("不支持的编辑操作");
  return serialize(document, html);
}
