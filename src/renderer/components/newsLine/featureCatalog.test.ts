import { describe, expect, it } from "vitest";
import { BUILT_IN_MCP_SERVER_IDS } from "@/shared/contracts/mcpServer";
import { DISCOVERABLE_FEATURE_IDS } from "@/shared/featureDiscovery";
import { SIDEBAR_SHORTCUT_IDS } from "@/shared/settings";
import type { ChangelogRelease } from "@/shared/changelog";
import { SETTINGS_SECTIONS } from "@/renderer/views/SettingsOverlay/parts/types";
import {
  FEATURE_CATALOG,
  NOT_PROMOTED,
  type CoverageKey,
  type DiscoverableFeature,
  type FeatureContext,
} from "./featureCatalog";
import {
  DISCOVERY_COOLDOWN_MS,
  DISCOVERY_MAX_SHOWINGS,
  newFeaturesFromChangelog,
  pickDiscoveries,
} from "./featureDiscoveryPicks";

/**
 * Every product surface needs a decision: promote it through a catalog
 * feature, or list it in NOT_PROMOTED with a reason. A new Settings section,
 * sidebar shortcut, or built-in MCP server fails here until someone decides.
 */
describe("feature discovery catalog coverage", () => {
  const surfaces: CoverageKey[] = [
    ...SETTINGS_SECTIONS.map((section) => `settings:${section}` as const),
    ...SIDEBAR_SHORTCUT_IDS.map((id) => `sidebar:${id}` as const),
    ...BUILT_IN_MCP_SERVER_IDS.map((id) => `mcp:${id}` as const),
  ];
  const covered = new Map<CoverageKey, string>();
  for (const feature of FEATURE_CATALOG) {
    for (const key of feature.covers) covered.set(key, feature.id);
  }

  it.each(surfaces)("decides whether to promote %s", (surface) => {
    const promoted = covered.has(surface);
    const skipped = surface in NOT_PROMOTED;
    expect(
      promoted !== skipped,
      `${surface}: add it to a FEATURE_CATALOG entry's covers, or to NOT_PROMOTED with a reason (not both)`,
    ).toBe(true);
  });

  it("has exactly one catalog entry per shared feature id", () => {
    expect(FEATURE_CATALOG.map((feature) => feature.id).toSorted()).toEqual(
      [...DISCOVERABLE_FEATURE_IDS].toSorted(),
    );
  });

  it("does not list removed surfaces", () => {
    const known = new Set<string>(surfaces);
    for (const key of [...covered.keys(), ...Object.keys(NOT_PROMOTED)]) {
      expect(known.has(key), `${key} no longer exists`).toBe(true);
    }
  });
});

function makeContext(overrides: Partial<FeatureContext> = {}): FeatureContext {
  return {
    seen: () => false,
    stats: null,
    usedMcp: () => false,
    savedCrews: 0,
    threadsWithCrew: false,
    threadsInWorktree: false,
    threadsWithPullRequest: false,
    schedules: 0,
    mcpServers: 0,
    installedPlugins: 0,
    customThemes: 0,
    workspaces: 0,
    remoteAccessEnabled: false,
    remoteServers: 0,
    readyAgents: 3,
    desktopHost: true,
    ...overrides,
  };
}

const crews = FEATURE_CATALOG.find((feature) => feature.id === "crews")!;
const schedules = FEATURE_CATALOG.find((feature) => feature.id === "schedules")!;
const chrome = FEATURE_CATALOG.find((feature) => feature.id === "chrome-extension")!;
const catalog: DiscoverableFeature[] = [crews, schedules, chrome];
const now = Date.parse("2026-11-10T12:00:00Z");
const base = {
  history: {},
  hidden: new Set<string>(),
  newFeatures: new Map(),
  now,
  count: 5,
  random: () => 0.5,
};

describe("pickDiscoveries", () => {
  it("skips features already used or opened", () => {
    const picks = pickDiscoveries(
      catalog,
      makeContext({ savedCrews: 1, seen: (signal) => signal === "view:schedules" }),
      base,
    );
    expect(picks.map((pick) => pick.feature.id)).toEqual(["chrome-extension"]);
  });

  it("only suggests what fits the setup", () => {
    const picks = pickDiscoveries(
      catalog,
      makeContext({ readyAgents: 1, desktopHost: false }),
      base,
    );
    expect(picks.map((pick) => pick.feature.id)).toEqual(["schedules"]);
  });

  it("respects closing, the showing cap, and the weekly cooldown", () => {
    const picks = pickDiscoveries(catalog, makeContext(), {
      ...base,
      hidden: new Set(["discover:crews"]),
      history: {
        schedules: { count: DISCOVERY_MAX_SHOWINGS, lastShownAt: 0 },
        "chrome-extension": { count: 1, lastShownAt: now - DISCOVERY_COOLDOWN_MS / 2 },
      },
    });
    expect(picks).toEqual([]);
  });

  it("leads with a feature a recent release introduced", () => {
    const releases: ChangelogRelease[] = [
      {
        version: "1.9.0",
        date: "2026-11-01",
        title: "T",
        summary: "S",
        changes: [
          {
            kind: "added",
            label: "Schedules",
            text: "Run agents on a schedule.",
            headline: "Run agents on a schedule",
            feature: "schedules",
          },
          { kind: "added", text: "Unknown feature.", feature: "teleport" },
        ],
      },
      {
        version: "1.7.0",
        date: "2026-08-01",
        title: "Old",
        summary: "S",
        changes: [{ kind: "added", text: "Old crews.", feature: "crews" }],
      },
    ];
    const newFeatures = newFeaturesFromChangelog(releases, "1.9.0", now);
    expect([...newFeatures.keys()]).toEqual(["schedules"]);
    const picks = pickDiscoveries(catalog, makeContext(), { ...base, newFeatures, count: 2 });
    expect(picks[0]).toMatchObject({ feature: { id: "schedules" }, newIn: { version: "1.9.0" } });
    expect(newFeaturesFromChangelog(releases, "1.8.0", now).size).toBe(0);
  });
});
