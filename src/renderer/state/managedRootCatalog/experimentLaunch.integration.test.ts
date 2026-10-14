import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteClientError, RemoteDesktopClient } from "@/shared/remote/client";
import type { RemoteExperimentAuthority } from "@/host/remote/remoteAccessServerTypes";
import { getSqlite } from "@/host/db/connection";
import { useAppStore } from "@/renderer/state/appStore";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { launchExperiment } from "@/renderer/actions/experimentActions";
import {
  __resetManagedExperimentAuthorityForTest,
  hydrateManagedExperimentState,
  installManagedExperimentAuthorityRuntime,
} from "@/renderer/state/managedRootCatalog/rootExperimentAuthority";
import { __resetManagedRootLaunchMetadataCapabilityForTest } from "@/renderer/state/managedRootCatalog/rootLaunchMetadataCapability";
import {
  activate,
  hostThreadRow,
  setupManagedRootFixture,
  supervisorTrace,
  teardownManagedRootFixture,
  type FixtureOverrides,
} from "./managedRootFixture";

/**
 * Launch evidence chain for experiment candidates over the REAL authority:
 * `launchExperiment` (the production renderer action) drives a real
 * `RemoteAccessServer` + SQLite + managed loopback client, and the actual
 * `performInitialThreadLaunch` performs the candidate start. Stubbed
 * boundaries:
 *
 * - `callSupervisor` (the supervisor/provider boundary; see the fixture) —
 *   including the generic passthrough `startThread` receipt-guarded leg it
 *   backs;
 * - the local-shell `createExperimentWorktrees` preload procedure (a
 *   main-process git worktree operation, not a durable-authority surface);
 * - `refreshGitProject` (display-only git panel refresh).
 *
 * Proven here end to end: the create+candidate rows are acknowledged BEFORE
 * the worktree preparation runs, the worktree results are committed (the
 * prepared-candidates replace is acknowledged) BEFORE the generic
 * receipt-guarded `startThread`, there is no duplicate managed create+launch,
 * the host rows keep their canonical/runtime columns, and an unconfirmed
 * preparation never reaches a launch.
 */

// Display-only git panel refresh: incidental to the launch evidence chain.
// The module's local store helpers stay real; only the refresh entry is stubbed.
vi.mock("@/renderer/state/gitRefresh", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/state/gitRefresh")>()),
  refreshGitProject: vi.fn<() => void>(),
}));

/**
 * Minimal stand-in for the production `experimentAuthority` port
 * (`BackendDesktopServices`): the supervisor seams it composes are the fixture
 * stub, so the per-thread mutation lock is a promise chain and confirmed
 * retirement is the stub's answer for `closeThreadConfirmed`.
 */
const originalExperimentCommand = RemoteDesktopClient.prototype.sendExperimentCommand;
const threadMutationLocks = new Map<string, Promise<unknown>>();
const fixtureAuthority: RemoteExperimentAuthority = {
  runThreadMutation: async (threadId, operation) => {
    const previous = threadMutationLocks.get(threadId) ?? Promise.resolve();
    const run = previous.then(operation, operation);
    threadMutationLocks.set(threadId, run);
    try {
      return await run;
    } finally {
      if (threadMutationLocks.get(threadId) === run) threadMutationLocks.delete(threadId);
    }
  },
  retireThread: async () => {
    // The fixture supervisor proves nothing was live (never-launched
    // candidates) — the same shape as the production port's
    // `closeThreadConfirmed` seam.
    return true;
  },
};

type SendExperimentCommand = (
  this: RemoteDesktopClient,
  command: unknown,
  options?: { readonly commandId?: string },
) => Promise<unknown>;

function patchSendExperimentCommand(patch: SendExperimentCommand): SendExperimentCommand {
  const prototype = RemoteDesktopClient.prototype as unknown as {
    sendExperimentCommand: SendExperimentCommand;
  };
  const original = prototype.sendExperimentCommand;
  prototype.sendExperimentCommand = patch;
  return original;
}

function hostReceipts(): Array<{ command_id: string; route: string; state: string }> {
  return getSqlite()
    .prepare("SELECT command_id, route, state FROM remote_command_receipts ORDER BY created_at ASC")
    .all() as Array<{ command_id: string; route: string; state: string }>;
}

async function waitForProjectPainted(): Promise<void> {
  await vi.waitFor(() =>
    expect(useAppStore.getState().projects.some((project) => project.id === "p-1")).toBe(true),
  );
}

const LAUNCH_INPUT = {
  projectId: "p-1",
  prompt: "integration launch",
  baseBranch: "main",
  candidates: [
    { agentKind: "claude", config: { model: "sonnet" }, presentationMode: "gui" as const },
    { agentKind: "codex", config: { model: "gpt-5" }, presentationMode: "gui" as const },
  ],
};

describe("experiment candidate launch over the real host authority", () => {
  beforeEach(async () => {
    await setupManagedRootFixture();
    useSharedSettings.setState({ titleGenProvider: "disabled" });
  });

  afterEach(async () => {
    __resetManagedExperimentAuthorityForTest();
    __resetManagedRootLaunchMetadataCapabilityForTest();
    await teardownManagedRootFixture();
  });

  it("launches candidates only after the confirmed create and the confirmed prepared rows", async () => {
    const timeline: string[] = [];
    const originalSend = patchSendExperimentCommand(function (command, options) {
      const kind = (command as { kind?: string }).kind ?? "unknown";
      timeline.push(`send:${kind}`);
      return originalSend.call(this, command, options).then(
        (result) => {
          timeline.push(`ack:${kind}`);
          return result;
        },
        (error) => {
          timeline.push(`ack-error:${kind}`);
          throw error;
        },
      );
    });
    const overrides: FixtureOverrides = {
      experimentAuthority: fixtureAuthority,
      preloadProcedures: {
        createExperimentWorktrees: (args: unknown[]) => {
          timeline.push("worktrees:start");
          const payload = args[0] as { candidates: Array<{ threadId: string; branch: string }> };
          const result = {
            candidates: payload.candidates.map((candidate, index) => ({
              threadId: candidate.threadId,
              branch: candidate.branch,
              path: `/tmp/repo/wt-${index + 1}`,
            })),
          };
          timeline.push("worktrees:done");
          return result;
        },
      },
      supervisorObserver: (procedure) => {
        if (procedure === "startThread") timeline.push("supervisor:startThread");
      },
    };
    try {
      await activate(overrides);
      installManagedExperimentAuthorityRuntime();
      await waitForProjectPainted();

      const experimentId = await launchExperiment(LAUNCH_INPUT);
      expect(experimentId).toBeTruthy();

      // Ordering: the create (record + candidate rows) is acknowledged before
      // any worktree is prepared, and the worktree results are committed (the
      // prepared-candidates replace is acknowledged) before the ONE generic
      // receipt-guarded start per candidate.
      const at = (event: string) => {
        const index = timeline.indexOf(event);
        expect(index, `timeline missing ${event}: [${timeline.join(", ")}]`).toBeGreaterThan(-1);
        return index;
      };
      expect(at("ack:create")).toBeLessThan(at("worktrees:start"));
      expect(at("worktrees:done")).toBeLessThan(at("ack:replace"));
      expect(at("ack:replace")).toBeLessThan(at("supervisor:startThread"));

      // No duplicate managed create+launch: exactly one create command, one
      // start per candidate through the generic passthrough, no experiment
      // command replay, and no other receipted route.
      expect(timeline.filter((event) => event === "send:create")).toHaveLength(1);
      expect(timeline.filter((event) => event === "send:replace")).toHaveLength(1);
      expect(supervisorTrace.startThreadCalls).toBe(2);
      const receipts = hostReceipts();
      expect(receipts.filter((receipt) => receipt.route === "procedure:startThread")).toHaveLength(
        2,
      );
      expect(receipts.filter((receipt) => receipt.route.startsWith("/api/experiments/"))).toEqual([
        {
          command_id: expect.any(String),
          route: expect.stringMatching(/^\/api\/experiments\/[^/]+\/command$/),
          state: "completed",
        },
        {
          command_id: expect.any(String),
          route: expect.stringMatching(/^\/api\/experiments\/[^/]+\/command$/),
          state: "completed",
        },
      ]);
      // The candidate starts rode the generic receipt-guarded passthrough with
      // the stable per-item identity, never the managed-root start route.
      for (const receipt of receipts.filter((entry) => entry.route === "procedure:startThread")) {
        expect(receipt.command_id).toMatch(/^thread-start-item:/);
        expect(receipt.state).toBe("completed");
      }

      // Canonical host rows with protected runtime columns: the experiment
      // writes touched only the worktree/group columns — status, session and
      // config stay exactly as the authority inserted them. (The LOCAL row
      // projection converges through async publishes and is not the evidence
      // here; the durable host row is.)
      const candidates = useAppStore
        .getState()
        .threads.filter((thread) => thread.groupId === experimentId);
      expect(candidates).toHaveLength(2);
      const hostPaths: unknown[] = [];
      for (const thread of candidates) {
        const hostRow = hostThreadRow(thread.id);
        expect(hostRow).toMatchObject({
          id: thread.id,
          project_id: "p-1",
          status: "inactive",
          session_ref: null,
          group_id: experimentId,
          worktree_branch: thread.worktreeBranch,
          starred: 0,
          archived: 0,
        });
        expect(hostRow?.worktree_path).toMatch(/^\/tmp\/repo\/wt-/);
        hostPaths.push(hostRow?.worktree_path);
        expect(JSON.parse(hostRow?.config as string)).toEqual(thread.config);
      }
      expect(hostPaths.sort()).toEqual(["/tmp/repo/wt-1", "/tmp/repo/wt-2"]);

      // A fresh authoritative read projects the confirmed record: prepared
      // (owned) candidates with their worktree paths.
      await expect(hydrateManagedExperimentState()).resolves.toBe(true);
      const record = useExperimentStore.getState().experiments[experimentId!];
      expect(record?.status).toBe("running");
      expect(
        record?.candidates.map(
          (candidate) => [candidate.worktreeState, typeof candidate.worktreePath] as const,
        ),
      ).toEqual([
        ["owned", "string"],
        ["owned", "string"],
      ]);
    } finally {
      patchSendExperimentCommand(originalSend);
      expect(RemoteDesktopClient.prototype.sendExperimentCommand).toBe(originalExperimentCommand);
    }
  }, 120_000);

  it("never starts a candidate when the prepared worktree rows stay unconfirmed", async () => {
    const timeline: string[] = [];
    const originalSend = patchSendExperimentCommand(function (command, options) {
      const kind = (command as { kind?: string }).kind ?? "unknown";
      timeline.push(`send:${kind}`);
      const preparedRows =
        kind === "replace" &&
        Array.isArray((command as { rows?: unknown[] }).rows) &&
        ((command as { rows?: Array<{ worktree?: unknown }> }).rows ?? []).some(
          (row) => row.worktree !== undefined && row.worktree !== null,
        );
      if (preparedRows) {
        // Definite refusal of the prepared-candidates replace: the renderer
        // must treat the preparation as unconfirmed and never launch.
        timeline.push("ack-error:replace");
        return Promise.reject(new RemoteClientError("prepared rows refused", 403, "forbidden"));
      }
      return originalSend
        .call(this, command, options)
        .then((result) => {
          timeline.push(`ack:${kind}`);
          return result;
        })
        .catch((error) => {
          timeline.push(`ack-error:${kind}`);
          throw error;
        });
    });
    const overrides: FixtureOverrides = {
      experimentAuthority: fixtureAuthority,
      preloadProcedures: {
        createExperimentWorktrees: (args: unknown[]) => {
          timeline.push("worktrees:start");
          const payload = args[0] as { candidates: Array<{ threadId: string; branch: string }> };
          timeline.push("worktrees:done");
          return {
            candidates: payload.candidates.map((candidate, index) => ({
              threadId: candidate.threadId,
              branch: candidate.branch,
              path: `/tmp/repo/wt-${index + 1}`,
            })),
          };
        },
      },
      supervisorObserver: (procedure) => {
        if (procedure === "startThread") timeline.push("supervisor:startThread");
      },
    };
    try {
      await activate(overrides);
      installManagedExperimentAuthorityRuntime();
      await waitForProjectPainted();

      // The launch is kept available for recovery, but no candidate was
      // started: the unconfirmed preparation is a hard stop.
      const experimentId = await launchExperiment(LAUNCH_INPUT);
      expect(experimentId).toBeTruthy();

      expect(timeline).not.toContain("supervisor:startThread");
      expect(timeline).toContain("ack:create");
      expect(timeline).toContain("ack-error:replace");
      expect(supervisorTrace.startThreadCalls).toBe(0);

      // The create is durable (the candidate rows exist), but the refused
      // replace left every runtime column and worktree column untouched.
      const candidates = useAppStore
        .getState()
        .threads.filter((thread) => thread.groupId === experimentId);
      expect(candidates).toHaveLength(2);
      for (const thread of candidates) {
        expect(hostThreadRow(thread.id)).toMatchObject({
          id: thread.id,
          project_id: "p-1",
          status: "inactive",
          session_ref: null,
          group_id: experimentId,
          worktree_path: null,
          worktree_branch: thread.worktreeBranch,
        });
      }
      expect(hostReceipts().some((receipt) => receipt.route === "procedure:startThread")).toBe(
        false,
      );
    } finally {
      patchSendExperimentCommand(originalSend);
      expect(RemoteDesktopClient.prototype.sendExperimentCommand).toBe(originalExperimentCommand);
    }
  }, 120_000);
});
