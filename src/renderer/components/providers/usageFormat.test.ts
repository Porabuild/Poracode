// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { UsageSnapshot, UsageWindow } from "@poracode/agents-usage";
import {
  formatCreditBalance,
  formatWindowSecondaryValue,
  formatWindowValue,
  hasDisplayableCredits,
  usageStatusText,
} from "./usageFormat";

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

  it("shows an empty Codex credit balance when no subscription windows are reported", () => {
    const snapshot: UsageSnapshot = {
      providerId: "codex",
      status: "ok",
      windows: [],
      fetchedAt: 1_700_000_000_000,
      credits: { balance: 0 },
    };
    expect(usageStatusText(snapshot, "Codex", "codex")).toBe("Credits: 0");
  });

  it("hides empty credits only while subscription capacity remains", () => {
    const credits = { balance: 0 };
    expect(
      hasDisplayableCredits(credits, [{ id: "weekly", label: "Weekly", usedPercent: 84 }]),
    ).toBe(false);
    expect(hasDisplayableCredits(credits, [])).toBe(true);
    expect(
      hasDisplayableCredits(credits, [{ id: "five-hour", label: "5-hour", usedPercent: 100 }]),
    ).toBe(true);
  });

  it("keeps currency-denominated credit balances as money", () => {
    expect(formatCreditBalance({ balance: 24.5, currency: "USD" })).toBe("$24.50");
  });
});

describe("formatWindowValue / formatWindowSecondaryValue", () => {
  const usdWindow: UsageWindow = {
    id: "session-5h",
    label: "5-hour limit",
    usedPercent: 100,
    unit: "usd",
    currency: "USD",
    used: 3.08,
    limit: 3,
  };

  it("shows percent as the primary value for USD windows", () => {
    expect(formatWindowValue(usdWindow)).toBe("100%");
    expect(formatWindowValue({ ...usdWindow, usedPercent: 56.8 })).toBe("57%");
  });

  it("puts the dollar spend in the muted secondary label", () => {
    expect(formatWindowSecondaryValue(usdWindow)).toBe("$3.08 / $3.00");
    expect(
      formatWindowSecondaryValue({
        id: "monthly",
        label: "Monthly credits",
        usedPercent: 38,
        unit: "usd",
        currency: "USD",
        used: 3.83,
        limit: 10,
      }),
    ).toBe("$3.83 / $10.00");
  });

  it("omits secondary when there is no spend amount", () => {
    expect(
      formatWindowSecondaryValue({
        id: "weekly",
        label: "Weekly",
        usedPercent: 12,
      }),
    ).toBeUndefined();
  });

  it("keeps percent primary for credit windows", () => {
    expect(
      formatWindowValue({
        id: "monthly",
        label: "Credits",
        usedPercent: 12.8,
        unit: "credits",
        used: 766,
        limit: 6000,
      }),
    ).toBe("13%");
  });

  it("puts credit counts in the muted secondary label", () => {
    expect(
      formatWindowSecondaryValue({
        id: "monthly",
        label: "Credits",
        usedPercent: 12.8,
        unit: "credits",
        used: 766,
        limit: 6000,
      }),
    ).toBe("766 / 6,000");
    expect(
      formatWindowSecondaryValue({
        id: "monthly",
        label: "Credits",
        usedPercent: 5,
        unit: "credits",
        used: 300,
      }),
    ).toBe("300");
  });
});
