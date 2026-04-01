import { resolve } from "node:path";
import { defineConfig } from "vite";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";

const compilerPreset = reactCompilerPreset();
compilerPreset.rolldown = {
  ...(compilerPreset.rolldown ?? {}),
  filter: {
    ...(compilerPreset.rolldown?.filter ?? {}),
    id: {
      include: ["src/renderer/**/*.tsx"],
    },
  },
};

export default defineConfig({
  plugins: [react(), babel({ presets: [compilerPreset] })],
  base: "./",
  resolve: {
    tsconfigPaths: true,
    alias: {
      "~file-icons": resolve(__dirname, "node_modules/material-icon-theme/icons"),
    },
  },
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }

          if (id.includes("@xterm")) {
            return "xterm";
          }

          if (id.includes("@git-diff-view")) {
            return "git-diff";
          }

          if (
            id.includes("@heroui") ||
            id.includes("react-aria") ||
            id.includes("@react-stately") ||
            id.includes("@react-types") ||
            id.includes("tailwind-merge") ||
            id.includes("tailwind-variants")
          ) {
            return "ui";
          }

          if (
            id.includes("react") ||
            id.includes("scheduler") ||
            id.includes("zustand") ||
            id.includes("zod")
          ) {
            return "framework";
          }

          return "vendor";
        },
      },
    },
  },
  server: {
    forwardConsole: true,
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
});
