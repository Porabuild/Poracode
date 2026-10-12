import { prWatchInputSchema } from "@/shared/contracts/prWatch";
import type { ModelSelection } from "@/shared/selectionBinding.schemas";
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
    prAutomationDefault: "merge" as "off" | "fix" | "merge",
    conflictResolverSelection: undefined as ModelSelection | undefined,
    wslConflictResolverSelection: undefined as ModelSelection | undefined,
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
    mocks.settings.conflictResolverSelection = undefined;
    mocks.settings.wslConflictResolverSelection = undefined;
    mocks.settings.prAutomationDefault = "merge";
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

  it.each([
    { model: "uncatalogued" },
    { model: "uncatalogued", effort: "", fast: false, thinking: false, contextSize: "" },
    { model: "uncatalogued", effort: "custom", fast: true, thinking: true, contextSize: "large" },
  ])("sends complete canonical automation config without utility binding: %j", async (actual) => {
    mocks.settings.conflictResolverSelection = {
      ...actual,
      selectionBinding: {
        version: 1,
        kind: "family-member",
        owner: { agentKind: mocks.agent.kind, presentationMode: "gui" },
        model: actual.model,
        inertValues: { fast: false },
      },
    };
    await applyDefaultPrAutomation({ project, prNumber: 42, headBranch: "branch" });
    expect(mocks.upsertPrWatch.mock.calls[0]?.[0]).toMatchObject({ config: actual });
    expect(prWatchInputSchema.parse(mocks.upsertPrWatch.mock.calls[0]?.[0]).config).toStrictEqual(
      actual,
    );
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

  it("watches without merging when fix issues is the default", async () => {
    mocks.settings.prAutomationDefault = "fix";

    await applyDefaultPrAutomation({
      project,
      prNumber: 42,
      headBranch: "feature/pr-automation",
    });

    expect(mocks.upsertPrWatch).toHaveBeenCalledWith(
      expect.objectContaining({
        watchEnabled: true,
        autoMerge: false,
      }),
    );
  });

  it("does nothing when automation defaults to off", async () => {
    mocks.settings.prAutomationDefault = "off";

    await applyDefaultPrAutomation({
      project,
      prNumber: 42,
      headBranch: "feature/pr-automation",
    });

    expect(mocks.upsertPrWatch).not.toHaveBeenCalled();
  });
});
