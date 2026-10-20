import { describe, expect, it } from "vitest";
import {
  antigravityPool,
  antigravityPoolWindows,
  antigravityQuotaSummaryWindows,
  antigravityRingGroups,
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

  it("supports separate Gemini 4 Argon and dynamic future quota groups and cadences", () => {
    const windows = antigravityQuotaSummaryWindows({
      groups: [
        {
          displayName: "Gemini Models",
          buckets: [
            { bucketId: "gemini-weekly", window: "weekly", remainingFraction: 0.8 },
            { bucketId: "gemini-5h", window: "5h", remainingFraction: 0.4 },
          ],
        },
        {
          displayName: "Claude and GPT models",
          buckets: [
            { bucketId: "3p-weekly", window: "weekly", remainingFraction: 0.9 },
            { bucketId: "3p-5h", window: "5h", remainingFraction: 0.7 },
          ],
        },
        {
          displayName: "Gemini 4 Argon",
          description:
            "For paid Pro plans, Argon quota is separate. Higher Argon quota is available on Ultra plans.",
          buckets: [
            {
              bucketId: "gemini-argon-wtu-weekly",
              displayName: "Gemini 4 Argon Weekly Limit",
              window: "weekly",
              remainingFraction: 0.38767335,
              resetTime: "2026-10-24T08:59:08Z",
            },
          ],
        },
        {
          displayName: "Experimental Frontier Models",
          buckets: [
            { bucketId: "frontier-daily", window: "daily", remainingFraction: 0.5 },
            { bucketId: "frontier-1h", window: "1h", remainingFraction: 0.25 },
          ],
        },
      ],
    });

    expect(windows.map((w) => [w.id, w.label, w.usedPercent])).toEqual([
      ["antigravity:gemini:session-5h", "Gemini · 5h", 60],
      ["antigravity:gemini:weekly", "Gemini · Weekly", 20],
      ["antigravity:claude:session-5h", "Claude · 5h", 30],
      ["antigravity:claude:weekly", "Claude · Weekly", 10],
      ["antigravity:gemini-4-argon:weekly", "Gemini 4 Argon · Weekly", 61.2],
      ["antigravity:experimental-frontier:1h", "Experimental Frontier · 1h", 75],
      ["antigravity:experimental-frontier:daily", "Experimental Frontier · Daily", 50],
    ]);
  });

  it("parses the agy -p '/usage' --output-format json snake_case envelope", () => {
    const windows = antigravityQuotaSummaryWindows({
      command: {
        data: {
          groups: [
            {
              name: "Gemini Models",
              buckets: [
                {
                  id: "gemini-5h",
                  name: "Gemini 5 Hour Limit",
                  window: "5h",
                  remaining_fraction: 1,
                  reset_time: "2026-04-20T22:55:27Z",
                },
              ],
            },
            {
              name: "Gemini 4 Argon",
              buckets: [
                {
                  id: "gemini-argon-wtu-weekly",
                  name: "Gemini 4 Argon Weekly Limit",
                  window: "weekly",
                  remaining_fraction: 0.39,
                  reset_time: "2026-10-24T08:59:08Z",
                },
              ],
            },
          ],
        },
      },
    });

    expect(windows).toEqual([
      {
        id: "antigravity:gemini:session-5h",
        label: "Gemini · 5h",
        usedPercent: 0,
        resetsAt: Date.parse("2026-04-20T22:55:27Z"),
      },
      {
        id: "antigravity:gemini-4-argon:weekly",
        label: "Gemini 4 Argon · Weekly",
        usedPercent: 61,
        resetsAt: Date.parse("2026-10-24T08:59:08Z"),
      },
    ]);
  });

  it("skips buckets without a numeric fraction or recognizable cadence", () => {
    const windows = antigravityQuotaSummaryWindows({
      response: {
        groups: [
          {
            displayName: "Gemini Models",
            buckets: [
              { window: "weekly" }, // no remainingFraction
              { displayName: "Unlabeled Limit", remainingFraction: 0.5 }, // no window and unrecognized displayName
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

  it("parses the bare Cloud Code summary identically to the language-server envelope", () => {
    expect(antigravityQuotaSummaryWindows(QUOTA_SUMMARY.response)).toEqual(
      antigravityQuotaSummaryWindows(QUOTA_SUMMARY),
    );
  });
});

describe("antigravityRingGroups", () => {
  it("derives dynamic ring groups when additional groups such as Gemini 4 Argon are present", () => {
    const groups = antigravityRingGroups([
      { id: "antigravity:gemini:session-5h", label: "Gemini · 5h", usedPercent: 10 },
      { id: "antigravity:gemini:weekly", label: "Gemini · Weekly", usedPercent: 20 },
      { id: "antigravity:claude:session-5h", label: "Claude · 5h", usedPercent: 30 },
      { id: "antigravity:claude:weekly", label: "Claude · Weekly", usedPercent: 40 },
      {
        id: "antigravity:gemini-4-argon:weekly",
        label: "Gemini 4 Argon · Weekly",
        usedPercent: 61,
      },
    ]);
    expect(groups).toEqual([
      {
        key: "gemini",
        label: "Gemini",
        outer: ["antigravity:gemini:session-5h"],
        inner: ["antigravity:gemini:weekly"],
      },
      {
        key: "claude",
        label: "Claude & GPT",
        outer: ["antigravity:claude:session-5h"],
        inner: ["antigravity:claude:weekly"],
      },
      {
        key: "gemini-4-argon",
        label: "Gemini 4 Argon",
        outer: [],
        inner: ["antigravity:gemini-4-argon:weekly"],
      },
    ]);
  });

  it("includes legacy pool IDs so Gemini ring selection works on hybrid/offline snapshots", () => {
    const groups = antigravityRingGroups([
      { id: "antigravity:gemini-pro", label: "Gemini Pro", usedPercent: 45 },
      { id: "antigravity:gemini-flash", label: "Gemini Flash", usedPercent: 20 },
      { id: "antigravity:gemini-argon", label: "Gemini 4 Argon", usedPercent: 60 },
      { id: "antigravity:claude:session-5h", label: "Claude · 5h", usedPercent: 30 },
      { id: "antigravity:claude:weekly", label: "Claude · Weekly", usedPercent: 40 },
    ]);
    expect(groups.find((g) => g.key === "gemini")?.outer).toEqual([
      "antigravity:gemini:session-5h",
      "antigravity:gemini-pro",
      "antigravity:gemini-flash",
    ]);
    expect(groups.find((g) => g.key === "gemini-4-argon")?.outer).toEqual([
      "antigravity:gemini-argon",
    ]);
  });
});

describe("antigravityPool", () => {
  it("splits Gemini Pro / Flash / Argon and folds everything else into Claude", () => {
    expect(antigravityPool("Gemini 3.1 Pro (High)").id).toBe("gemini-pro");
    expect(antigravityPool("gemini-2.5-pro").id).toBe("gemini-pro");
    expect(antigravityPool("Gemini 3.5 Flash (Medium)").id).toBe("gemini-flash");
    expect(antigravityPool("gemini-2.5-flash-lite").id).toBe("gemini-flash");
    expect(antigravityPool("Gemini 4 Argon (High)").id).toBe("gemini-argon");
    expect(antigravityPool("gemini-4-argon-medium").id).toBe("gemini-argon");
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
