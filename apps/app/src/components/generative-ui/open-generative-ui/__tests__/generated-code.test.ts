import { describe, expect, it } from "vitest";
import {
  getJavaScriptSyntaxError,
  repairGeneratedJavaScript,
} from "../generated-code";

describe("generated JavaScript guard", () => {
  it("repairs malformed hex color placeholders", () => {
    const source = "const color = 0x061customPlaceholder;";
    const repaired = repairGeneratedJavaScript(source);

    expect(repaired).toBe("const color = 0x061a2f;");
    expect(getJavaScriptSyntaxError(repaired)).toBeNull();
  });

  it("does not rewrite valid generated code", () => {
    const source = "function setup() { return 0x061a2f; }";

    expect(repairGeneratedJavaScript(source)).toBe(source);
    expect(getJavaScriptSyntaxError(source)).toBeNull();
  });

  it("detects syntax errors that are outside the known placeholder shape", () => {
    const error = getJavaScriptSyntaxError("const broken = ;");

    expect(error).toBeInstanceOf(Error);
  });
});
