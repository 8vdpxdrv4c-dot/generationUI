import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  // Component tests only need CSS-module class names; Next's PostCSS plugin
  // string configuration is not compatible with Vite's plugin loader.
  css: { postcss: { plugins: [] } },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    server: { deps: { inline: [/@copilotkit\/react-core/] } },
  },
});
