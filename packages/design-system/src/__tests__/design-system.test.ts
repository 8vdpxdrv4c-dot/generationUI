import { describe, it, expect } from "vitest";
import {
  THEME_CSS,
  SVG_CLASSES_CSS,
  FORM_STYLES_CSS,
  INITIAL_RENDER_STAGGER_CSS,
  FORM_STYLES_WITH_STAGGER_CSS,
  LAYOUT_CLASSES_CSS,
  IMPORTMAP,
  IMPORTMAP_SCRIPT_TAG,
  buildImportMapScriptTag,
  THREE_VERSION,
} from "../index.js";

// Built via join so the single-source guard test only matches real CSS definitions.
const TOKEN_DEFINITION = ["--color-background-primary", ":"].join("");

describe("THEME_CSS", () => {
  it("defines the design-system color tokens", () => {
    expect(THEME_CSS).toContain(TOKEN_DEFINITION);
  });

  it("includes dark-mode overrides", () => {
    expect(THEME_CSS).toContain("@media (prefers-color-scheme: dark)");
  });

  it("defines spacing and type scales", () => {
    expect(THEME_CSS).toContain("--space-1: 4px;");
    expect(THEME_CSS).toContain("--space-6: 32px;");
    expect(THEME_CSS).toContain("--text-xs: 11px;");
    expect(THEME_CSS).toContain("--text-3xl: 48px;");
  });
});

describe("LAYOUT_CLASSES_CSS", () => {
  it("provides the three semantic layout skeletons", () => {
    expect(LAYOUT_CLASSES_CSS).toContain(".layout-3col");
    expect(LAYOUT_CLASSES_CSS).toContain(".layout-sidebar");
    expect(LAYOUT_CLASSES_CSS).toContain(".layout-wing");
  });

  it("collapses to a single column on narrow screens", () => {
    expect(LAYOUT_CLASSES_CSS).toContain("@media (max-width: 720px)");
    expect(LAYOUT_CLASSES_CSS).toContain("grid-template-columns: 1fr;");
  });

  it("overlays wing panels on a full-bleed center", () => {
    expect(LAYOUT_CLASSES_CSS).toContain(".wing-center");
    expect(LAYOUT_CLASSES_CSS).toContain(".wing-panel.left");
    expect(LAYOUT_CLASSES_CSS).toContain(".wing-panel.right");
    expect(LAYOUT_CLASSES_CSS).toContain(".wing-center {\n  position: absolute;");
    expect(LAYOUT_CLASSES_CSS).toContain(".wing-panel {\n  position: absolute;");
  });

  it("provides a full-width wing header", () => {
    expect(LAYOUT_CLASSES_CSS).toContain(".wing-header");
    expect(LAYOUT_CLASSES_CSS).toContain("--wing-header-h: 64px;");
  });

  it("keeps left/right columns bare and full-height", () => {
    expect(LAYOUT_CLASSES_CSS).toContain(".layout-sidebar > * {");
    expect(LAYOUT_CLASSES_CSS).toContain("--wing-gutter: 0px;");
    expect(LAYOUT_CLASSES_CSS).toContain("--wing-panel-w: 280px;");
    expect(LAYOUT_CLASSES_CSS).toContain("bottom: var(--wing-gutter);");
    expect(LAYOUT_CLASSES_CSS).toContain("background: transparent;");
    expect(LAYOUT_CLASSES_CSS).toContain("border: 0;");
  });
});

describe("SVG_CLASSES_CSS", () => {
  it("includes the pre-built SVG color classes", () => {
    expect(SVG_CLASSES_CSS).toContain(".c-purple");
  });
});

describe("FORM_STYLES_CSS", () => {
  it("styles form elements", () => {
    expect(FORM_STYLES_CSS).toContain('input[type="text"],');
    expect(FORM_STYLES_CSS).toContain("button {");
  });

  it("does not include the initial-render stagger block", () => {
    expect(FORM_STYLES_CSS).not.toContain(".initial-render");
  });
});

describe("INITIAL_RENDER_STAGGER_CSS", () => {
  it("contains the initial-render stagger rules", () => {
    expect(INITIAL_RENDER_STAGGER_CSS).toContain(".initial-render");
  });
});

describe("FORM_STYLES_WITH_STAGGER_CSS", () => {
  it("contains the initial-render stagger rules", () => {
    expect(FORM_STYLES_WITH_STAGGER_CSS).toContain(".initial-render");
    expect(FORM_STYLES_WITH_STAGGER_CSS).toContain(INITIAL_RENDER_STAGGER_CSS);
  });
});

describe("IMPORTMAP", () => {
  it("maps every module to the local resource directory", () => {
    for (const pkg of ["gsap", "d3", "chart.js"]) {
      expect(IMPORTMAP.imports[pkg]).toMatch(/^\/resources\/libs\//);
    }
  });

  it("resolves Three.js core, addons and relative module dependencies from one release", () => {
    const root = `/resources/libs/three/${THREE_VERSION}/`;
    expect(IMPORTMAP.imports.three).toBe(`${root}build/three.module.js`);
    expect(new URL("./three.core.js", "https://app.example" + IMPORTMAP.imports.three).pathname)
      .toBe(`${root}build/three.core.js`);
    expect(IMPORTMAP.imports["three/addons/"] + "controls/OrbitControls.js")
      .toBe(`${root}examples/jsm/controls/OrbitControls.js`);
    expect(IMPORTMAP.imports["three/"]).toBe(root);
  });

  it("uses absolute local URLs in opaque iframes and exported documents without mutating defaults", () => {
    const tag = buildImportMapScriptTag("https://app.example/generation/test");
    const map = JSON.parse(tag.replace(/<\/?script[^>]*>/g, ""));
    for (const [key, value] of Object.entries(map.imports)) {
      if (key) {
        expect(value).toMatch(/^https:\/\/app\.example\/resources\/libs\//);
      }
    }
    expect(map.imports.gsap).toBe("https://app.example" + IMPORTMAP.imports.gsap);
    expect(IMPORTMAP.imports.three).toMatch(/^\/resources\//);
  });
});

describe("IMPORTMAP_SCRIPT_TAG", () => {
  it("is a script tag containing the import map", () => {
    expect(IMPORTMAP_SCRIPT_TAG.startsWith('<script type="importmap">')).toBe(true);
    expect(IMPORTMAP_SCRIPT_TAG.trimEnd().endsWith("</script>")).toBe(true);
    expect(IMPORTMAP_SCRIPT_TAG).toContain(IMPORTMAP.imports.three);
  });
});
