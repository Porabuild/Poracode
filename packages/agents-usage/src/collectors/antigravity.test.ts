import { describe, expect, it } from "vitest";
import { antigravityPool, antigravityPoolWindows } from "./antigravity";

const NOW = 1_717_000_000_000;

describe("antigravityPool", () => {
  it("splits Gemini Pro / Flash and folds everything else into Claude", () => {
    expect(antigravityPool("Gemini 3.1 Pro (High)").id).toBe("gemini-pro");
    expect(antigravityPool("gemini-2.5-pro").id).toBe("gemini-pro");
    expect(antigravityPool("Gemini 3.5 Flash (Medium)").id).toBe("gemini-flash");
    expect(antigravityPool("gemini-2.5-flash-lite").id).toBe("gemini-flash");
    expect(antigravityPool("Claude Opus 4.6 (Thinking)").id).toBe("claude");
    expect(antigravityPool("Claude Sonnet 4.6").id).toBe("claude");
    // Non-Gemini, non-Claude models share the Claude pool.
    expect(antigravityPool("GPT-OSS 120B (Medium)").id).toBe("claude");
  });
});

describe("antigravityPoolWindows", () => {
  it("collapses the live language-server model set into 3 pools, most-constrained wins", () => {
    // The real GetUserStatus set: Gemini Pro/Flash variants + Claude + GPT-OSS.
    const windows = antigravityPoolWindows([
      { label: "Gemini 3.1 Pro (High)", remainingFraction: 0.8, resetsAt: NOW + 3_600_000 },
      { label: "Gemini 3.1 Pro (Low)", remainingFraction: 0.5, resetsAt: undefined },
      { label: "Gemini 3.5 Flash (Medium)", remainingFraction: 1, resetsAt: NOW + 1_000 },
      { label: "Claude Opus 4.6 (Thinking)", remainingFraction: 0.3, resetsAt: NOW + 7_200_000 },
      { label: "Claude Sonnet 4.6 (Thinking)", remainingFraction: 0.9, resetsAt: undefined },
      { label: "GPT-OSS 120B (Medium)", remainingFraction: 0.2, resetsAt: undefined },
    ]);

    expect(windows.map((w) => w.id)).toEqual([
      "antigravity:gemini-pro",
      "antigravity:gemini-flash",
      "antigravity:claude",
    ]);
    expect(windows.map((w) => w.label)).toEqual(["Gemini Pro", "Gemini Flash", "Claude"]);

    // Pro: most-constrained is the Low variant (0.5) -> 50% used.
    const pro = windows.find((w) => w.id === "antigravity:gemini-pro");
    expect(pro?.usedPercent).toBeCloseTo(50);
    // Inherits the High variant's reset when the winning bucket omits its own.
    expect(pro?.resetsAt).toBe(NOW + 3_600_000);

    // Claude pool absorbs GPT-OSS; most-constrained is 0.2 -> 80% used.
    const claude = windows.find((w) => w.id === "antigravity:claude");
    expect(claude?.usedPercent).toBeCloseTo(80);
  });

  it("drops empty pools and skips blank labels", () => {
    const windows = antigravityPoolWindows([
      { label: "", remainingFraction: 0.5, resetsAt: undefined },
      { label: "Gemini 3.5 Flash", remainingFraction: 0.4, resetsAt: undefined },
    ]);
    expect(windows.map((w) => w.id)).toEqual(["antigravity:gemini-flash"]);
  });
});
