import type { OpenGenUIContent } from "./schema";

export function completedContentError(content: OpenGenUIContent): string | null {
  if (content.error) return content.error;
  if (content.generating !== false || !content.htmlComplete) return null;
  const html = (content.html ?? []).join("");
  const interactive = /<(button|input|select|canvas)\b/i.test(html);
  if (interactive && !content.jsFunctions?.trim() && !/<script\b/i.test(html))
    return "页面生成不完整，交互代码缺失，请重新生成。";
  if (content.jsFunctions?.trim() && !content.jsExpressions?.length)
    return "页面生成不完整，初始化调用缺失，请重新生成。";
  return null;
}
