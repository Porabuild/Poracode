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

  it("keeps bottom-sheet actions compact without sticky touch hover", () => {
    expect(ruleFor(".m-sheet-action")).toContain(
      "border-radius: var(--m-list-row-radius, 0.625rem)",
    );
    expect(ruleFor(".m-sheet-action:active")).toContain("background: var(--row-hover)");
    expect(styles).toMatch(/@media \(hover: hover\)\s*\{\s*\.m-sheet-action:hover\s*\{/);
  });
});
