import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("mobile subagent page styles", () => {
  it("keeps the routed page flush and puts standalone clearance in the virtualized list", () => {
    expect(css).toMatch(
      /\.m-subagent-page\s*\{[^}]*gap:\s*0;[^}]*overflow:\s*hidden !important;[^}]*padding:\s*0;/s,
    );
    expect(css).toMatch(
      /\.m-subagent-page\s+\[data-chat-virtual-size-box="true"\]\s*\{[^}]*padding-bottom:\s*calc\(0\.75rem \+ env\(safe-area-inset-bottom\)\);/s,
    );
  });

  it("moves the Safari toolbar gap from the page into the virtualized list", () => {
    expect(css).toMatch(
      /\.m-shell\[data-chrome="subscreen"\][^{]*>\s*\.m-main[^{]*>\s*\.m-page:not\(\.m-subagent-page\)\s*\{[^}]*padding-bottom:\s*var\(--m-browser-edge-gap\);/s,
    );
    expect(css).toMatch(
      /\.m-shell\[data-chrome="subagent"\][^{]*\.m-subagent-page\s+\[data-chat-virtual-size-box="true"\]\s*\{[^}]*padding-bottom:\s*calc\(var\(--m-browser-list-tail\) \+ var\(--m-browser-toolbar-safe-area\)\);/s,
    );
    expect(css).not.toContain(".poracode-subagent-overlay");
  });

  it("uses translucent routed chrome while preserving the covered thread layer", () => {
    expect(css).toMatch(
      /\.m-shell:is\(\[data-chrome="thread"\], \[data-chrome="subagent"\]\)::before\s*\{[^}]*background:\s*color-mix\(in oklab, var\(--background\) 64%, transparent\);[^}]*backdrop-filter:\s*saturate\(140%\) blur\(20px\);/s,
    );
    expect(css).toMatch(
      /\.m-thread-route-host\[data-covered="true"\]\s*\{[^}]*visibility:\s*hidden;[^}]*pointer-events:\s*none;/s,
    );
    expect(css).toMatch(
      /\.m-shell--lightweight-subagent-pop[^{]*>\s*:is\(\.m-topbar, \.m-main\)\s*\{[^}]*animation:\s*m-lightweight-subagent-pop 0\.32s/s,
    );
  });
});
