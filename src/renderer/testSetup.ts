import "@testing-library/jest-dom/vitest";
// Side-effect import: loads + activates the source ("en") catalog so Lingui
// macros resolve in tests. Components rendered under test still need to be
// wrapped in an I18nProvider — use `renderWithI18n` from ./testUtils/i18n.
import "@/renderer/i18n/i18n";

// React Aria 3.53 calls the bare global `CSS.escape` when a Modal mounts
// (meta lookup in runAfterKeyboard). Vitest copies jsdom's CSS namespace
// onto the Node global, where jsdom's brand check rejects the call, so
// install the spec algorithm as a plain unbound-safe function.
if (typeof window !== "undefined") {
  const cssEscape = (value: string): string => {
    const string = String(value);
    let result = "";
    for (let i = 0; i < string.length; i++) {
      const char = string[i]!;
      const code = char.charCodeAt(0);
      if (code === 0x0000) {
        result += "\uFFFD";
      } else if ((code >= 0x0001 && code <= 0x001f) || code === 0x007f) {
        result += `\\${code.toString(16)} `;
      } else if (i === 0 && code >= 0x0030 && code <= 0x0039) {
        result += `\\${code.toString(16)} `;
      } else if (i === 0 && char === "-" && string.length === 1) {
        result += "\\-";
      } else if (i === 1 && code >= 0x0030 && code <= 0x0039 && string[0] === "-") {
        result += `\\${code.toString(16)} `;
      } else if (
        code >= 0x0080 ||
        char === "-" ||
        char === "_" ||
        (code >= 0x0030 && code <= 0x0039) ||
        (code >= 0x0041 && code <= 0x005a) ||
        (code >= 0x0061 && code <= 0x007a)
      ) {
        result += char;
      } else {
        result += `\\${char}`;
      }
    }
    return result;
  };
  const cssNamespace = (window.CSS ?? {}) as { escape?: (value: string) => string };
  cssNamespace.escape = cssEscape;
  Object.defineProperty(window, "CSS", { configurable: true, writable: true, value: cssNamespace });
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    writable: true,
    value: cssNamespace,
  });
}

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
