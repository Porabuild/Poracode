import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("mobile navigation transition styles", () => {
  it("frosts the sticky desktop-sidebar search row with the sidebar surface", () => {
    expect(css).toMatch(
      /\.m-sidebar\s*\{[^}]*--m-sidebar-surface:\s*color-mix\([^}]*--m-sidebar-picker-alpha:\s*78%;[^}]*--m-sidebar-picker-backdrop:\s*saturate\(140%\) blur\(16px\);[^}]*background:\s*var\(--m-sidebar-surface\);/s,
    );
    expect(css).toMatch(
      /html\[data-mobile-platform="macos"\] \.m-sidebar\s*\{[^}]*--m-sidebar-picker-alpha:\s*68%;[^}]*--m-sidebar-picker-backdrop:\s*saturate\(165%\) blur\(20px\);/s,
    );
    expect(css).toMatch(
      /html\[data-mobile-platform="windows"\] \.m-sidebar\s*\{[^}]*--m-sidebar-picker-alpha:\s*88%;[^}]*--m-sidebar-picker-backdrop:\s*saturate\(135%\) blur\(20px\) brightness\(1\.04\);/s,
    );
    expect(css).toMatch(
      /\.m-sidebar \.m-threads__picker\s*\{[^}]*background:\s*color-mix\([^}]*var\(--m-sidebar-surface\) var\(--m-sidebar-picker-alpha\),[^}]*transparent[^}]*\);[^}]*backdrop-filter:\s*var\(--m-sidebar-picker-backdrop\);/s,
    );
  });

  it("only compacts the desktop tool rail when it materially overlaps the thread column", () => {
    expect(css).toMatch(
      /\.m-wide-content\s*\{[^}]*container-name:\s*m-wide-content;[^}]*container-type:\s*inline-size;/s,
    );
    expect(css).toMatch(
      /\.m-desktop-tool-rail\s*\{[^}]*top:\s*calc\(4\.25rem \+ 20px\);[^}]*opacity:\s*1;/s,
    );
    expect(css).toMatch(
      /@container m-wide-content \(max-width: 1080px\)\s*\{[\s\S]*?\.m-desktop-tool-rail:not\(\[data-hidden\]\)\s*\{[^}]*max-height:\s*2\.625rem;[^}]*opacity:\s*0\.72;/,
    );
    expect(css).toMatch(
      /\.m-desktop-tool-rail:not\(\[data-hidden\]\):is\(:hover, :focus-within\)\s*\{[^}]*max-height:\s*20rem;[^}]*opacity:\s*1;/s,
    );
  });

  it("lets every desktop right-panel tab use the shared PWA content background", () => {
    expect(css).toMatch(
      /\.m-wide-content\s*\{[^}]*background:\s*var\(--content-background, #0b0b11\);/s,
    );
    expect(css).toMatch(/\.m-desktop-workspace__panel\s*\{[^}]*background:\s*transparent;/s);
    expect(css).toMatch(/\.m-desktop-workspace__panel-inner\s*\{[^}]*background:\s*transparent;/s);
    expect(css).toMatch(
      /\.m-desktop-workspace__panel \[data-poracode-panel\],[^{]*\.m-desktop-workspace__panel \.poracode-overlay-surface\s*\{\s*background:\s*transparent;/s,
    );
    expect(css).toMatch(
      /\.m-desktop-workspace__panel \.poracode-overlay-header\s*\{[^}]*background:\s*transparent;/s,
    );
    expect(css).toMatch(
      /\.m-desktop-workspace__panel \.m-subscreen\s*\{[^}]*background:\s*transparent;/s,
    );
    expect(css).toMatch(
      /\.m-desktop-workspace__panel \.m-subscreen > \.m-page\s*\{[^}]*background:\s*transparent;/s,
    );
  });

  it("keeps narrow PWA pages on the mobile theme background", () => {
    expect(css).toMatch(
      /html\[data-theme="dark"\]\[data-theme-preset="default"\]:has\(\.m-shell:not\(\.m-shell--wide\)\),[\s\S]*?#root\s*\{\s*background:\s*#000;/,
    );
    expect(css).toMatch(
      /\.m-shell:not\(\.m-shell--wide\)\s*\{\s*--content-background:\s*var\(--background\);/s,
    );
    expect(css).toMatch(
      /html\[data-theme="dark"\]\[data-theme-preset="default"\] \.m-shell:not\(\.m-shell--wide\)\s*\{[^}]*--background:\s*#000;[^}]*--content-background:\s*#000;/s,
    );
    expect(css).toMatch(
      /\.m-shell:not\(\.m-shell--wide\) \.m-main\s*\{\s*background:\s*var\(--background, #070709\);/s,
    );
    expect(css).toMatch(
      /\.m-shell:not\(\.m-shell--wide\) \.m-subscreen,[^{]*\.m-shell:not\(\.m-shell--wide\) \.m-subscreen > \*\s*\{\s*background:\s*var\(--background, #070709\);/s,
    );
  });

  it("captures the ordinary phone shell as one atomic page transition", () => {
    expect(css).toMatch(
      /\.m-shell:not\(\.m-shell--wide\):not\(\[data-chrome="fullscreen"\]\)\s*\{\s*view-transition-name: m-page/,
    );
    expect(css).toMatch(
      /push\)::view-transition-old\(m-page\),\s*html:active-view-transition-type\(push\)::view-transition-old\(m-screen\)\s*\{\s*animation: m-vt-out-left/,
    );
    expect(css).toMatch(
      /push\)::view-transition-new\(m-page\),\s*html:active-view-transition-type\(push\)::view-transition-new\(m-screen\)\s*\{\s*animation: m-vt-in-right/,
    );
    expect(css).toMatch(
      /pop\)::view-transition-old\(m-page\),\s*html:active-view-transition-type\(pop\)::view-transition-old\(m-screen\)\s*\{[^}]*animation: m-vt-out-right/,
    );
    expect(css).toMatch(
      /pop\)::view-transition-new\(m-page\),\s*html:active-view-transition-type\(pop\)::view-transition-new\(m-screen\)\s*\{\s*animation: m-vt-in-left/,
    );
    expect(css).not.toMatch(/view-transition-name:\s*m-(?:topbar|main)/);
  });
});
