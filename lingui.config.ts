import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

// i18n is renderer-only: macros are expanded by Babel in the Vite pipeline,
// and the main process (tsdown) carries no catalogs. Adding a language is two
// steps: add its code to `locales` here (and to SUPPORTED_LOCALES in
// src/shared/locale.ts), then run `pnpm i18n:extract`.
export default defineConfig({
  sourceLocale: "en",
  locales: ["en", "es", "ru", "uk", "zh-CN", "ja", "pt-BR", "de", "fr", "ko", "pl", "vi", "tr"],
  catalogs: [
    {
      path: "src/renderer/locales/{locale}/messages",
      include: ["src/renderer"],
      exclude: ["**/*.test.*", "**/node_modules/**"],
    },
  ],
  format: formatter({ lineNumbers: false }),
});
