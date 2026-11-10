// The main typecheck never runs browser-mode tests. `vitest/browser` references
// the installed provider's context types, and their matcher augmentation
// shadows jest-dom's `toHaveTextContent(RegExp)` overload that the jsdom suites
// rely on, so tsconfig.json maps `@vitest/browser-playwright/context` here.
// Browser-mode tests (`*.chromium.test.tsx`) run under vitest.browser.config.ts,
// where Vite resolves the real module.
export {};
