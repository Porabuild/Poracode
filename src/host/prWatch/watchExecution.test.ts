import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, PrWatch, Project } from "@/shared/contracts";

import { buildPrWatchExecutionDeps } from "./watchExecution";

/** The default gate used by tests that only exercise git resolution. */
const noGate = () => {};

const project: Project = {
  id: "project-1",
  name: "Poracode",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-07-25T00:00:00.000Z",
};

const watch: PrWatch = {
  projectId: project.id,
  prNumber: 42,
  headBranch: "feature/pr-watch",
  watchEnabled: true,
  autoMerge: false,
  agentKind: "codex",
  config: { model: "gpt-5.6" },
  lastCommentCursor: null,
  lastReviewCommentCursor: null,
  lastReviewCursor: null,
  lastCheckKey: null,
  activeThreadId: null,
  lastError: null,
  blockedReason: null,
};

function agentStatus(overrides: Partial<AgentStatus> = {}): AgentStatus {
  return {
    kind: "codex",
    label: "Codex",
    installed: true,
    authState: "authenticated",
    capabilities: {
      models: [{ id: "gpt-5.6", label: "GPT-5.6" }],
      efforts: [],
      modelEfforts: {},
      modes: [],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "terminal",
      presentationMode: "gui",
      settingDefs: [],
    },
    ...overrides,
  } as AgentStatus;
}

function setup(handlers: Partial<Record<string, (payload: unknown) => unknown>> = {}) {
  const call = vi.fn<(name: string, payload: unknown) => Promise<unknown>>(
    async (name, payload) => {
      const handler = handlers[name];
      if (!handler) throw new Error(`unexpected supervisor call: ${name}`);
      return handler(payload);
    },
  );
  const deps = buildPrWatchExecutionDeps({
    // The generic supervisor-call signature is exercised through the real
    // procedure names; the test double is intentionally untyped.
    call: call as never,
    getSharedSettings: () =>
      ({ worktreeStorageMode: "global", worktreeBasePath: "", wslWorktreeBasePath: "" }) as never,
  });
  return { deps, call };
}

describe("resolveWatchAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("confirms an installed, authenticated agent that still offers the model", async () => {
    const { deps } = setup({
      getAgentStatuses: () => ({ windows: [agentStatus()], wsl: [], fromCache: true }),
    });

    await expect(deps.resolveWatchAgent(watch, project)).resolves.toEqual({
      agentKind: "codex",
      config: { model: "gpt-5.6" },
    });
  });

  it("refuses an agent that is no longer installed", async () => {
    const { deps } = setup({
      getAgentStatuses: () => ({
        windows: [agentStatus({ installed: false })],
        wsl: [],
        fromCache: true,
      }),
    });

    await expect(deps.resolveWatchAgent(watch, project)).resolves.toBeNull();
  });

  it("refuses an agent whose GUI surface is not authenticated", async () => {
    const { deps } = setup({
      getAgentStatuses: () => ({
        windows: [agentStatus({ presentationAuthStates: { gui: "missing" } })],
        wsl: [],
        fromCache: true,
      }),
    });

    await expect(deps.resolveWatchAgent(watch, project)).resolves.toBeNull();
  });

  it("refuses an agent that cannot run GUI threads", async () => {
    const { deps } = setup({
      getAgentStatuses: () => ({
        windows: [
          agentStatus({
            capabilities: { ...agentStatus().capabilities, presentationMode: "terminal" },
          }),
        ],
        wsl: [],
        fromCache: true,
      }),
    });

    await expect(deps.resolveWatchAgent(watch, project)).resolves.toBeNull();
  });

  it("keeps an explicit custom model when the live probe omits it", async () => {
    const { deps } = setup({
      getAgentStatuses: () => ({
        windows: [
          agentStatus({
            capabilities: {
              ...agentStatus().capabilities,
              models: [{ id: "gpt-5.7", label: "GPT-5.7" }],
            },
          }),
        ],
        wsl: [],
        fromCache: true,
      }),
    });

    await expect(deps.resolveWatchAgent(watch, project)).resolves.toEqual({
      agentKind: "codex",
      config: { model: "gpt-5.6" },
    });
  });

  it("refuses a watch that never recorded an agent", async () => {
    const { deps, call } = setup();
    const { agentKind: _agentKind, config: _config, ...withoutAgent } = watch;

    await expect(deps.resolveWatchAgent(withoutAgent as PrWatch, project)).resolves.toBeNull();
    expect(call).not.toHaveBeenCalled();
  });

  it("refuses when agent detection fails instead of guessing", async () => {
    const { deps } = setup({
      getAgentStatuses: () => {
        throw new Error("supervisor down");
      },
    });

    await expect(deps.resolveWatchAgent(watch, project)).resolves.toBeNull();
  });
});

describe("ensureWorkContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prefers the recorded worktree when git confirms it is on the PR branch", async () => {
    const { deps } = setup({
      gitListWorktrees: () => ({
        worktrees: [
          { path: "/repo", branch: "main", commit: "a", isMain: true },
          { path: "/repo/.worktrees/other", branch: watch.headBranch, commit: "b", isMain: false },
          { path: "/repo/.worktrees/pr", branch: watch.headBranch, commit: "c", isMain: false },
        ],
      }),
    });

    await expect(
      deps.ensureWorkContext({ ...watch, worktreePath: "/repo/.worktrees/pr" }, project, noGate),
    ).resolves.toEqual({ kind: "worktree", path: "/repo/.worktrees/pr" });
  });

  it("does not trust the recorded path when it is checked out to another branch", async () => {
    // The directory still exists but someone switched it to main; launching
    // there would edit the wrong branch and mark the PR blocker as handled.
    const { deps, call } = setup({
      gitListWorktrees: () => ({
        worktrees: [
          { path: "/repo", branch: "main", commit: "a", isMain: true },
          { path: "/repo/.worktrees/pr", branch: "main", commit: "b", isMain: false },
        ],
      }),
      gitFetch: () => undefined,
      gitAddWorktree: () => ({ path: "/repo/.worktrees/rebuilt" }),
    });

    await expect(
      deps.ensureWorkContext({ ...watch, worktreePath: "/repo/.worktrees/pr" }, project, noGate),
    ).resolves.toEqual({ kind: "worktree", path: "/repo/.worktrees/rebuilt" });
    expect(call.mock.calls.map(([name]) => name)).toContain("gitAddWorktree");
  });

  it("adopts another worktree that already has the PR branch out", async () => {
    const { deps } = setup({
      gitListWorktrees: () => ({
        worktrees: [
          { path: "/repo", branch: "main", commit: "a", isMain: true },
          { path: "/repo/.worktrees/moved", branch: watch.headBranch, commit: "b", isMain: false },
        ],
      }),
    });

    await expect(
      deps.ensureWorkContext({ ...watch, worktreePath: "/gone" }, project, noGate),
    ).resolves.toEqual({ kind: "worktree", path: "/repo/.worktrees/moved" });
  });

  it("uses the main checkout when it is the one on the PR branch", async () => {
    const { deps } = setup({
      gitListWorktrees: () => ({
        worktrees: [{ path: "/repo", branch: watch.headBranch, commit: "a", isMain: true }],
      }),
    });

    await expect(deps.ensureWorkContext(watch, project, noGate)).resolves.toEqual({
      kind: "main-checkout",
    });
  });

  it("re-creates the checkout from the PR branch, fetching first", async () => {
    const { deps, call } = setup({
      gitListWorktrees: () => ({ worktrees: [] }),
      gitFetch: () => undefined,
      gitAddWorktree: () => ({ path: "/repo/.worktrees/rebuilt" }),
    });

    await expect(deps.ensureWorkContext(watch, project, noGate)).resolves.toEqual({
      kind: "worktree",
      path: "/repo/.worktrees/rebuilt",
    });
    expect(call.mock.calls.map(([name]) => name)).toEqual([
      "gitListWorktrees",
      "gitFetch",
      "gitAddWorktree",
    ]);
    // Never fork a new branch: the fix has to push to the branch the PR tracks.
    expect(call.mock.calls[2]?.[1]).toMatchObject({
      branch: watch.headBranch,
      createBranch: false,
    });
  });

  it("honors the project's worktree location override", async () => {
    const { deps, call } = setup({
      gitListWorktrees: () => ({ worktrees: [] }),
      gitFetch: () => undefined,
      gitAddWorktree: () => ({ path: "/repo/.poracode/worktrees/pr-watch" }),
    });

    await deps.ensureWorkContext(
      watch,
      {
        ...project,
        worktreeLocation: { mode: "project-relative" },
      },
      noGate,
    );

    expect(call.mock.calls.find(([name]) => name === "gitAddWorktree")?.[1]).toMatchObject({
      worktreeRoot: "/repo/.poracode/worktrees",
      worktreeOmitRepoDir: true,
    });
  });

  it("still tries the local ref when fetching fails", async () => {
    const { deps } = setup({
      gitListWorktrees: () => ({ worktrees: [] }),
      gitFetch: () => {
        throw new Error("offline");
      },
      gitAddWorktree: () => ({ path: "/repo/.worktrees/rebuilt" }),
    });

    await expect(deps.ensureWorkContext(watch, project, noGate)).resolves.toEqual({
      kind: "worktree",
      path: "/repo/.worktrees/rebuilt",
    });
  });

  it("reports no work context when the branch cannot be checked out", async () => {
    const { deps } = setup({
      gitListWorktrees: () => ({ worktrees: [] }),
      gitFetch: () => undefined,
      gitAddWorktree: () => {
        throw new Error("no such ref");
      },
    });

    await expect(deps.ensureWorkContext(watch, project, noGate)).resolves.toBeNull();
  });
});

describe("ensureWorkContext admission gate", () => {
  it("invokes the gate before the lookup, before the fetch, and before the add-worktree RPC", async () => {
    const events: string[] = [];
    const { deps } = setup({
      gitListWorktrees: () => {
        events.push("gitListWorktrees");
        return { worktrees: [] };
      },
      gitFetch: () => {
        events.push("gitFetch");
        return undefined;
      },
      gitAddWorktree: () => {
        events.push("gitAddWorktree");
        return { path: "/repo/.worktrees/rebuilt" };
      },
    });

    await deps.ensureWorkContext(watch, project, () => {
      events.push("gate");
    });

    expect(events).toEqual([
      "gate",
      "gitListWorktrees",
      "gate",
      "gitFetch",
      "gate",
      "gitAddWorktree",
    ]);
  });

  it("prevents every git RPC when the gate refuses before the lookup", async () => {
    const { deps, call } = setup({});

    await expect(
      deps.ensureWorkContext(watch, project, () => {
        throw new Error("refused");
      }),
    ).rejects.toThrow("refused");
    expect(call).not.toHaveBeenCalled();
  });

  it("prevents the fetch and add-worktree RPCs when the gate refuses after the lookup", async () => {
    let calls = 0;
    const { deps, call } = setup({ gitListWorktrees: () => ({ worktrees: [] }) });

    await expect(
      deps.ensureWorkContext(watch, project, () => {
        calls += 1;
        if (calls > 1) throw new Error("refused-after-lookup");
      }),
    ).rejects.toThrow("refused-after-lookup");
    expect(call.mock.calls.map(([name]) => name)).toEqual(["gitListWorktrees"]);
  });

  it("prevents the add-worktree RPC when the gate refuses after the fetch", async () => {
    let calls = 0;
    const { deps, call } = setup({
      gitListWorktrees: () => ({ worktrees: [] }),
      gitFetch: () => undefined,
    });

    await expect(
      deps.ensureWorkContext(watch, project, () => {
        calls += 1;
        if (calls > 2) throw new Error("refused-after-fetch");
      }),
    ).rejects.toThrow("refused-after-fetch");
    expect(call.mock.calls.map(([name]) => name)).toEqual(["gitListWorktrees", "gitFetch"]);
  });

  it("never lets the swallowed git-error catches mask a gate refusal", async () => {
    let calls = 0;
    const { deps, call } = setup({
      gitListWorktrees: () => ({ worktrees: [] }),
      gitFetch: () => {
        throw new Error("offline");
      },
      gitAddWorktree: () => ({ path: "/repo/.worktrees/rebuilt" }),
    });

    await expect(
      deps.ensureWorkContext(watch, project, () => {
        calls += 1;
        if (calls > 2) throw new Error("refused-after-fetch");
      }),
    ).rejects.toThrow("refused-after-fetch");
    // The offline fetch failure was swallowed by its catch; the gate refusal
    // after it still propagates instead of returning a null context.
    expect(call.mock.calls.map(([name]) => name)).toEqual(["gitListWorktrees", "gitFetch"]);
  });

  it("still reports no work context when git fails after the gate passes", async () => {
    const { deps } = setup({
      gitListWorktrees: () => ({ worktrees: [] }),
      gitFetch: () => undefined,
      gitAddWorktree: () => {
        throw new Error("no such ref");
      },
    });

    await expect(deps.ensureWorkContext(watch, project, noGate)).resolves.toBeNull();
  });
});
