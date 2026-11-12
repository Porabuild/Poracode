import { resolve } from "node:path";
import { lingui } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

/**
 * Real-browser tests (`*.chromium.test.tsx`) for layout-dependent renderer
 * behavior - scroll anchoring, virtualization and measurement - which jsdom
 * cannot exercise because it has no layout engine. (`*.browser.test.*` is
 * already used by ordinary jsdom/node suites.) Run with `bun run test:browser`
 * (needs `playwright install chromium` once).
 */
export default defineConfig({
  plugins: [babel({ plugins: ["@lingui/babel-plugin-lingui-macro"] }), lingui()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
      "~file-icons": resolve(import.meta.dirname, "node_modules/material-icon-theme/icons"),
    },
  },
  // Pre-bundle up front: a dependency discovered mid-run makes Vite reload the
  // page and drop the test connection.
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react-aria-components",
      "@legendapp/list/react",
      "@testing-library/react",
    ],
  },
  test: {
    include: ["src/renderer/**/*.chromium.test.tsx"],
    testTimeout: 15_000,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
});
