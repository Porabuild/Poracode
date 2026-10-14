import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(join(process.cwd(), "src/renderer/styles.css"), "utf8");

function ruleIndex(selectorList: readonly string[], declaration: string): number {
  const escaped = selectorList
    .map((selector) => selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(",\\s*");
  const match = new RegExp(`${escaped}\\s*\\{\\s*${declaration}\\s*\\}`).exec(styles);
  if (!match) throw new Error(`Missing rule: ${selectorList.join(", ")} { ${declaration} }`);
  return match.index;
}

// The welcome ring's infinite glow (box-shadow) and spins (custom property in a
// conic-gradient) are main-thread animations; an idle, visible-but-unfocused
// welcome screen otherwise re-styles and repaints every frame.
describe("welcome ring background pause", () => {
  it("pauses the ring's infinite movers when the window is hidden or unfocused", () => {
    const ringRule = ruleIndex(
      [
        "html[data-app-hidden] .poracode-welcome-ring",
        "html[data-app-unfocused] .poracode-welcome-ring",
      ],
      // Intro ring: [reveal, glow] — the one-shot reveal must keep running.
      "animation-play-state: running, paused;",
    );
    const steadyRule = ruleIndex(
      [
        "html[data-app-hidden] .poracode-welcome-ring-steady",
        "html[data-app-unfocused] .poracode-welcome-ring-steady",
        "html[data-app-hidden] .poracode-welcome-ring::before",
        "html[data-app-unfocused] .poracode-welcome-ring::before",
        "html[data-app-hidden] .poracode-welcome-ring::after",
        "html[data-app-unfocused] .poracode-welcome-ring::after",
      ],
      "animation-play-state: paused;",
    );
    // Same specificity: the steady ring (glow only) must win by source order.
    expect(steadyRule).toBeGreaterThan(ringRule);
    // `running, paused` assumes the intro ring lists the reveal before the glow.
    expect(styles).toMatch(
      /\.poracode-welcome-ring\s*\{[^}]*animation:\s*poracode-welcome-reveal[^;]*,\s*poracode-lightning-glow/,
    );
  });
});
