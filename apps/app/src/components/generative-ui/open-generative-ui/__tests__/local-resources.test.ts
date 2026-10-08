// @vitest-environment node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCAL_RESOURCES, localizeResourceReferences, buildImportMapScriptTag } from "@repo/design-system";
import { assembleStandaloneHtmlFromActivity, chartToStandaloneHtml } from "../../export-utils";

const root = resolve("public/resources");
describe("local browser resources", () => {
  it("delivers every catalog entry and verifies downloaded content against its manifest", () => {
    const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
    for (const [path, info] of Object.entries(manifest) as [string, { sha256: string }][]) {
      expect(createHash("sha256").update(readFileSync(join(root, path))).digest("hex"), path).toBe(info.sha256);
    }
    for (const path of Object.values(LOCAL_RESOURCES)) expect(existsSync(resolve("public" + path)), path).toBe(true);
  });

  it("keeps transitive ESM imports and font URLs local and complete", () => {
    const walk = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? walk(path) : [path];
    });
    for (const path of walk(root).filter(path => /\.(mjs|css)$/.test(path))) {
      const source = readFileSync(path, "utf8");
      const pattern = path.endsWith(".css") ? /url\(([^)]+)\)/g : /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["']((?:\.\.?\/|https?:\/\/)[^"']+)["']/g;
      for (const match of source.matchAll(pattern)) {
        expect(match[1], path).toMatch(/^\.\.?\//);
        expect(existsSync(resolve(dirname(path), match[1])), `${path}: ${match[1]}`).toBe(true);
      }
    }
  });

  it("rewrites historical CDN modules, scripts and fonts while preserving API and link URLs", () => {
    const source = `import('https://esm.sh/mermaid@11/dist/mermaid.esm.min.mjs');
      <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap">
      fetch('https://api.example/weather'); <a href="https://docs.example">文档</a>`;
    const result = localizeResourceReferences(source, "https://app.example");
    for (const path of [LOCAL_RESOURCES.mermaid, LOCAL_RESOURCES.chartScript, LOCAL_RESOURCES.font]) expect(result).toContain("https://app.example" + path);
    expect(result).toContain("https://api.example/weather");
    expect(result).toContain("https://docs.example");
    expect(result).not.toMatch(/esm\.sh|jsdelivr|googleapis/);
    expect(localizeResourceReferences(result, "https://app.example")).toBe(result);
  });

  it("uses local absolute paths for opaque frames and both HTML export paths", () => {
    expect(buildImportMapScriptTag("https://app.example")).not.toMatch(/esm\.sh|jsdelivr|unpkg|cdnjs/);
    const doc = assembleStandaloneHtmlFromActivity({ html: ["<script type='module'>import('https://esm.sh/d3')</script>"] }, "图表", "https://app.example");
    expect(doc).toContain("https://app.example" + LOCAL_RESOURCES.d3);
    expect(chartToStandaloneHtml("bar", { title: "图表", description: "", data: [] }, "https://app.example")).toContain("https://app.example" + LOCAL_RESOURCES.chartScript);
  });
});
