/** Pinned browser assets served from the application's public/resources. */
export const LOCAL_RESOURCES = {
  font: "/resources/fonts/plus-jakarta-sans/font.css",
  gsap: "/resources/libs/gsap/3.15.0/index.js",
  gsapRoot: "/resources/libs/gsap/3.15.0/",
  gsapScript: "/resources/libs/gsap/3.15.0/dist/gsap.min.js",
  d3: "/resources/libs/d3/7.9.0/module.mjs",
  d3Script: "/resources/libs/d3/7.9.0/dist/d3.min.js",
  chart: "/resources/libs/chart.js/4.5.1/module.mjs",
  chartAuto: "/resources/libs/chart.js/4.5.1/auto.mjs",
  chartScript: "/resources/libs/chart.js/4.5.1/dist/chart.umd.js",
  mermaid: "/resources/libs/mermaid/11.12.2/dist/mermaid.esm.min.mjs",
  mermaidScript: "/resources/libs/mermaid/11.12.2/dist/mermaid.min.js",
  tone: "/resources/libs/tone/14.8.49/build/Tone.js",
} as const;

export function resourceUrl(path: string, origin?: string): string {
  return origin ? new URL(path, new URL(origin).origin).href : path;
}

/** Upgrade known CDN references in saved/generated source without rewriting data APIs. */
export function localizeResourceReferences(source: string, origin?: string): string {
  const replaced = source.replace(/https?:\/\/(?:esm\.sh|cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\/[^\s"'<>`\\)]+/g, (url) => {
    const parsed = new URL(url);
    const path = parsed.pathname;
    const esm = parsed.hostname === "esm.sh";
    const packagePath = path.replace(/^\/npm\//, "/");
    let local: string | undefined;
    if (parsed.hostname === "fonts.googleapis.com" && /Plus(?:\+|%20| )Jakarta(?:\+|%20| )Sans/i.test(parsed.search)) local = LOCAL_RESOURCES.font;
    else if (/^\/three(?:@[^/]+)?\//.test(packagePath)) {
      const suffix = packagePath.replace(/^\/three(?:@[^/]+)?\//, "");
      local = `/resources/libs/three/0.186.1/${suffix}`;
    } else if (/^\/gsap(?:@[^/]+)?(?:\/|$)/.test(packagePath) || /^\/ajax\/libs\/gsap\//.test(path)) {
      const suffix = packagePath.replace(/^\/gsap(?:@[^/]+)?\/?/, "");
      local = !suffix ? (esm ? LOCAL_RESOURCES.gsap : LOCAL_RESOURCES.gsapScript) : /(?:^|\/)gsap(?:\.min)?\.js$/.test(path) || path.startsWith("/ajax/") ? LOCAL_RESOURCES.gsapScript : LOCAL_RESOURCES.gsapRoot + suffix;
    } else if (/^\/d3(?:@[^/]+)?(?:\/|$)/.test(packagePath) || /^\/ajax\/libs\/d3\//.test(path)) local = esm ? LOCAL_RESOURCES.d3 : LOCAL_RESOURCES.d3Script;
    else if (/^\/chart\.js(?:@[^/]+)?(?:\/|$)/.test(packagePath) || /^\/ajax\/libs\/Chart\.js\//i.test(path)) local = esm ? (/\/auto(?:\/|$)/.test(path) ? LOCAL_RESOURCES.chartAuto : LOCAL_RESOURCES.chart) : LOCAL_RESOURCES.chartScript;
    else if (/^\/mermaid(?:@[^/]+)?(?:\/|$)/.test(packagePath) || /^\/ajax\/libs\/mermaid\//.test(path)) local = esm || /\.mjs$/.test(path) ? LOCAL_RESOURCES.mermaid : LOCAL_RESOURCES.mermaidScript;
    else if (/^\/tone(?:@[^/]+)?(?:\/|$)/i.test(packagePath) || /^\/ajax\/libs\/tone\//i.test(path)) local = LOCAL_RESOURCES.tone;
    return local ? resourceUrl(local, origin) : url;
  });
  // Opaque iframe documents cannot resolve root-relative local assets themselves.
  // Include old local Three.js URLs so saved exports move to the same directory.
  return replaced.replace(/(?:https?:\/\/[^\s"'<>`\\)]+)?\/vendor\/three\/(?:\d+\.\d+\.\d+)\//g, resourceUrl("/resources/libs/three/0.186.1/", origin))
    .replace(/(?<![\w:/])\/resources\/[^\s"'<>`\\)]+/g, path => resourceUrl(path, origin));
}
