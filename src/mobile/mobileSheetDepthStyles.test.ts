import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const mobileHtml = readFileSync(new URL("../../mobile.html", import.meta.url), "utf8");
const bootstrapScript = mobileHtml.match(
  /<script data-mobile-display-bootstrap>([\s\S]*?)<\/script>/,
)?.[1];

function runDisplayModeBootstrap(input: {
  readonly ios?: boolean;
  readonly navigatorStandalone: boolean;
  readonly matchedModes: readonly string[];
}): {
  readonly browserChrome: string | null;
  readonly standaloneHeight: string | null;
  readonly standaloneShell: string | null;
  readonly themeColor: string;
} {
  let browserChrome: string | null = null;
  let standaloneHeight: string | null = null;
  let standaloneShell: string | null = null;
  let themeColor = "#000000";
  if (!bootstrapScript) throw new Error("Mobile display-mode bootstrap script not found.");
  runInNewContext(bootstrapScript, {
    window: {
      navigator: {
        standalone: input.navigatorStandalone,
        userAgent: input.ios === false ? "Android" : "iPhone",
        platform: input.ios === false ? "Linux armv8l" : "iPhone",
        maxTouchPoints: 5,
      },
      matchMedia: (query: string) => ({
        matches: input.matchedModes.some((mode) => query === `(display-mode: ${mode})`),
      }),
    },
    document: {
      documentElement: {
        setAttribute: (name: string, value: string) => {
          if (name === "data-mobile-browser-chrome") browserChrome = value;
          if (name === "data-mobile-standalone") standaloneShell = value;
        },
        style: {
          setProperty: (name: string, value: string) => {
            if (name === "height") standaloneHeight = value;
          },
        },
      },
      querySelector: (selector: string) =>
        selector === 'meta[name="theme-color"]'
          ? {
              setAttribute: (name: string, value: string) => {
                if (name === "content") themeColor = value;
              },
            }
          : null,
    },
  });
  return { browserChrome, standaloneHeight, standaloneShell, themeColor };
}

describe("mobile sheet depth styles", () => {
  it("gives every mobile model picker a consistent tall drawer", () => {
    expect(css).toMatch(
      /\.m-shell > \.m-sheet-backdrop > \.m-sheet:has\(\.poracode-model-menu-listbox\)\s*\{[^}]*overflow:\s*hidden;[^}]*height:\s*auto;[^}]*max-height:\s*65dvh;[^}]*padding-bottom:\s*0;/s,
    );
    expect(css).toMatch(
      /> \.m-sheet\[data-expanded\]:has\(\.poracode-model-menu-listbox\)\s*\{[^}]*height:\s*calc\(100dvh - env\(safe-area-inset-top\) - 0\.75rem\);[^}]*max-height:\s*calc\(100dvh - env\(safe-area-inset-top\) - 0\.75rem\);/s,
    );
    expect(css).toMatch(
      /\.m-shell > \.m-sheet-backdrop > \.m-sheet \.poracode-model-menu-listbox\s*\{[^}]*height:\s*auto !important;[^}]*min-height:\s*0;[^}]*max-height:\s*none !important;[^}]*flex:\s*1;/s,
    );
    expect(css).toMatch(
      /\.poracode-model-menu-listbox[\s\S]*\.poracode-model-menu-bottom-spacer\s*\{[^}]*box-sizing:\s*content-box;[^}]*padding-bottom:\s*env\(safe-area-inset-bottom\);/s,
    );
  });

  it("keeps composer and sheet backdrops out of transparent iOS Safari chrome", () => {
    // Standalone PWAs paint the bottom safe-area band with the theme-color, so
    // the static meta stays opaque; browser mode flips it to transparent at
    // boot so Safari's floating toolbar blends with the app paint.
    expect(mobileHtml).toContain('<meta name="theme-color" content="#000000" />');
    expect(mobileHtml).toMatch(
      /navigator\.standalone === true[\s\S]*!standalone && window\.matchMedia\("\(display-mode: browser\)"\)\.matches[\s\S]*data-mobile-browser-chrome[\s\S]*meta\[name="theme-color"\][\s\S]*"content", "transparent"/,
    );
    expect(css).toMatch(
      /@media \(display-mode: browser\)[\s\S]*html\[data-mobile-platform="ios"\]\[data-mobile-browser-chrome="true"\][\s\S]*\.m-compose-scrim\s*\{[^}]*background:\s*transparent;/s,
    );
    expect(css).toMatch(
      /\.m-shell[\s\S]*> \.m-sheet-backdrop\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0 0 auto;[^}]*height:\s*calc\(100svh \+ var\(--m-browser-band-paint\)\);[^}]*background:\s*transparent;/s,
    );
    expect(css).toMatch(
      /> \.m-sheet:has\(\.poracode-model-menu-listbox\)\s*\{[^}]*overflow:\s*hidden;[^}]*height:\s*auto;[^}]*max-height:\s*calc\(65svh \+ var\(--m-browser-band-paint\)\);[^}]*padding-bottom:\s*0;/s,
    );
    expect(css).toMatch(
      /> \.m-sheet[\s\S]*\.poracode-model-menu-listbox\s*\{[^}]*height:\s*auto !important;[^}]*min-height:\s*0;[^}]*max-height:\s*none !important;[^}]*flex:\s*1;[^}]*scroll-padding-bottom:\s*calc\(var\(--m-browser-edge-gap\) \+ var\(--m-browser-toolbar-safe-area\)\);/s,
    );
    expect(css).not.toContain("--m-model-menu-browser-depth");
    expect(css).not.toMatch(/\.m-sheet:has\(\.poracode-model-menu-listbox\)::after/);
  });

  it("keeps Home Screen apps opaque even when WebKit also reports browser mode", () => {
    const result = runDisplayModeBootstrap({
      navigatorStandalone: true,
      matchedModes: ["browser"],
    });

    expect(result).toEqual({
      browserChrome: null,
      standaloneHeight: "100lvh",
      standaloneShell: "true",
      themeColor: "#000000",
    });
  });

  it("keeps fullscreen Home Screen apps opaque", () => {
    const result = runDisplayModeBootstrap({
      navigatorStandalone: false,
      matchedModes: ["browser", "fullscreen"],
    });

    expect(result).toEqual({
      browserChrome: null,
      standaloneHeight: "100lvh",
      standaloneShell: "true",
      themeColor: "#000000",
    });
  });

  it("does not force the large viewport in a non-iOS standalone app", () => {
    const result = runDisplayModeBootstrap({
      ios: false,
      navigatorStandalone: false,
      matchedModes: ["standalone"],
    });

    expect(result).toEqual({
      browserChrome: null,
      standaloneHeight: null,
      standaloneShell: "true",
      themeColor: "#000000",
    });
  });

  it("enables the toolbar treatment only in a real browser tab", () => {
    const result = runDisplayModeBootstrap({
      navigatorStandalone: false,
      matchedModes: ["browser"],
    });

    expect(result).toEqual({
      browserChrome: "true",
      standaloneHeight: null,
      standaloneShell: null,
      themeColor: "transparent",
    });
  });
});
