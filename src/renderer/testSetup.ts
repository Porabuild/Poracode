import "@testing-library/jest-dom/vitest";
// Side-effect import: loads + activates the source ("en") catalog so Lingui
// macros resolve in tests. Components rendered under test still need to be
// wrapped in an I18nProvider — use `renderWithI18n` from ./testUtils/i18n.
import "@/renderer/i18n/i18n";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: query.includes("dark"),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}
