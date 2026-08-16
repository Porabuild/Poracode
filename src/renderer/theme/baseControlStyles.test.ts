import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(join(process.cwd(), "src/renderer/styles.css"), "utf8");

function ruleFor(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]+)\\}`));
  if (!match?.[1]) throw new Error(`Missing base style for ${selector}`);
  return match[1];
}

describe("base control styles", () => {
  it("keeps neutral button variants on the theme foreground", () => {
    for (const selector of [".button--primary", ".button--secondary", ".button--tertiary"]) {
      expect(ruleFor(selector)).toContain("--button-fg: var(--foreground)");
    }
  });

  it("uses dark, low-alpha liquid glass for macOS floating chrome", () => {
    expect(styles).toMatch(
      /html\[data-platform="darwin"\]\s*\{[^}]*--floating-chrome-surface:\s*color-mix\(in oklab, var\(--sidebar-background\) 38%, transparent\);[^}]*--floating-chrome-backdrop:\s*blur\(12px\) saturate\(140%\);/s,
    );
    expect(styles).toMatch(
      /html\[data-platform="darwin"\]\.dark,[^{]*html\[data-platform="darwin"\]\[data-theme="dark"\]\s*\{[^}]*--floating-chrome-surface:\s*color-mix\(in oklab, var\(--sidebar-background\) 24%, transparent\);[^}]*--floating-chrome-backdrop:\s*blur\(10px\) saturate\(135%\);/s,
    );
    expect(styles).toMatch(
      /html:is\(\[data-platform="darwin"\], \[data-platform="win32"\]\) \.poracode-floating-chrome\s*\{[^}]*border-color:\s*color-mix\(in oklab, var\(--foreground\) 8%, transparent\);[^}]*background-image:\s*none;[^}]*backdrop-filter:\s*var\(--floating-chrome-backdrop\);[^}]*box-shadow:\s*0 2px 10px rgb\(0 0 0 \/ 0\.18\);/s,
    );
    expect(styles).toMatch(
      /--floating-chrome-active-surface:\s*color-mix\(\s*in oklab,\s*var\(--floating-chrome-surface\) 84%,\s*var\(--sidebar-background\) 16%\s*\);/s,
    );
    expect(styles).toMatch(
      /\.poracode-floating-chrome--active\s*\{\s*background-color:\s*var\(--floating-chrome-active-surface\);/s,
    );
  });

  it("uses slightly denser dark liquid glass for Windows floating chrome", () => {
    expect(styles).toMatch(
      /html\[data-platform="win32"\]\s*\{[^}]*--floating-chrome-surface:\s*color-mix\(in oklab, var\(--sidebar-background\) 44%, transparent\);[^}]*--floating-chrome-backdrop:\s*blur\(12px\) saturate\(135%\);/s,
    );
    expect(styles).toMatch(
      /html\[data-platform="win32"\]\.dark,[^{]*html\[data-platform="win32"\]\[data-theme="dark"\]\s*\{[^}]*--floating-chrome-surface:\s*color-mix\(in oklab, var\(--sidebar-background\) 30%, transparent\);[^}]*--floating-chrome-backdrop:\s*blur\(10px\) saturate\(130%\);/s,
    );
  });

  it("lets the auto-focused draft composer become GPU-idle", () => {
    expect(ruleFor(".poracode-composer-border-glow::before")).not.toContain("animation:");
    expect(
      ruleFor(
        ".poracode-composer-shell--draft:focus-within .poracode-composer-border-glow::before",
      ),
    ).toContain("animation: poracode-composer-border-spin 1.2s ease-out 1 both");
  });

  it("uses true-black page backgrounds for the dark Poracode theme on mobile", () => {
    const mobilePoracode = ruleFor(
      'html[data-compact-layout][data-theme="dark"][data-theme-preset="default"]',
    );
    expect(mobilePoracode).toContain("--background: #000");
    expect(mobilePoracode).toContain("--content-background: #000");
  });

  it("uses one safe-zone token for compact headers and under-header page scrolling", () => {
    expect(styles).toContain("--m-header-height: 48px");
    expect(styles).toContain("--m-header-content-gap: 12px");
    expect(styles).toContain(
      "--m-page-header-safe-zone: calc(var(--m-header-height) + env(safe-area-inset-top))",
    );
    expect(ruleFor("html[data-compact-layout] .poracode-overlay-header")).toContain(
      "height: var(--m-page-header-safe-zone) !important",
    );
    const scrollSurface = ruleFor("html[data-compact-layout] .m-page-scroll-surface");
    expect(scrollSurface).toContain(
      "padding-top: calc(var(--m-page-header-safe-zone) + var(--m-header-content-gap))",
    );
    expect(scrollSurface).toContain("scroll-padding-top: var(--m-page-header-safe-zone)");
    expect(styles).toMatch(
      /\[data-poracode-shell-content\]:has\(\.m-page-scroll-surface\)\s*> \.poracode-overlay-header\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0 0 auto;/s,
    );
  });

  it("vertically centers compact headers and keeps dark page chrome translucent", () => {
    const mobileHeader = ruleFor("html[data-compact-layout] .poracode-mobile-header");
    expect(mobileHeader).toContain("align-items: center");
    expect(mobileHeader).not.toContain("transform:");
    expect(mobileHeader).not.toContain("padding-bottom:");
    expect(styles).toMatch(
      /\.poracode-shell\[data-mobile-navigation\]\[data-mobile-home\][^{]*\.poracode-overlay-header\s*\{[^}]*margin-bottom:\s*var\(--m-header-content-gap\);/s,
    );
    expect(styles).toMatch(
      /html\[data-compact-layout\]\[data-theme="dark"\][^{]*\.poracode-shell\[data-mobile-navigation\]:not\(\[data-mobile-home\]\)[^{]*\.poracode-overlay-header\s*\{[^}]*background:\s*color-mix\(in oklab, var\(--background\) 78%, transparent\) !important;/s,
    );
  });

  it("gives compact PWA menu rows a touch-friendly minimum height", () => {
    expect(styles).toContain("html[data-compact-layout] .menu-item,");
    expect(styles).toContain("html[data-compact-layout] .list-box-item,");
    expect(styles).toContain("html[data-compact-layout] .poracode-menu-item,");
    expect(ruleFor("html[data-compact-layout] .poracode-menu-action")).toContain(
      "min-height: var(--m-tap-min)",
    );
  });

  it("keeps bottom-sheet actions compact without sticky touch hover", () => {
    expect(ruleFor(".m-sheet-action")).toContain(
      "border-radius: var(--m-list-row-radius, 0.625rem)",
    );
    expect(ruleFor(".m-sheet-action:active")).toContain("background: var(--row-hover)");
    expect(styles).toMatch(/@media \(hover: hover\)\s*\{\s*\.m-sheet-action:hover\s*\{/);
  });

  it("keeps bottom-sheet safe-area clearance inside menu scroll ranges", () => {
    expect(ruleFor(".m-sheet:has(.m-sheet-list)")).toContain("padding-bottom: 0");
    expect(ruleFor(".m-sheet-list")).toContain(
      "scroll-padding-bottom: calc(0.75rem + env(safe-area-inset-bottom))",
    );
    expect(ruleFor(".m-sheet-list::after")).toContain(
      "flex: 0 0 calc(0.375rem + env(safe-area-inset-bottom))",
    );
  });

  it("uses shared translucent chrome for bottom-sheet headers", () => {
    const header = ruleFor(".m-sheet-head");
    expect(header).toContain("var(--sidebar-background, var(--background)) 78%");
    expect(header).toContain("backdrop-filter: blur(16px) saturate(130%)");
    expect(ruleFor(".m-sheet-scroll")).toContain("overflow-y: auto");
    expect(ruleFor(".m-sheet-scroll > .m-sheet-head")).toContain("position: sticky");
    expect(ruleFor(".m-sheet-scroll > .m-sheet-list")).toContain("overflow-y: visible");
    expect(ruleFor(".m-sheet-grabber")).toContain(
      "var(--sidebar-background, var(--background)) 78%",
    );
  });
});
