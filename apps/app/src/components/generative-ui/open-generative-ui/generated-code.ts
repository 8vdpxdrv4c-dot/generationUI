/**
 * Small, deterministic guard for model-produced classic JavaScript.
 *
 * Models occasionally concatenate a design-token placeholder onto a hex
 * literal (for example: 0x061customPlaceholder). That is invalid JavaScript
 * and prevents the whole sandbox from starting. Repair only this known shape;
 * never rewrite arbitrary generated code.
 */
const MALFORMED_HEX_PLACEHOLDER =
  /\b0x([0-9a-f]{0,6})(?:customplaceholder|colorplaceholder|placeholder)\b/gi;

function completeHexColor(prefix: string): string {
  // Preserve any valid prefix and use the project's cold-blue fallback for
  // the missing digits. The result is always exactly six hexadecimal digits.
  return (prefix + "a2f").slice(0, 6).padEnd(6, "0");
}

export function repairGeneratedJavaScript(source: string): string {
  return source.replace(MALFORMED_HEX_PLACEHOLDER, (_match, prefix: string) =>
    `0x${completeHexColor(prefix)}`,
  );
}

export function getJavaScriptSyntaxError(source: string): Error | null {
  try {
    // Parse only. Function does not execute the generated code.
    // eslint-disable-next-line no-new-func
    new Function(source);
    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}
