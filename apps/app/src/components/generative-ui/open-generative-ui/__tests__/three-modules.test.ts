// @vitest-environment node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildImportMapScriptTag, THREE_VERSION } from "@repo/design-system";
import { buildFinalFrameContent } from "../frame-content";

describe("local Three.js delivery", () => {
  it("publishes the installed core, its relative dependency and OrbitControls at importmap URLs", () => {
    execFileSync(process.execPath, ["scripts/prepare-three-modules.mjs"]);
    const app = JSON.parse(readFileSync("package.json", "utf8"));
    expect(app.dependencies.three).toBe(THREE_VERSION);
    const tag = buildImportMapScriptTag("https://app.example");
    const { imports } = JSON.parse(tag.replace(/<\/?script[^>]*>/g, ""));
    const readModule = (url: string) => readFileSync(
      fileURLToPath(new URL(`../../../../../public${new URL(url).pathname}`, import.meta.url)),
      "utf8",
    );
    const core = readModule(imports.three);
    expect(core).toContain("./three.core.js");
    expect(readModule(new URL("./three.core.js", imports.three).href)).toContain("class Vector3");
    expect(readModule(imports["three/addons/"] + "controls/OrbitControls.js")).toContain("from 'three'");
  });

  it("permits local module scripts in the opaque sandbox while retaining the origin allowlist", () => {
    const frame = buildFinalFrameContent("<div>model</div>", "", "https://app.example");
    expect(frame).toContain("script-src https://app.example 'unsafe-inline'");
    expect(frame).toContain("https://app.example/resources/libs/three/");
    expect(frame).not.toContain("https://esm.sh/three");
    expect(frame).not.toMatch(/script-src[^;]*\*/);
  });
});
