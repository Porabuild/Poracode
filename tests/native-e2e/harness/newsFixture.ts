import { readFileSync } from "node:fs";
import type { ProviderUsageResponse } from "../../../src/shared/contracts/usage.ts";
import { profileCoreStatsSchema } from "../../../src/shared/contracts/profileResults.ts";

const fixture = JSON.parse(
  readFileSync(
    new URL("../../../protocol/remote/v3/fixtures/client-news-rules.json", import.meta.url),
    "utf8",
  ),
) as {
  stats: Array<{ input: Record<string, unknown> }>;
};

/** Native news stories are opt-in, public-feed reads carry no Harness credential. */
export class NewsFixture {
  enabled = false;
  readonly document = {
    version: 1,
    items: [
      {
        id: "native-public-update",
        kind: "announcement",
        text: { en: "Native public update" },
        action: { type: "whats-new" },
        weight: 5,
      },
      {
        id: "native-crossagents",
        kind: "announcement",
        text: { en: "Choose the Crossagents plugin" },
        action: { type: "feature", feature: "crossagents" },
        weight: 5,
      },
    ],
  };

  prepare(): void {
    this.enabled = true;
  }
  reset(): void {
    this.enabled = false;
  }

  response(routeId: string): unknown {
    if (!this.enabled) return undefined;
    if (routeId === "profile-core-stats") {
      const stats = profileCoreStatsSchema.parse(structuredClone(fixture.stats[1]!.input));
      // Keep the two facts this journey inspects inside the 12-item playlist
      // budget; the shared rule vectors separately exercise all five facts.
      delete stats.insights.topModel;
      delete stats.insights.mostActiveHour;
      stats.totals.longestTaskMs = 0;
      return stats;
    }
    if (routeId === "provider-usage") {
      const now = Date.now();
      return {
        snapshots: [
          {
            providerId: "claude",
            status: "ok",
            fetchedAt: now,
            windows: [
              { id: "weekly", label: "Weekly", usedPercent: 93, resetsAt: now + 3_600_000 },
            ],
          },
        ],
        fromCache: false,
      } satisfies ProviderUsageResponse;
    }
    return undefined;
  }
}
