import { I18nProvider } from "@lingui/react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ThreadTokenUsage } from "@/shared/contracts/threadTokenUsage";
import { i18n } from "@/renderer/i18n/i18n";
import { ThreadSpendDetails, formatUsd } from "./ThreadSpendDetails";

const usage: ThreadTokenUsage = {
  version: 1,
  members: [
    {
      member: "lead",
      provider: "claude",
      model: "claude-opus-5-5",
      tokens: { input: 20, output: 30_000, cacheRead: 700_000, cacheWrite: 90_000 },
      total: 820_020,
      costUsd: 1.46,
      pricedTotal: 820_020,
    },
    {
      member: "role:builder",
      provider: "codex",
      model: "gpt-6-luna",
      tokens: { input: 40_000, output: 4_000, cacheRead: 150_000, cacheWrite: 0 },
      total: 194_000,
      costUsd: 0.0075,
      pricedTotal: 194_000,
    },
  ],
};
const dbGetThreadTokenUsage = vi.fn<(threadId: string) => Promise<ThreadTokenUsage | null>>(
  async () => usage,
);

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ dbGetThreadTokenUsage }),
  isRemoteSession: () => false,
}));

describe("ThreadSpendDetails", () => {
  it("lists each crew member's tokens and estimated dollars with the thread total", async () => {
    render(
      <I18nProvider i18n={i18n}>
        <ThreadSpendDetails
          threadId="thread-1"
          refreshKey={1}
          crewBinding={{
            version: 1,
            policy: "crew-only",
            roles: [
              {
                id: "builder",
                label: "Builder",
                selection: { agentKind: "codex", model: "gpt-6-luna" },
              },
            ],
          }}
        />
      </I18nProvider>,
    );
    expect(await screen.findByText("$1.47")).toBeTruthy();
    expect(screen.getByText(/^Lead · /u)).toBeTruthy();
    expect(screen.getByText(/^Builder · /u)).toBeTruthy();
    expect(screen.getByText("<$0.01")).toBeTruthy();
    expect(screen.getByText(/820K tokens · cached 700K · written 90K · output 30K/u)).toBeTruthy();
    expect(screen.getByText("Estimated at list prices.")).toBeTruthy();
    expect(dbGetThreadTokenUsage).toHaveBeenCalledWith("thread-1");
  });

  it("formats sub-cent and regular amounts", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.004)).toBe("<$0.01");
    expect(formatUsd(2.236)).toBe("$2.24");
  });
});
