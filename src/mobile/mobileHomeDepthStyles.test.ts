import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const mobileHtml = readFileSync(new URL("../../mobile.html", import.meta.url), "utf8");

describe("mobile home depth styles", () => {
  it("uses the physical viewport for an installed iOS PWA document", () => {
    expect(mobileHtml).toMatch(
      /if \(standalone\)[\s\S]*document\.documentElement\.style\.setProperty\("height", "100lvh"\)/,
    );
    expect(css).toMatch(
      /html\[data-mobile-platform="ios"\]\[data-mobile-standalone="true"\] body\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*100%;/s,
    );
    expect(css).toMatch(
      /html\[data-mobile-platform="ios"\]\[data-mobile-standalone="true"\] #root\s*\{[^}]*position:\s*static;[^}]*height:\s*100%;[^}]*min-height:\s*100%;/s,
    );
  });

  it("paints through Safari chrome while only the inner thread list scrolls", () => {
    expect(css).toMatch(
      /html\[data-mobile-platform="ios"\]\[data-mobile-browser-chrome="true"\] #root\s*\{[^}]*bottom:\s*auto;[^}]*height:\s*100lvh;/s,
    );
    expect(css).toMatch(
      /html\[data-mobile-platform="ios"\]\[data-mobile-browser-chrome="true"\]\s*\{[^}]*--m-browser-toolbar-depth:\s*calc\(100lvh - 100svh\);[^}]*--m-browser-band-paint:\s*calc\(3 \* var\(--m-browser-toolbar-depth\)\);[^}]*--m-browser-toolbar-safe-area:\s*calc\(\s*env\(safe-area-inset-bottom\) \+ var\(--m-browser-band-paint\)\s*\);/s,
    );
    expect(css).toMatch(
      /html\[data-mobile-platform="ios"\]\[data-mobile-browser-chrome="true"\] \.m-home-compose-actions,[^{]*html\[data-mobile-platform="ios"\]\[data-mobile-browser-chrome="true"\][^{]*\.m-shell\[data-chrome="home"\][^{]*\.m-compose-dock\s*\{[^}]*bottom:\s*calc\(var\(--m-browser-edge-gap\) \+ var\(--m-browser-toolbar-safe-area\)\)/s,
    );
    expect(css).toMatch(
      /html\[data-mobile-platform="ios"\]\[data-mobile-browser-chrome="true"\][^{]*\.m-shell\[data-chrome="home"\]\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;/s,
    );
    expect(css).toMatch(
      /html\[data-mobile-platform="ios"\]\[data-mobile-browser-chrome="true"\]:has\([^{}]*\.m-shell\[data-chrome="home"\][^{}]*\),[^{}]*html\[data-mobile-platform="ios"\]\[data-mobile-browser-chrome="true"\]:has\([^{}]*\.m-shell\[data-chrome="home"\][^{}]*\)[^{}]*body\s*\{[^}]*height:\s*calc\(100svh \+ var\(--m-browser-band-paint\)\);[^}]*overflow:\s*hidden;[^}]*overscroll-behavior-y:\s*none;/s,
    );
    expect(css).toMatch(
      /html\[data-mobile-platform="ios"\]\[data-mobile-browser-chrome="true"\]:has\([^{}]*\.m-shell\[data-chrome="home"\][^{}]*\)[^{}]*#root\s*\{[^}]*position:\s*static;[^}]*height:\s*calc\(100svh \+ var\(--m-browser-band-paint\)\);[^}]*overflow:\s*hidden;/s,
    );
    expect(css).toMatch(
      /\.m-shell\[data-chrome="home"\]\s*\{[^}]*--m-home-header-clearance:\s*calc\(env\(safe-area-inset-top\) \+ var\(--m-tap-min\)\)/s,
    );
    expect(css).toMatch(
      /\.m-shell\[data-chrome="home"\] > \.m-topbar\s*\{[^}]*position:\s*absolute;[^}]*min-height:\s*var\(--m-home-header-clearance\);[^}]*background:\s*color-mix\(in oklab, var\(--background\) 78%, transparent\);[^}]*backdrop-filter:\s*saturate\(140%\) blur\(16px\)/s,
    );
    expect(css).toMatch(
      /\.m-shell\[data-chrome="home"\] > \.m-main > \.m-threads > \.m-thread-list\s*\{[^}]*padding-top:\s*calc\(var\(--m-home-header-clearance\) \+ 0\.125rem\);[^}]*scroll-padding-top:\s*var\(--m-home-header-clearance\)/s,
    );
    expect(css).toMatch(
      /\.m-shell\[data-chrome="home"\] > \.m-main > \.m-threads > \.m-thread-list::after\s*\{[^}]*content:\s*"";[^}]*flex:\s*0 0\s*calc\([^}]*var\(--m-floating-control-height\) \+ 1\.5rem \+ env\(safe-area-inset-bottom\)/s,
    );
    expect(css).toMatch(
      /html\[data-mobile-platform="ios"\]\[data-mobile-browser-chrome="true"\][^{]*\.m-shell\[data-chrome="home"\][^{]*\.m-thread-list::after\s*\{[^}]*flex-basis:\s*calc\([^}]*var\(--m-floating-control-height\) \+ var\(--m-browser-list-tail\) \+[^}]*var\(--m-browser-toolbar-safe-area\)/s,
    );
    expect(css).not.toContain("--m-home-band-overshoot");
    expect(css).not.toContain("--m-thread-band-overshoot");
    expect(css).toMatch(
      /\.m-main > \.m-threads > \.m-thread-list\s*\{[^}]*overflow-y:\s*auto;[^}]*touch-action:\s*pan-y;/s,
    );
    expect(css).not.toMatch(
      /html\[data-mobile-platform="ios"\]\[data-mobile-browser-chrome="true"\][^{]*\.m-shell\[data-chrome="home"\][^{]*\.m-thread-list\s*\{[^}]*overflow-y:\s*visible;/s,
    );
  });

  it("keeps the floating search below the status bar and expands it across the header", () => {
    expect(css).toMatch(
      /\.m-shell\[data-chrome="home"\] > \.m-topbar\s*\{[^}]*min-height:\s*var\(--m-home-header-clearance\)/s,
    );
    expect(css).toMatch(
      /\.m-topbar-search:has\(\.m-search-float\)\s*\{[^}]*right:\s*0\.625rem;[^}]*width:\s*calc\(100% - 1\.25rem\);[^}]*max-width:\s*none;/s,
    );
    expect(css).toMatch(
      /\.m-topbar-search > \.m-threads__picker\s*\{[^}]*min-width:\s*0;[^}]*flex:\s*1;/s,
    );
  });
});
