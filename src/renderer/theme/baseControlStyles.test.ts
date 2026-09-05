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
      /html\[data-platform="darwin"\]\.dark,[^{]*html\[data-platform="darwin"\]\[data-theme="dark"\]\s*\{[^}]*--floating-chrome-surface:\s*color-mix\(\s*in oklab,\s*color-mix\(\s*in oklab,\s*var\(--sidebar-background\) 91%,\s*var\(--foreground\) 9%\s*\) 34%,\s*transparent\s*\);[^}]*--floating-chrome-backdrop:\s*blur\(10px\) saturate\(135%\);/s,
    );
    expect(styles).toMatch(
      /html:is\(\[data-platform="darwin"\], \[data-platform="win32"\]\) \.poracode-floating-chrome\s*\{[^}]*border-color:\s*color-mix\(in oklab, var\(--foreground\) 8%, transparent\);[^}]*background-image:\s*none;[^}]*backdrop-filter:\s*var\(--floating-chrome-backdrop\);[^}]*box-shadow:\s*0 2px 10px rgb\(0 0 0 \/ 0\.18\);/s,
    );
    expect(styles).toMatch(
      /--floating-chrome-active-surface:\s*color-mix\(\s*in oklab,\s*var\(--floating-chrome-surface\) 84%,\s*var\(--sidebar-background\) 16%\s*\);/s,
    );
    expect(styles).toMatch(
      /--floating-chrome-selected-accent:\s*oklch\(\s*from var\(--accent\) l c calc\(h \+ \(300 - h\) \/ 2\)\s*\);/s,
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
      /html\[data-platform="win32"\]\.dark,[^{]*html\[data-platform="win32"\]\[data-theme="dark"\]\s*\{[^}]*--floating-chrome-surface:\s*color-mix\(\s*in oklab,\s*color-mix\(\s*in oklab,\s*var\(--sidebar-background\) 91%,\s*var\(--foreground\) 9%\s*\) 40%,\s*transparent\s*\);[^}]*--floating-chrome-backdrop:\s*blur\(10px\) saturate\(130%\);/s,
    );
  });

  it("reads composer bubbles as a translucent composer layer, selected state as theme", () => {
    expect(styles).toMatch(
      /html \.poracode-floating-chrome\.poracode-floating-chrome--bubble\s*\{[^}]*background-color:\s*color-mix\(\s*in oklab,\s*var\(--composer-surface\) 70%,\s*transparent\s*\);[^}]*border-color:\s*color-mix\(in oklab, var\(--foreground\) 2%, transparent\);[^}]*box-shadow:\s*0 1px 2px rgb\(0 0 0 \/ 0\.1\),\s*0 3px 10px rgb\(0 0 0 \/ 0\.14\);/s,
    );
    // Active mirrors the sidebar Git badge idiom (bg-accent/15, hover 25%):
    // a subtle violet-steered wash at rest that deepens on hover.
    expect(styles).toMatch(
      /html \.poracode-floating-chrome\.poracode-floating-chrome--bubble-active\s*\{[^}]*background-color:\s*color-mix\(\s*in oklab,\s*color-mix\(\s*in oklab,\s*var\(--composer-surface\) 70%,\s*transparent\s*\) 85%,\s*var\(--floating-chrome-selected-accent\) 15%\s*\);[^}]*border-color:\s*color-mix\(in oklab, var\(--floating-chrome-selected-accent\) 18%, transparent\);/s,
    );
    expect(styles).toMatch(
      /html \.poracode-floating-chrome\.poracode-floating-chrome--bubble-active:hover\s*\{[^}]*background-color:\s*color-mix\(\s*in oklab,\s*color-mix\(\s*in oklab,\s*var\(--composer-surface\) 70%,\s*transparent\s*\) 75%,\s*var\(--floating-chrome-selected-accent\) 25%\s*\);[^}]*border-color:\s*color-mix\(in oklab, var\(--floating-chrome-selected-accent\) 25%, transparent\);/s,
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
});
