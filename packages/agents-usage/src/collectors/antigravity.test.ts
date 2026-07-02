import { describe, expect, it } from "vitest";
import {
  antigravityPool,
  antigravityPoolWindows,
  antigravityQuotaSummaryWindows,
} from "./antigravity";

const NOW = 1_717_000_000_000;

/** Trimmed shape of a real RetrieveUserQuotaSummary response. */
const QUOTA_SUMMARY = {
  response: {
    groups: [
      {
        displayName: "Gemini Models",
        description: "Models within this group: Gemini Flash, Gemini Pro",
        buckets: [
          {
            bucketId: "gemini-weekly",
            displayName: "Weekly Limit",
            window: "weekly",
            remainingFraction: 0.88907504,
            resetTime: "2026-06-27T03:47:11Z",
          },
          {
            bucketId: "gemini-5h",
            displayName: "Five Hour Limit",
            window: "5h",
            remainingFraction: 0.3994549,
            resetTime: "2026-06-25T03:51:42Z",
          },
        ],
      },
      {
        displayName: "Claude and GPT models",
        description: "Models within this group: Claude Opus, Claude Sonnet, GPT-OSS",
        buckets: [
          {
            bucketId: "3p-weekly",
            displayName: "Weekly Limit",
            window: "weekly",
            remainingFraction: 1,
          },
          {
            bucketId: "3p-5h",
            displayName: "Five Hour Limit",
            window: "5h",
            remainingFraction: 1,
            resetTime: "2026-06-25T08:34:03Z",
          },
        ],
      },
    ],
  },
};

describe("antigravityQuotaSummaryWindows", () => {
  it("builds four group×cadence windows ordered Gemini-first, 5h-before-weekly", () => {
    const windows = antigravityQuotaSummaryWindows(QUOTA_SUMMARY);
    expect(windows.map((w) => w.id)).toEqual([
      "antigravity:gemini:session-5h",
      "antigravity:gemini:weekly",
      "antigravity:claude:session-5h",
      "antigravity:claude:weekly",
    ]);
    expect(windows.map((w) => w.label)).toEqual([
      "Gemini · 5h",
      "Gemini · Weekly",
      "Claude · 5h",
      "Claude · Weekly",
    ]);
  });

  it("converts the remaining fraction to used percent and parses reset times", () => {
    const windows = antigravityQuotaSummaryWindows(QUOTA_SUMMARY);
    const gemini5h = windows.find((w) => w.id === "antigravity:gemini:session-5h");
    // remaining 0.3994549 -> ~60.1% used.
    expect(gemini5h?.usedPercent).toBeCloseTo(60.1, 1);
    expect(gemini5h?.resetsAt).toBe(Date.parse("2026-06-25T03:51:42Z"));

    const geminiWeekly = windows.find((w) => w.id === "antigravity:gemini:weekly");
    expect(geminiWeekly?.usedPercent).toBeCloseTo(11.1, 1);

    // Untouched Claude group -> 0% used; the weekly bucket has no reset time.
    const claudeWeekly = windows.find((w) => w.id === "antigravity:claude:weekly");
    expect(claudeWeekly?.usedPercent).toBe(0);
    expect(claudeWeekly?.resetsAt).toBeUndefined();
  });

  it("skips buckets without a numeric fraction or recognizable cadence", () => {
    const windows = antigravityQuotaSummaryWindows({
      response: {
        groups: [
          {
            displayName: "Gemini Models",
            buckets: [
              { window: "weekly" }, // no remainingFraction
              { window: "daily", remainingFraction: 0.5 }, // unknown cadence
              { window: "5h", remainingFraction: 0.5 },
            ],
          },
        ],
      },
    });
    expect(windows.map((w) => w.id)).toEqual(["antigravity:gemini:session-5h"]);
  });

  it("returns [] for a body with no recognizable groups", () => {
    expect(antigravityQuotaSummaryWindows(undefined)).toEqual([]);
    expect(antigravityQuotaSummaryWindows({ response: {} })).toEqual([]);
    expect(antigravityQuotaSummaryWindows({ anything: [1, 2] })).toEqual([]);
  });
});

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
