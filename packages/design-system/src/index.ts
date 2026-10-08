// OpenGenerativeUI design system: theme tokens, SVG classes, form styles,
// and the CDN import map shared by the Next.js app.

// ─── Theme Variables ─────────────────────────────────────────────────
export const THEME_CSS = `
:root {
  --color-background-primary: #ffffff;
  --color-background-secondary: #f3f6f7;
  --color-background-tertiary: #e9ebef;
  --color-background-info: #E6F1FB;
  --color-background-danger: #FCEBEB;
  --color-background-success: #EAF3DE;
  --color-background-warning: #FAEEDA;

  --color-text-primary: #1a1a1a;
  --color-text-secondary: #73726c;
  --color-text-tertiary: #9c9a92;
  --color-text-info: #185FA5;
  --color-text-danger: #A32D2D;
  --color-text-success: #3B6D11;
  --color-text-warning: #854F0B;

  --color-border-primary: rgba(0, 0, 0, 0.3);
  --color-border-secondary: rgba(0, 0, 0, 0.2);
  --color-border-tertiary: rgba(0, 0, 0, 0.15);
  --color-border-info: #185FA5;
  --color-border-danger: #A32D2D;
  --color-border-success: #3B6D11;
  --color-border-warning: #854F0B;

  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-serif: Georgia, "Times New Roman", serif;
  --font-mono: "SF Mono", "Fira Code", "Fira Mono", monospace;

  --border-radius-md: 8px;
  --border-radius-lg: 12px;
  --border-radius-xl: 16px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;

  --text-xs: 11px;
  --text-sm: 12px;
  --text-base: 14px;
  --text-md: 16px;
  --text-lg: 18px;
  --text-xl: 24px;
  --text-2xl: 36px;
  --text-3xl: 48px;

  --p: var(--color-text-primary);
  --s: var(--color-text-secondary);
  --t: var(--color-text-tertiary);
  --bg2: var(--color-background-secondary);
  --b: var(--color-border-tertiary);
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-background-primary: #1a1a18;
    --color-background-secondary: #2c2c2a;
    --color-background-tertiary: #222220;
    --color-background-info: #0C447C;
    --color-background-danger: #501313;
    --color-background-success: #173404;
    --color-background-warning: #412402;

    --color-text-primary: #e8e6de;
    --color-text-secondary: #9c9a92;
    --color-text-tertiary: #73726c;
    --color-text-info: #85B7EB;
    --color-text-danger: #F09595;
    --color-text-success: #97C459;
    --color-text-warning: #EF9F27;

    --color-border-primary: rgba(255, 255, 255, 0.4);
    --color-border-secondary: rgba(255, 255, 255, 0.3);
    --color-border-tertiary: rgba(255, 255, 255, 0.15);
    --color-border-info: #85B7EB;
    --color-border-danger: #F09595;
    --color-border-success: #97C459;
    --color-border-warning: #EF9F27;
  }
}
`;

// ─── SVG Pre-Built Classes ───────────────────────────────────────────
export const SVG_CLASSES_CSS = `
svg text.t   { font: 400 14px var(--font-sans); fill: var(--p); }
svg text.ts  { font: 400 12px var(--font-sans); fill: var(--s); }
svg text.th  { font: 500 14px var(--font-sans); fill: var(--p); }

svg .box > rect, svg .box > circle, svg .box > ellipse { fill: var(--bg2); stroke: var(--b); }
svg .node { cursor: pointer; }
svg .node:hover { opacity: 0.8; }
svg .arr { stroke: var(--s); stroke-width: 1.5; fill: none; }
svg .leader { stroke: var(--t); stroke-width: 0.5; stroke-dasharray: 4 4; fill: none; }

/* Purple */
svg .c-purple > rect, svg .c-purple > circle, svg .c-purple > ellipse,
svg rect.c-purple, svg circle.c-purple, svg ellipse.c-purple { fill: #EEEDFE; stroke: #534AB7; }
svg .c-purple text.th, svg .c-purple text.t { fill: #3C3489; }
svg .c-purple text.ts { fill: #534AB7; }

/* Teal */
svg .c-teal > rect, svg .c-teal > circle, svg .c-teal > ellipse,
svg rect.c-teal, svg circle.c-teal, svg ellipse.c-teal { fill: #E1F5EE; stroke: #0F6E56; }
svg .c-teal text.th, svg .c-teal text.t { fill: #085041; }
svg .c-teal text.ts { fill: #0F6E56; }

/* Coral */
svg .c-coral > rect, svg .c-coral > circle, svg .c-coral > ellipse,
svg rect.c-coral, svg circle.c-coral, svg ellipse.c-coral { fill: #FAECE7; stroke: #993C1D; }
svg .c-coral text.th, svg .c-coral text.t { fill: #712B13; }
svg .c-coral text.ts { fill: #993C1D; }

/* Pink */
svg .c-pink > rect, svg .c-pink > circle, svg .c-pink > ellipse,
svg rect.c-pink, svg circle.c-pink, svg ellipse.c-pink { fill: #FBEAF0; stroke: #993556; }
svg .c-pink text.th, svg .c-pink text.t { fill: #72243E; }
svg .c-pink text.ts { fill: #993556; }

/* Gray */
svg .c-gray > rect, svg .c-gray > circle, svg .c-gray > ellipse,
svg rect.c-gray, svg circle.c-gray, svg ellipse.c-gray { fill: #F1EFE8; stroke: #5F5E5A; }
svg .c-gray text.th, svg .c-gray text.t { fill: #444441; }
svg .c-gray text.ts { fill: #5F5E5A; }

/* Blue */
svg .c-blue > rect, svg .c-blue > circle, svg .c-blue > ellipse,
svg rect.c-blue, svg circle.c-blue, svg ellipse.c-blue { fill: #E6F1FB; stroke: #185FA5; }
svg .c-blue text.th, svg .c-blue text.t { fill: #0C447C; }
svg .c-blue text.ts { fill: #185FA5; }

/* Green */
svg .c-green > rect, svg .c-green > circle, svg .c-green > ellipse,
svg rect.c-green, svg circle.c-green, svg ellipse.c-green { fill: #EAF3DE; stroke: #3B6D11; }
svg .c-green text.th, svg .c-green text.t { fill: #27500A; }
svg .c-green text.ts { fill: #3B6D11; }

/* Amber */
svg .c-amber > rect, svg .c-amber > circle, svg .c-amber > ellipse,
svg rect.c-amber, svg circle.c-amber, svg ellipse.c-amber { fill: #FAEEDA; stroke: #854F0B; }
svg .c-amber text.th, svg .c-amber text.t { fill: #633806; }
svg .c-amber text.ts { fill: #854F0B; }

/* Red */
svg .c-red > rect, svg .c-red > circle, svg .c-red > ellipse,
svg rect.c-red, svg circle.c-red, svg ellipse.c-red { fill: #FCEBEB; stroke: #A32D2D; }
svg .c-red text.th, svg .c-red text.t { fill: #791F1F; }
svg .c-red text.ts { fill: #A32D2D; }

/* Dark mode overrides */
@media (prefers-color-scheme: dark) {
  svg text.t   { fill: #e8e6de; }
  svg text.ts  { fill: #9c9a92; }
  svg text.th  { fill: #e8e6de; }

  svg .c-purple > rect, svg .c-purple > circle, svg .c-purple > ellipse,
  svg rect.c-purple, svg circle.c-purple, svg ellipse.c-purple { fill: #3C3489; stroke: #AFA9EC; }
  svg .c-purple text.th, svg .c-purple text.t { fill: #CECBF6; }
  svg .c-purple text.ts { fill: #AFA9EC; }

  svg .c-teal > rect, svg .c-teal > circle, svg .c-teal > ellipse,
  svg rect.c-teal, svg circle.c-teal, svg ellipse.c-teal { fill: #085041; stroke: #5DCAA5; }
  svg .c-teal text.th, svg .c-teal text.t { fill: #9FE1CB; }
  svg .c-teal text.ts { fill: #5DCAA5; }

  svg .c-coral > rect, svg .c-coral > circle, svg .c-coral > ellipse,
  svg rect.c-coral, svg circle.c-coral, svg ellipse.c-coral { fill: #712B13; stroke: #F0997B; }
  svg .c-coral text.th, svg .c-coral text.t { fill: #F5C4B3; }
  svg .c-coral text.ts { fill: #F0997B; }

  svg .c-pink > rect, svg .c-pink > circle, svg .c-pink > ellipse,
  svg rect.c-pink, svg circle.c-pink, svg ellipse.c-pink { fill: #72243E; stroke: #ED93B1; }
  svg .c-pink text.th, svg .c-pink text.t { fill: #F4C0D1; }
  svg .c-pink text.ts { fill: #ED93B1; }

  svg .c-gray > rect, svg .c-gray > circle, svg .c-gray > ellipse,
  svg rect.c-gray, svg circle.c-gray, svg ellipse.c-gray { fill: #444441; stroke: #B4B2A9; }
  svg .c-gray text.th, svg .c-gray text.t { fill: #D3D1C7; }
  svg .c-gray text.ts { fill: #B4B2A9; }

  svg .c-blue > rect, svg .c-blue > circle, svg .c-blue > ellipse,
  svg rect.c-blue, svg circle.c-blue, svg ellipse.c-blue { fill: #0C447C; stroke: #85B7EB; }
  svg .c-blue text.th, svg .c-blue text.t { fill: #B5D4F4; }
  svg .c-blue text.ts { fill: #85B7EB; }

  svg .c-green > rect, svg .c-green > circle, svg .c-green > ellipse,
  svg rect.c-green, svg circle.c-green, svg ellipse.c-green { fill: #27500A; stroke: #97C459; }
  svg .c-green text.th, svg .c-green text.t { fill: #C0DD97; }
  svg .c-green text.ts { fill: #97C459; }

  svg .c-amber > rect, svg .c-amber > circle, svg .c-amber > ellipse,
  svg rect.c-amber, svg circle.c-amber, svg ellipse.c-amber { fill: #633806; stroke: #EF9F27; }
  svg .c-amber text.th, svg .c-amber text.t { fill: #FAC775; }
  svg .c-amber text.ts { fill: #EF9F27; }

  svg .c-red > rect, svg .c-red > circle, svg .c-red > ellipse,
  svg rect.c-red, svg circle.c-red, svg ellipse.c-red { fill: #791F1F; stroke: #F09595; }
  svg .c-red text.th, svg .c-red text.t { fill: #F7C1C1; }
  svg .c-red text.ts { fill: #F09595; }
}
`;

// ─── Form Element Styles (base, no entrance stagger) ─────────────────
// Base variant for statically assembled documents, which animate via #content > *.
export const FORM_STYLES_CSS = `
* { box-sizing: border-box; margin: 0; }
html { background: transparent; }
body {
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 1.7;
  color: var(--color-text-primary);
  background: transparent;
  -webkit-font-smoothing: antialiased;
}
button {
  font-family: inherit;
  font-size: 14px;
  padding: 6px 16px;
  border: 0.5px solid var(--color-border-secondary);
  border-radius: var(--border-radius-md);
  background: transparent;
  color: var(--color-text-primary);
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
}
button:hover { background: var(--color-background-secondary); }
button:active { transform: scale(0.98); }
input[type="text"],
input[type="number"],
input[type="email"],
input[type="search"],
textarea,
select {
  font-family: inherit;
  font-size: 14px;
  padding: 6px 12px;
  height: 36px;
  border: 0.5px solid var(--color-border-tertiary);
  border-radius: var(--border-radius-md);
  background: var(--color-background-primary);
  color: var(--color-text-primary);
  transition: border-color 0.15s;
}
input:hover, textarea:hover, select:hover { border-color: var(--color-border-secondary); }
input:focus, textarea:focus, select:focus {
  outline: none;
  border-color: var(--color-border-primary);
  box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.06);
}
textarea { height: auto; min-height: 80px; resize: vertical; }
input::placeholder, textarea::placeholder { color: var(--color-text-tertiary); }
input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  background: var(--color-border-tertiary);
  border-radius: 2px;
  border: none;
  outline: none;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px; height: 18px;
  border-radius: 50%;
  background: var(--color-background-primary);
  border: 0.5px solid var(--color-border-secondary);
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
input[type="range"]::-moz-range-thumb {
  width: 18px; height: 18px;
  border-radius: 50%;
  background: var(--color-background-primary);
  border: 0.5px solid var(--color-border-secondary);
  cursor: pointer;
}
input[type="checkbox"], input[type="radio"] {
  width: 16px; height: 16px;
  accent-color: var(--color-text-info);
}
a { color: var(--color-text-info); text-decoration: none; }
a:hover { text-decoration: underline; }
#content > * {
  animation: fadeSlideIn 0.4s ease-out both;
}
#content > *:nth-child(1) { animation-delay: 0s; }
#content > *:nth-child(2) { animation-delay: 0.06s; }
#content > *:nth-child(3) { animation-delay: 0.12s; }
#content > *:nth-child(4) { animation-delay: 0.18s; }
#content > *:nth-child(5) { animation-delay: 0.24s; }
#content > *:nth-child(n+6) { animation-delay: 0.3s; }
@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
`;

// ─── Initial-Render Stagger (app-only addition) ──────────────────────
// The streaming widget renderer gates the entrance animation behind the
// .initial-render class and animates morphed-in nodes via .morph-enter.
export const INITIAL_RENDER_STAGGER_CSS = `/* First render: stagger all children */
#content.initial-render > * {
  animation: fadeSlideIn 0.4s ease-out both;
}
#content.initial-render > *:nth-child(1) { animation-delay: 0s; }
#content.initial-render > *:nth-child(2) { animation-delay: 0.06s; }
#content.initial-render > *:nth-child(3) { animation-delay: 0.12s; }
#content.initial-render > *:nth-child(4) { animation-delay: 0.18s; }
#content.initial-render > *:nth-child(5) { animation-delay: 0.24s; }
#content.initial-render > *:nth-child(n+6) { animation-delay: 0.3s; }

/* Subsequent morphs: only new elements animate in */
.morph-enter {
  animation: fadeSlideIn 0.4s ease-out both;
}`;

// ─── Form Element Styles + Initial-Render Stagger ────────────────────
export const FORM_STYLES_WITH_STAGGER_CSS = `
* { box-sizing: border-box; margin: 0; }

html { background: transparent; }

body {
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 1.7;
  color: var(--color-text-primary);
  background: transparent;
  -webkit-font-smoothing: antialiased;
}

button {
  font-family: inherit;
  font-size: 14px;
  padding: 6px 16px;
  border: 0.5px solid var(--color-border-secondary);
  border-radius: var(--border-radius-md);
  background: transparent;
  color: var(--color-text-primary);
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
}
button:hover { background: var(--color-background-secondary); }
button:active { transform: scale(0.98); }

input[type="text"],
input[type="number"],
input[type="email"],
input[type="search"],
textarea,
select {
  font-family: inherit;
  font-size: 14px;
  padding: 6px 12px;
  height: 36px;
  border: 0.5px solid var(--color-border-tertiary);
  border-radius: var(--border-radius-md);
  background: var(--color-background-primary);
  color: var(--color-text-primary);
  transition: border-color 0.15s;
}
input:hover, textarea:hover, select:hover { border-color: var(--color-border-secondary); }
input:focus, textarea:focus, select:focus {
  outline: none;
  border-color: var(--color-border-primary);
  box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.06);
}
textarea { height: auto; min-height: 80px; resize: vertical; }
input::placeholder, textarea::placeholder { color: var(--color-text-tertiary); }

input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  background: var(--color-border-tertiary);
  border-radius: 2px;
  border: none;
  outline: none;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px; height: 18px;
  border-radius: 50%;
  background: var(--color-background-primary);
  border: 0.5px solid var(--color-border-secondary);
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
input[type="range"]::-moz-range-thumb {
  width: 18px; height: 18px;
  border-radius: 50%;
  background: var(--color-background-primary);
  border: 0.5px solid var(--color-border-secondary);
  cursor: pointer;
}

input[type="checkbox"], input[type="radio"] {
  width: 16px; height: 16px;
  accent-color: var(--color-text-info);
}

a { color: var(--color-text-info); text-decoration: none; }
a:hover { text-decoration: underline; }

/* First render: stagger all children */
#content.initial-render > * {
  animation: fadeSlideIn 0.4s ease-out both;
}
#content.initial-render > *:nth-child(1) { animation-delay: 0s; }
#content.initial-render > *:nth-child(2) { animation-delay: 0.06s; }
#content.initial-render > *:nth-child(3) { animation-delay: 0.12s; }
#content.initial-render > *:nth-child(4) { animation-delay: 0.18s; }
#content.initial-render > *:nth-child(5) { animation-delay: 0.24s; }
#content.initial-render > *:nth-child(n+6) { animation-delay: 0.3s; }

/* Subsequent morphs: only new elements animate in */
.morph-enter {
  animation: fadeSlideIn 0.4s ease-out both;
}

@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
`;

// ─── Semantic Layout Classes ────────────────────────────────────────
// Named grid skeletons so generated UI uses a fixed vocabulary instead of
// hand-writing grid-template-columns (which the design skill cannot constrain).
export const LAYOUT_CLASSES_CSS = `
body:has(> [data-ui-kind="page"]) { margin: 0; }
[data-ui-kind="page"] {
  box-sizing: border-box;
  width: 100%;
  min-height: var(--ui-viewport-height, 100dvh);
  height: auto;
  max-height: none;
}
.layout-3col {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3, 12px);
}
.layout-sidebar {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: var(--space-4, 16px);
  align-items: stretch;
}
.layout-sidebar.flip {
  grid-template-columns: minmax(0, 1fr) 240px;
}
/* Left/right columns are bare, full-height containers by default: no padding
   and no background. Put padding/background on the cards placed inside them. */
.layout-sidebar > * {
  min-width: 0;
  height: 100%;
  align-self: stretch;
  padding: 0;
  background: none;
}
.layout-wing {
  --wing-header-h: 64px;
  --wing-gutter: 0px;
  --wing-panel-w: 280px;
  position: relative;
  width: 100%;
  min-height: var(--ui-viewport-height, 100dvh);
  overflow: hidden;
}
.wing-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: var(--wing-header-h);
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 var(--space-4, 16px);
  font-size: var(--text-lg, 18px);
  font-weight: 600;
  color: var(--color-text-primary);
  background: var(--color-background-secondary);
  border-bottom: 0.5px solid var(--color-border-tertiary);
}
.wing-center {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
/* Data panels floating over the full-bleed center. Bare by default: no
   padding, no background, no border, and they span all the height left below
   the header (100% of the remaining page height). Set --wing-gutter to inset
   them from the screen edges. */
.wing-panel {
  position: absolute;
  top: calc(var(--wing-header-h) + var(--wing-gutter));
  bottom: var(--wing-gutter);
  width: var(--wing-panel-w);
  z-index: 2;
  padding: 0;
  background: transparent;
  border: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.wing-panel.left {
  left: var(--wing-gutter);
}
.wing-panel.right {
  right: var(--wing-gutter);
}
@media (max-width: 720px) {
  .layout-3col,
  .layout-sidebar,
  .layout-sidebar.flip {
    grid-template-columns: 1fr;
  }
  .layout-wing {
    --wing-panel-w: 200px;
  }
}
`;

// ─── Open Generative UI Design Skill ─────────────────────────────────
// Injected as agent context for the generateSandboxedUi tool. Replaces the
// canonical default guidance, which contradicts this design system.
export const OPEN_GEN_UI_DESIGN_SKILL = `
The sandbox already includes the OpenGenerativeUI design system. Build on it instead of restyling from scratch.

Colors and theming:
- Use the CSS variables for every color: --color-background-primary / --color-background-secondary / --color-background-tertiary, --color-text-primary / --color-text-secondary / --color-text-tertiary, plus the semantic info/danger/success/warning variants (--color-background-info, --color-text-danger, --color-border-success, etc.).
- Dark mode is automatic via these variables — NEVER hardcode hex values for text or backgrounds.
- Fonts: --font-sans, --font-serif, --font-mono. Radii: --border-radius-md, --border-radius-lg, --border-radius-xl.
- Browser libraries and fonts load locally; never emit external CDN URLs. Use bare imports: three, three/addons/..., gsap, d3, chart.js, chart.js/auto, mermaid. Tone.js is /resources/libs/tone/14.8.49/build/Tone.js; Plus Jakarta Sans is /resources/fonts/plus-jakarta-sans/font.css. Other fonts should use system fallbacks.

Form controls:
- button, input (text/number/email/search/range/checkbox/radio), textarea, and select are pre-styled by the design system. Do not restyle these basics.

SVG diagrams and charts:
- Pre-built color-ramp classes: .c-purple .c-teal .c-coral .c-pink .c-gray .c-blue .c-green .c-amber .c-red.
- Diagram helpers: .box .node .arr .leader for shapes/connectors, and .t .ts .th for text (body/small/heading).

Layout and spacing:
- Mark the outermost generated UI element with data-ui-kind="page" for a complete page, or data-ui-kind="component" for a standalone small widget. Editing a component inside an existing page still produces a page: preserve data-ui-kind="page" on its root.
- Complete pages fill the available preview width and use min-height: var(--ui-viewport-height, 100dvh), height: auto, max-height: none. Content may grow without a height cap; use normal document flow and the outer browser scrollbar, not fixed-height nested scrolling containers. The host supplies --ui-viewport-height from the preview area; do not use iframe-relative 100vh/100% as page height or JS window.innerHeight, which changes as content grows.
- Small components keep their natural content height; never force them to fill the viewport. initialHeight is only a loading estimate, not a page-height constraint.
- Use the semantic layout classes instead of hand-writing grid-template-columns:
  - Three equal columns (metrics / comparison / card group) -> .layout-3col
  - Sidebar + main content (list + detail, doc navigation) -> .layout-sidebar (.flip for a right sidebar)
  - Big-screen "double-wing" dashboard -> .layout-wing: optional full-width title bar .wing-header at the top; put the full-bleed 3D canvas in .wing-center (it fills 100% width and height); the left/right data panels are .wing-panel.left / .wing-panel.right floating on top of the center (they start below the header and span 100% of the height left below it).
- Left/right columns and the wing panels are bare by default: no padding, no background, no border, full height. Never put padding or a background on the column or panel itself — put them on the cards inside it. .layout-wing takes --wing-gutter (inset from the screen edges, default 0px) and --wing-panel-w (panel width, default 280px), e.g. <div class="layout-wing" style="--wing-gutter:16px">.
- Gaps and margins only from the spacing scale (--space-1..6); font sizes only from the type scale (--text-xs..3xl).
- The css parameter should hold widget-specific styles only — the theme, form styles, layout classes, and SVG classes are already loaded.
`.trim();

import { LOCAL_RESOURCES, resourceUrl } from "./resources.js";
export { LOCAL_RESOURCES, resourceUrl, localizeResourceReferences } from "./resources.js";

// Core, addons and relative dependencies resolve to one local pinned release.
export const THREE_VERSION = "0.186.1";
const THREE_ROOT = `/resources/libs/three/${THREE_VERSION}/`;
export const IMPORTMAP = {
  imports: {
    "three": `${THREE_ROOT}build/three.module.js`,
    "three/": THREE_ROOT,
    "three/addons/": `${THREE_ROOT}examples/jsm/`,
    "three/webgpu": `${THREE_ROOT}build/three.webgpu.js`,
    "three/tsl": `${THREE_ROOT}build/three.tsl.js`,
    "gsap": LOCAL_RESOURCES.gsap,
    "gsap/": LOCAL_RESOURCES.gsapRoot,
    "d3": LOCAL_RESOURCES.d3,
    "chart.js": LOCAL_RESOURCES.chart,
    "chart.js/auto": LOCAL_RESOURCES.chartAuto,
    "mermaid": LOCAL_RESOURCES.mermaid,
  },
} as const satisfies { imports: Record<string, string> };

export function buildImportMapScriptTag(moduleOrigin?: string): string {
  const imports: Record<string, string> = { ...IMPORTMAP.imports };
  if (moduleOrigin) {
    for (const key of Object.keys(imports)) {
      imports[key] = resourceUrl(imports[key], moduleOrigin);
    }
  }
  return `<script type="importmap">
${JSON.stringify({ imports }, null, 2)
  .split("\n")
  .map((line) => "  " + line)
  .join("\n")}
  </script>`;
}

export const IMPORTMAP_SCRIPT_TAG = buildImportMapScriptTag();
