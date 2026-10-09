import { EDIT_NODE_ATTRIBUTE, EDITABLE_STYLES, type EditorNode } from "./editor-source";
import { installPageEditor } from "./editor-engine";
export { installPageEditor } from "./editor-engine";

export function editorRuntimeScript(nodes: EditorNode[], channel: string): string {
  const encode = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");
  return `(${installPageEditor.toString()})(${encode(nodes)},${encode(EDITABLE_STYLES)},${encode(channel)},${encode(EDIT_NODE_ATTRIBUTE)});`;
}
