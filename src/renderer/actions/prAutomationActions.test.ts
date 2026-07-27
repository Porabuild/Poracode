// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, PrWatch, Project } from "@/shared/contracts";

const project: Project = {
  id: "project-1",
  name: "Poracode",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-07-26T00:00:00.000Z",
};

const mocks = vi.hoisted(() => ({
  upsertPrWatch: vi.fn<(input: unknown) => Promise<PrWatch>>(),
  agent: {
    kind: "codex",
    label: "Codex",
    installed: true,
    authState: "authenticated",
    capabilities: {
      models: [{ id: "gpt-5.6", label: "GPT-5.6" }],
      efforts: ["high"],
      modelEfforts: { "gpt-5.6": ["high"] },
      defaultEffort: "high",
      modes: [],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "terminal",
      presentationMode: "gui",
      settingDefs: [],
    },
  } satisfies AgentStatus,
  settings: {
    prWatchDefault: true,
    prAutoMergeDefault: true,
    conflictResolverProvider: "codex",
    conflictResolverModel: "gpt-5.6",
    conflictResolverEffort: "high",
    conflictResolverFast: false,
    conflictResolverPresentationMode: "gui" as const,
    wslConflictResolverProvider: "auto",
    wslConflictResolverModel: "",
    wslConflictResolverEffort: "",
    wslConflictResolverFast: false,
    wslConflictResolverPresentationMode: "gui" as const,
  },
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ upsertPrWatch: mocks.upsertPrWatch }),
}));

vi.mock("@/renderer/state/agentStatusesStore", () => ({
  useAgentStatusesStore: {
    getState: () => ({ agentStatuses: [mocks.agent], wslAgentStatuses: [] }),
  },
}));

vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: {
    getState: () => mocks.settings,
  },
}));

import { applyDefaultPrAutomation } from "./prAutomationActions";

describe("applyDefaultPrAutomation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settings.prWatchDefault = true;
    mocks.settings.prAutoMergeDefault = true;
    mocks.upsertPrWatch.mockImplementation(async (input) => ({
      ...(input as Omit<
        PrWatch,
        | "lastCommentCursor"
        | "lastReviewCommentCursor"
        | "lastReviewCursor"
        | "lastCheckKey"
        | "activeThreadId"
        | "lastError"
      >),
      lastCommentCursor: null,
      lastReviewCommentCursor: null,
      lastReviewCursor: null,
      lastCheckKey: null,
      activeThreadId: null,
      lastError: null,
    }));
  });

  it("enables the configured defaults for a newly created pull request", async () => {
    await applyDefaultPrAutomation({
      project,
      prNumber: 42,
      headBranch: "feature/pr-automation",
      worktreePath: "/repo-worktree",
    });

    expect(mocks.upsertPrWatch).toHaveBeenCalledWith({
      projectId: project.id,
      prNumber: 42,
      headBranch: "feature/pr-automation",
      worktreePath: "/repo-worktree",
      watchEnabled: true,
      autoMerge: true,
      agentKind: "codex",
      config: { model: "gpt-5.6", effort: "high" },
    });
  });

  it("does nothing when both defaults are off", async () => {
    mocks.settings.prWatchDefault = false;
    mocks.settings.prAutoMergeDefault = false;

    await applyDefaultPrAutomation({
      project,
      prNumber: 42,
      headBranch: "feature/pr-automation",
    });

    expect(mocks.upsertPrWatch).not.toHaveBeenCalled();
  });
});
