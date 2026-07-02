import { describe, expect, it } from "vitest";
import type { UsageSnapshot } from "@lightcode/agents-usage";
import { usageStatusText } from "./usageFormat";

function authMissingSnapshot(providerId: string): UsageSnapshot {
  return {
    providerId,
    status: "auth-missing",
    windows: [],
    fetchedAt: 1_700_000_000_000,
  };
}

describe("usageStatusText", () => {
  it("does not show Claude usage auth misses as signed out", () => {
    expect(usageStatusText(authMissingSnapshot("claude"), "Claude Code", "claude")).toBe(
      "No data yet",
    );
    expect(usageStatusText(authMissingSnapshot("claude:work"), "Claude Work", "claude:work")).toBe(
      "No data yet",
    );
  });

  it("keeps signed-out copy for other usage providers", () => {
    expect(usageStatusText(authMissingSnapshot("codex"), "Codex", "codex")).toBe("Not signed in");
  });
});
