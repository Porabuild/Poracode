import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("mobile iOS input ergonomics", () => {
  it("applies the 16px no-zoom floor to every document-level editable control", () => {
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

    expect(css).toContain(
      'html[data-mobile-platform="ios"] :is(input, textarea, select, [contenteditable="true"])',
    );
    expect(css).toMatch(
      /html\[data-mobile-platform="ios"\] :is\(input, textarea, select, \[contenteditable="true"\]\)\s*\{\s*font-size: 16px;/,
    );
  });

  it("does not double-count the keyboard when capping an expanded composer", () => {
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

    expect(css).toMatch(
      /html\[data-mobile-platform="ios"\][\s\S]*\.m-compose-dock\[data-expanded\]:not\(\[data-collapsing\]\)[\s\S]*\.m-compose-bubble,[\s\S]*html\[data-mobile-platform="ios"\][\s\S]*\.m-thread-compose-dock\[data-expanded\]:not\(\[data-collapsing\]\)[\s\S]*\.m-compose-bubble\s*\{\s*max-height:\s*calc\(100lvh - var\(--m-keyboard-offset, 0px\) - env\(safe-area-inset-top\) - 7\.5rem\);/,
    );
  });

  it("keeps the lifted iOS PWA composer clear of the keyboard accessory strip", () => {
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

    // Both lift states get the home-indicator gap: an expanded composer, and a
    // dock pinned collapsed under an open request whose one-line input is
    // focused ([data-lifted], see FloatingComposerDock.expansionLocked).
    expect(css).toMatch(
      /html\[data-mobile-platform="ios"\]\[data-mobile-standalone="true"\]\s*:is\(\s*\.m-compose-dock\[data-expanded\],\s*\.m-thread-compose-dock\[data-expanded\],\s*\.m-thread-compose-dock\[data-lifted\]\s*\)\s*\{\s*\/\*[\s\S]*?--m-keyboard-gap:\s*env\(safe-area-inset-bottom\);/,
    );
  });

  it("clips compact composer content to one fixed, centered control line", () => {
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

    expect(css).toMatch(
      /\.m-compose-dock:not\(\[data-expanded\]\) \.m-compose-bubble \.poracode-mention-input\s*\{[\s\S]*?height:\s*var\(--m-floating-control-line-height\);[\s\S]*?overflow:\s*hidden;[\s\S]*?line-height:\s*var\(--m-floating-control-line-height\);/,
    );
    expect(css).toMatch(
      /\.m-thread-compose-dock:is\(:not\(\[data-expanded\]\), \[data-collapsing\]\)[\s\S]*?\.poracode-mention-input\s*\{[\s\S]*?height:\s*var\(--m-floating-control-line-height\);[\s\S]*?overflow:\s*hidden;[\s\S]*?line-height:\s*var\(--m-floating-control-line-height\);/,
    );
  });
});
