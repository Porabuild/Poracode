// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { UsageSnapshot } from "@poracode/agents-usage";
import { formatCreditBalance, usageStatusText } from "./usageFormat";

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

  it("formats Codex credit balances as credits instead of currency", () => {
    const snapshot: UsageSnapshot = {
      providerId: "codex",
      status: "ok",
      windows: [],
      fetchedAt: 1_700_000_000_000,
      credits: { balance: 796.9 },
    };
    expect(formatCreditBalance({ balance: 796.9 })).toBe("796");
    expect(usageStatusText(snapshot, "Codex", "codex")).toBe("Credits: 796");
  });

  it("does not show an empty Codex credit balance", () => {
    const snapshot: UsageSnapshot = {
      providerId: "codex",
      status: "ok",
      windows: [],
      fetchedAt: 1_700_000_000_000,
      credits: { balance: 0 },
    };
    expect(usageStatusText(snapshot, "Codex", "codex")).toBe("No windows reported");
  });

  it("keeps currency-denominated credit balances as money", () => {
    expect(formatCreditBalance({ balance: 24.5, currency: "USD" })).toBe("$24.50");
  });
});
