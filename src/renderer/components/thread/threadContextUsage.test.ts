import { describe, expect, it } from "vitest";
import type { AgentStatus, Thread } from "@/shared/contracts";
import {
  formatTokenCount,
  hasReportedContextUsage,
  resolveThreadContextUsageSummary,
} from "./threadContextUsage";

const baseThread: Thread = {
  id: "thread-1",
  projectId: "project-1",
  title: "Thread",
  agentKind: "claude",
  config: { model: "claude-opus-4-7", contextSize: "200k" },
  status: "idle",
  attention: "none",
  canResumeWithConfig: true,
  presentationMode: "gui",
  archived: false,
  done: false,
  starred: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const baseAgent: AgentStatus = {
  kind: "claude",
  label: "Claude Code",
  installed: true,
  authState: "authenticated",
  capabilities: {
    models: [{ id: "claude-opus-4-7", label: "Opus 4.7" }],
    efforts: [],
    modelEfforts: {},
    contextSizes: [
      { id: "200k", label: "200K" },
      { id: "1m", label: "1M" },
    ],
    defaultContextSize: "200k",
    modes: ["agent"],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "server",
    presentationMode: "gui",
    settingDefs: [],
  },
};

describe("threadContextUsage", () => {
  it("formats compact token counts", () => {
    expect(formatTokenCount(595)).toBe("595");
    expect(formatTokenCount(8_400)).toBe("8.4K");
    expect(formatTokenCount(200_000)).toBe("200K");
    expect(formatTokenCount(1_000_000)).toBe("1M");
  });

  it("combines provider usage with configured context limit", () => {
    const summary = resolveThreadContextUsageSummary({
      thread: baseThread,
      agentStatus: baseAgent,
      reportedUsage: {
        usedTokens: 71_000,
        breakdown: [{ id: "input", label: "Input", tokens: 71_000 }],
      },
    });

    expect(summary.maxTokens).toBe(200_000);
    expect(summary.percent).toBe(36);
    expect(summary.detail).toBe("71K / 200K tokens");
    expect(summary.remainingLabel).toBe("129K");
    expect(summary.breakdown).toEqual([{ id: "input", label: "Input", tokens: 71_000 }]);
  });

  it("keeps provider-reported max authoritative over the selected context intent", () => {
    const summary = resolveThreadContextUsageSummary({
      thread: { ...baseThread, config: { model: "claude-opus-4-7", contextSize: "1m" } },
      agentStatus: baseAgent,
      reportedUsage: { usedTokens: 71_000, maxTokens: 200_000 },
    });

    expect(summary.maxTokens).toBe(200_000);
    expect(summary.detail).toBe("71K / 200K tokens");
    expect(summary.remainingLabel).toBe("129K");
  });

  it("treats zero-token provider context usage as reportable", () => {
    expect(hasReportedContextUsage(undefined)).toBe(false);
    expect(hasReportedContextUsage({})).toBe(false);
    expect(hasReportedContextUsage({ maxTokens: 200_000 })).toBe(false);
    expect(hasReportedContextUsage({ usedTokens: 0, maxTokens: 200_000 })).toBe(true);
    expect(hasReportedContextUsage({ usedTokens: 1, maxTokens: 200_000 })).toBe(true);
  });

  it("infers Cursor-style context suffixes from model ids", () => {
    const summary = resolveThreadContextUsageSummary({
      thread: {
        ...baseThread,
        agentKind: "cursor",
        config: { model: "gpt-5.5[context=272k,reasoning=medium,fast=false]" },
      },
      agentStatus: undefined,
      reportedUsage: undefined,
    });

    expect(summary.maxTokens).toBe(272_000);
    expect(summary.headline).toBe("272K context");
  });
});
