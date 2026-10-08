export type UISizingMode = "page" | "component";

// A generated page may size a canvas from its iframe viewport. Unbounded
// autosizing can feed that height back into an ever larger raster allocation.
export const MAX_PREVIEW_HEIGHT = 16000;

/** The HTML marker survives activity streaming, export and history saves. */
export function resolveSizingMode(html: string, inPagePreview: boolean): UISizingMode {
  const marker = html.match(/<[^!][^>]*\bdata-ui-kind\s*=\s*["'](page|component)["']/i);
  return marker ? marker[1].toLowerCase() as UISizingMode : inPagePreview ? "page" : "component";
}

export function validContentHeight(height: unknown, mode: UISizingMode): number | null {
  if (typeof height !== "number" || !Number.isFinite(height)) return null;
  return Math.max(50, Math.min(Math.ceil(height), mode === "page" ? MAX_PREVIEW_HEIGHT : 4000));
}

export function sizingConfiguration(mode: UISizingMode, viewportHeight: number): string {
  return `window.__oguiConfigureSizing?.(${JSON.stringify(mode)}, ${Math.max(0, Math.ceil(viewportHeight))});`;
}
