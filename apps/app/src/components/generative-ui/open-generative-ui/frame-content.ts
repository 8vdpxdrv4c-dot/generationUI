import {
  THEME_CSS,
  SVG_CLASSES_CSS,
  FORM_STYLES_WITH_STAGGER_CSS,
  LAYOUT_CLASSES_CSS,
  buildImportMapScriptTag,
  localizeResourceReferences,
} from "@repo/design-system";
import { MAX_PREVIEW_HEIGHT } from "./sizing";
import { SANDBOX_RUNTIME_JS } from "./sandbox-runtime";

export const RESIZE_MESSAGE_TYPE = "__ogui_resize";

export const PREVIEW_FRAME_CONTENT = `<!DOCTYPE html><head><script>${SANDBOX_RUNTIME_JS}</script></head><body></body>`;

const DESIGN_SYSTEM_CSS = `${THEME_CSS}\n${SVG_CLASSES_CSS}\n${FORM_STYLES_WITH_STAGGER_CSS}\n${LAYOUT_CLASSES_CSS}`;
const DESIGN_SYSTEM_STYLE_TAG = `<style>${DESIGN_SYSTEM_CSS}</style>`;
const OVERFLOW_HIDDEN_STYLE_TAG =
  "<style>html, body { overflow: hidden !important; }</style>";

// Browser libraries and fonts are local. Add the application origin explicitly
// because the sandbox iframe has an opaque origin.
export const CSP_META_TAG = `<meta http-equiv="Content-Security-Policy" content="
    default-src 'self';
    script-src 'unsafe-inline' 'unsafe-eval';
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob:;
    font-src 'self' data:;
    connect-src 'self';
  ">`;

export function ensureHead(html: string): string {
  if (/<head[\s>]/i.test(html)) return html;
  const root = html.match(/<html\b[^>]*>/i);
  if (root?.index !== undefined) {
    const end = root.index + root[0].length;
    return `${html.slice(0, end)}<head></head>${html.slice(end)}`;
  }
  const doctype = html.match(/^\s*<!doctype[^>]*>/i);
  if (doctype) return `${doctype[0]}<head></head>${html.slice(doctype[0].length)}`;
  return `<head></head>${html}`;
}

/**
 * Final sandbox document: CSP meta first, then importmap (must precede any
 * scripts so module resolution works), then design-system styles, then the
 * generated css, then the generated html. Head content is injected right
 * after the opening <head> tag so it precedes anything the generated document
 * put in its own head.
 */
export function buildFinalFrameContent(
  html: string,
  css?: string,
  assetOrigin?: string,
): string {
  const safeOrigin = assetOrigin ? new URL(assetOrigin).origin : null;
  html = localizeResourceReferences(html, safeOrigin ?? undefined);
  css = css ? localizeResourceReferences(css, safeOrigin ?? undefined) : css;
  const csp = safeOrigin
    ? CSP_META_TAG
        .replace("script-src 'unsafe-inline'", `script-src ${safeOrigin} 'unsafe-inline'`)
        .replace("img-src 'self'", `img-src 'self' ${safeOrigin}`)
        .replace("style-src 'self'", `style-src 'self' ${safeOrigin}`)
        .replace("font-src 'self'", `font-src 'self' ${safeOrigin}`)
        .replace("connect-src 'self'", `connect-src 'self' ${safeOrigin}`)
    : CSP_META_TAG;
  const headContent =
    csp +
    buildImportMapScriptTag(safeOrigin ?? undefined) +
    `<script>${SANDBOX_RUNTIME_JS}</script>` +
    DESIGN_SYSTEM_STYLE_TAG +
    (css ? `<style>${css}</style>` : "");
  // Standards mode keeps body.scrollHeight independent of the iframe viewport,
  // which is essential when a previously long page needs to shrink again.
  const documentHtml = /<!doctype\s+html/i.test(html) ? html : `<!DOCTYPE html>${html}`;
  const withHead = ensureHead(documentHtml);
  const openTag = withHead.match(/<head[^>]*>/i);
  if (!openTag || openTag.index === undefined) {
    return `<head>${headContent}</head>${withHead}`;
  }
  const insertAt = openTag.index + openTag[0].length;
  return withHead.slice(0, insertAt) + headContent + withHead.slice(insertAt);
}

/**
 * Preview sandbox head: design-system styles, the generated css param, and any
 * complete <style> tags already extracted from the partial html.
 */
export function buildPreviewHeadContent(
  css?: string,
  previewStyles?: string
): string {
  const parts = [OVERFLOW_HIDDEN_STYLE_TAG, DESIGN_SYSTEM_STYLE_TAG];
  if (css) parts.push(`<style>${css}</style>`);
  if (previewStyles) parts.push(previewStyles);
  return parts.join("");
}

/**
 * Preview body update: morph via Idiomorph (preserves existing nodes, no
 * flicker), falling back to a plain innerHTML assignment if Idiomorph is
 * unavailable or throws. New element nodes are tagged with morph-enter
 * (legacy bridge parity) so the design system's fadeSlideIn animation plays
 * as streamed content appears. (The #content.initial-render stagger rules in
 * FORM_STYLES_WITH_STAGGER_CSS apply only to documents that wrap content in
 * #content — i.e. statically assembled documents — and are inert here.)
 */
export function buildPreviewBodyMorph(body: string): string {
  return `(function() {
  var html = ${JSON.stringify(body)};
  if (typeof Idiomorph !== "undefined" && Idiomorph && Idiomorph.morph) {
    try {
      Idiomorph.morph(document.body, html, {
        morphStyle: 'innerHTML',
        callbacks: {
          beforeNodeAdded: function(node) {
            if (node.nodeType === 1) {
              node.classList.add('morph-enter');
              node.addEventListener('animationend', function() {
                node.classList.remove('morph-enter');
              }, { once: true });
            }
          }
        }
      });
    } catch (err) {
      document.body.innerHTML = html;
    }
  } else {
    document.body.innerHTML = html;
  }
})();`;
}

/**
 * Continuous autosize, forked from the legacy widget renderer bridge: a
 * ResizeObserver on document.body plus a window resize listener report the
 * content height to the parent on every change. Body height is forced to auto
 * so the reading can shrink below the current iframe viewport.
 */
export const MEASUREMENT_JS = `
(function() {
  if (window.__oguiResizeInstalled) return;
  window.__oguiResizeInstalled = true;
  var style = document.createElement('style');
  var mode = 'component';
  var viewportHeight = 0;
  var lastHeight = -1;
  window.__oguiConfigureSizing = function(nextMode, nextHeight) {
    mode = nextMode;
    viewportHeight = Math.max(0, Number(nextHeight) || 0);
    // Streaming head updates remove this style; reattach it after each update.
    document.head.appendChild(style);
    style.textContent = mode === 'page'
      ? ':root { --ui-viewport-height: ' + viewportHeight + 'px; } html { height: ' + viewportHeight + 'px !important; min-height: 0 !important; overflow: hidden !important; } body { display: flow-root; box-sizing: border-box; margin: 0 !important; height: auto !important; min-height: ' + viewportHeight + 'px !important; max-height: none !important; overflow: visible !important; } [data-ui-kind="page"] { box-sizing: border-box; height: auto !important; min-height: ' + viewportHeight + 'px !important; max-height: none !important; overflow-y: visible !important; }'
      : 'html, body { overflow: hidden !important; height: auto !important; min-height: 0 !important; }';
    reportHeight();
  };
  function reportHeight() {
    var h = Math.max(document.body.scrollHeight, document.body.getBoundingClientRect().height);
    var cs = getComputedStyle(document.body);
    h += parseFloat(cs.marginTop) || 0;
    h += parseFloat(cs.marginBottom) || 0;
    h = Math.min(${MAX_PREVIEW_HEIGHT}, Math.ceil(mode === 'page' ? Math.max(viewportHeight, h) : h));
    if (h !== lastHeight) {
      lastHeight = h;
      parent.postMessage({ type: '${RESIZE_MESSAGE_TYPE}', height: h }, '*');
    }
  }
  // Coalesce animated labels/canvas mutations instead of forcing layout for
  // every individual DOM change in a generated Three.js frame.
  var pendingFrame = 0;
  function scheduleReport() {
    if (pendingFrame) return;
    pendingFrame = requestAnimationFrame(function() {
      pendingFrame = 0;
      reportHeight();
    });
  }
  var ro = new ResizeObserver(scheduleReport);
  ro.observe(document.body);
  new MutationObserver(scheduleReport).observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
  window.addEventListener('resize', scheduleReport);
  window.addEventListener('load', scheduleReport);
  var interval = setInterval(reportHeight, 200);
  setTimeout(function() { clearInterval(interval); }, 3000);
  window.__oguiConfigureSizing('component', 0);
})();
`;
