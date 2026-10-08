/**
 * Recover separated page source from an assembled standalone document.
 *
 * `assembleStandaloneHtmlFromActivity` is deterministic, so its output can be
 * inverted exactly: the head holds the design-system CSS bundle followed by the
 * generated CSS, and the body holds the markup followed by one generated
 * script (jsFunctions at top level, then the jsExpressions in an async IIFE).
 *
 * Used to migrate records saved before the store moved to source-shaped
 * versions, and for component types that only ever produced a standalone page
 * (the chart renderers).
 */

import type { DesignSource } from "./index";

/** Only documents produced by our own assembler carry this stub. */
const STUB_MARK = "window.Websandbox = { connection:";
const IIFE_OPEN = "(async () => {";
const IIFE_CLOSE = "})();";

function unescapeScriptClose(js: string): string {
  return js.replace(/<\\\/script/gi, "</script");
}

function unescapeStyleClose(css: string): string {
  return css.replace(/<\\\/style/gi, "</style");
}

/** Split the assembler's single generated script back into its two parts. */
export function splitGeneratedScript(inner: string): {
  jsFunctions: string;
  jsExpressions: string[];
} {
  const text = inner.trim();
  if (!text) return { jsFunctions: "", jsExpressions: [] };

  const open = text.lastIndexOf(IIFE_OPEN);
  const close = text.lastIndexOf(IIFE_CLOSE);
  if (open === -1 || close === -1 || close < open) {
    return { jsFunctions: unescapeScriptClose(text), jsExpressions: [] };
  }

  const jsExpressions = text
    .slice(open + IIFE_OPEN.length, close)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const awaited = line.match(/^await \(0, eval\)\((".*")\);$/) ??
        line.match(/^await \(new \(Object\.getPrototypeOf\(async function\(\)\{\}\)\.constructor\)\((".*")\)\)\(\);$/);
      if (awaited) {
        try { return unescapeScriptClose(JSON.parse(awaited[1]) as string); } catch { /* legacy source */ }
      }
      return unescapeScriptClose(line);
    });

  return {
    jsFunctions: unescapeScriptClose(text.slice(0, open).trim()),
    jsExpressions,
  };
}

/**
 * Best-effort recovery of separated source. Returns the source unchanged (as
 * an opaque standalone document) when the markup was not produced by our
 * assembler — a chart page, a hand-written file, or anything unrecognised.
 */
export function splitStandaloneSource(html: string): DesignSource {
  const fallback: DesignSource = { format: "standalone", html };
  if (!html.includes(STUB_MARK)) return fallback;

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (!bodyMatch) return fallback;

  let body = bodyMatch[1];
  let jsFunctions = "";
  let jsExpressions: string[] = [];

  // The generated script is the last <script> in the body.
  const bodyScript = body.match(/<script[^>]*>([\s\S]*?)<\/script>\s*$/i);
  if (bodyScript && typeof bodyScript.index === "number") {
    const split = splitGeneratedScript(bodyScript[1]);
    jsFunctions = split.jsFunctions;
    jsExpressions = split.jsExpressions;
    body = body.slice(0, bodyScript.index);
  }

  // Styles in head: the design-system bundle comes first, generated CSS last.
  const styles: string[] = [];
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let match: RegExpExecArray | null;
  while ((match = styleRe.exec(html)) !== null) styles.push(match[1]);
  if (styles.length === 0) return fallback;
  const css = unescapeStyleClose(styles[styles.length - 1]).trim();

  return {
    format: "sandboxed-ui",
    css,
    html: body.trim(),
    jsFunctions,
    jsExpressions,
  };
}
