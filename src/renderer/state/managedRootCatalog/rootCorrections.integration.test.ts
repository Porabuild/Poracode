import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { DEFAULT_TERMINAL_SIZE, type Project } from "@/shared/contracts";
import { RemoteDesktopClient } from "@/shared/remote/client";
import { dbUpsertProject } from "@/host/db";
import { getSqlite } from "@/host/db/connection";
import { useAppStore } from "@/renderer/state/appStore";
import { resetDesktopLoopbackIntakeForTest } from "@/renderer/clientRuntime";
import {
  resyncManagedRootCatalogOrder,
  __resetManagedRootCatalogRuntimeForTest,
} from "@/renderer/state/managedRootCatalog/rootCatalogAdapter";
import {
  applyRootCatalogProjectRows,
  applyRootCatalogThreadRows,
  removeRootCatalogThreads,
} from "@/renderer/state/managedRootCatalog/rootCatalogRows";
import {
  dispatchManagedRootProjectReorder,
  dispatchManagedRootThreadGroupIntents,
  dispatchManagedRootThreadReorder,
} from "@/renderer/state/managedRootCatalog/rootCatalogIntents";
import { sendManagedRootProjectCommand } from "@/renderer/state/managedRootCatalog/rootCatalogCommands";
import {
  managedRootSupportsRuntimeHistoryNotices,
  readManagedRootHistoryPage,
} from "@/renderer/state/managedRootCatalog/rootHistory";
import {
  hasHydratedThreadRuntimeItems,
  hydrateThreadRuntimeItems,
  loadOlderThreadRuntimeItems,
} from "@/renderer/state/chatRuntimePersister";
import { renameThread } from "@/renderer/actions/threadActions";
import { deleteWorktreeGroup } from "@/renderer/actions/worktreeActions";
import { applyForwardedRemoteThreadCommand } from "@/renderer/actions/remoteThreadCommandApplication";
import { performInitialThreadLaunch } from "@/renderer/actions/threadLaunchActions";
import { isRemoteCommandOutcomeUncertainError } from "@/renderer/actions/threadCommandOutcomeActions";
import {
  acknowledgeThreadHistoryNotice,
  requestThreadHistoryGap,
} from "@/renderer/state/remote/historyNoticeActions";
import {
  readThreadHistoryNotice,
  recordThreadHistoryNoticeRead,
} from "@/renderer/state/remote/historyNoticeStore";
import {
  consumePendingManagedRootLaunch,
  getManagedRootCatalogStatus,
  notePendingManagedRootLaunch,
  peekPendingManagedRootLaunch,
} from "@/renderer/state/managedRootCatalog/rootCatalogStore";
import {
  activate,
  externalClientFor,
  forwardedCommands,
  hostManualProjectOrder,
  hostManualThreadOrder,
  hostSortOrder,
  hostThreadRow,
  preloadCalls,
  rootProjects,
  rootThreads,
  seedCompletedTurns,
  seedGap,
  seedHomeProjectRow,
  seedProject,
  seedRuntimeItems,
  seedThread,
  setupManagedRootFixture,
  socketUrls,
  supervisorTrace,
  teardownManagedRootFixture,
  threadRow,
} from "./managedRootFixture";

/**
 * Consolidated renderer-root corrections over the REAL HTTP + SQLite authority
 * (F1-F12). Every managed-root read/write goes through the real
 * `RemoteAccessServer` routes and the real managed loopback client; the
 * forwarded-command cases compose the production
 * `applyForwardedRemoteThreadCommand` callback exactly as `app.tsx` does.
 *
 * The shared fixture (fixture server, loopback intake, seeds, lifecycle) was
 * extracted verbatim into `managedRootFixture.ts`; only its supervisor stub
 * and local-shell preload seams are stubbed.
 */

beforeEach(async () => {
  await setupManagedRootFixture();
});

afterEach(async () => {
  await teardownManagedRootFixture();
});

describe("F1 forwarded-command composition (production callback)", () => {
  it("applies a host-forwarded rename locally without echoing a command back", async () => {
    await activate({
      dispatchThreadCommand: async (command) => {
        // EXACTLY the production app.tsx callback composition.
        applyForwardedRemoteThreadCommand(command as never);
        return true;
      },
    });
    expect(threadRow("t-1")).toBeDefined();

    renameThread("t-1", "Renamed");
    await vi.waitFor(() => expect(threadRow("t-1")?.title).toBe("Renamed"), { timeout: 10_000 });
    await new Promise((resolve) => setTimeout(resolve, 800));

    // The host applied and forwarded the rename exactly once; the production
    // host-origin fence prevented the command from being re-dispatched.
    expect(forwardedCommands).toEqual(["rename"]);
    expect(hostThreadRow("t-1")?.title).toBe("Renamed");
  }, 60_000);
});

describe("F2 synthetic Home row protection", () => {
  it("keeps the renderer's Home project when the host DB has no Home row", async () => {
    const home = useAppStore.getState().ensureHomeProject({ kind: "posix", path: "/tmp/home" });
    expect(home.id).toBe(HOME_PROJECT_ID);
    await activate();
    // Wait for the project inventory + confirmation-gated deletion pass.
    await vi.waitFor(() => expect(rootThreads().length).toBe(1), { timeout: 15_000 });
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    expect(useAppStore.getState().projects.some((project) => project.id === HOME_PROJECT_ID)).toBe(
      true,
    );
  }, 60_000);

  it("applies a host-created canonical Home row over the synthetic entry", () => {
    seedHomeProjectRow();
    applyRootCatalogProjectRows([
      {
        id: HOME_PROJECT_ID,
        name: "Home",
        location: { kind: "posix", path: "/tmp/home" },
        disabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(useAppStore.getState().projects.some((project) => project.id === HOME_PROJECT_ID)).toBe(
      true,
    );
  });
});

describe("F3 centralized root create+launch ownership", () => {
  it("creates a fork/handoff-shaped row on the host through the production launch entry", async () => {
    await activate();
    const row = useAppStore.getState().createThread({
      projectId: "p-1",
      agentKind: "claude",
      config: { model: "sonnet" },
      prompt: "forked",
      title: "Original (fork)",
      groupId: "g-1",
      groupName: "Original",
    });
    await performInitialThreadLaunch({
      thread: row,
      projectLocation: { kind: "posix", path: "/tmp/repo" },
      prompt: "forked",
      initialSize: { cols: 80, rows: 24 },
    });
    const hostRow = hostThreadRow(row.id);
    expect(hostRow?.id).toBe(row.id);
    expect(hostRow?.title).toBe("Original (fork)");
    expect(hostRow?.group_id).toBe("g-1");
    // A completed create+launch retires the pending intent: a later message on
    // this thread must never replay the launch operation.
    expect(consumePendingManagedRootLaunch(row.id)).toBeUndefined();
  }, 60_000);

  it("carries the worktree launch fields through the SDK start entry", async () => {
    await activate();
    const row = useAppStore.getState().createThread({
      threadId: "t-wt-launch",
      projectId: "p-1",
      agentKind: "claude",
      config: { model: "sonnet" },
      prompt: "worktree launch",
      worktreePath: "/tmp/repo-wt",
      worktreeBranch: "feat/wt",
      worktreeProvisioning: true,
    });
    await performInitialThreadLaunch({
      thread: row,
      projectLocation: { kind: "posix", path: "/tmp/repo-wt" },
      prompt: "worktree launch",
      initialSize: { cols: 90, rows: 30 },
    });
    expect(hostThreadRow("t-wt-launch")).toMatchObject({
      worktree_path: "/tmp/repo-wt",
      worktree_branch: "feat/wt",
    });
    expect(supervisorTrace.lastStartThreadPayload).toMatchObject({
      projectLocation: expect.objectContaining({ path: expect.stringContaining("repo-wt") }),
    });
  }, 60_000);

  it("creates a conflict-resolver-shaped row on the host through the production launch entry", async () => {
    await activate();
    const row = useAppStore.getState().createThread({
      projectId: "p-1",
      agentKind: "claude",
      config: { model: "sonnet" },
      prompt: "resolve conflicts",
      presentationMode: "terminal",
    });
    await performInitialThreadLaunch({
      thread: row,
      projectLocation: { kind: "posix", path: "/tmp/repo" },
      prompt: "resolve conflicts",
      initialSize: { cols: 80, rows: 24 },
    });
    expect(hostThreadRow(row.id)?.id).toBe(row.id);
  }, 60_000);

  it("survives a retryable pre-effect failure and creates the row on retry", async () => {
    await activate();
    const row = useAppStore.getState().createThread({
      projectId: "p-missing",
      agentKind: "claude",
      config: { model: "sonnet" },
      prompt: "retry me",
    });
    const attempt = (threadId: string, projectId: string) =>
      performInitialThreadLaunch({
        thread: { ...useAppStore.getState().threads.find((t) => t.id === threadId)!, projectId },
        projectLocation: { kind: "posix", path: "/tmp/repo" },
        prompt: "retry me",
        initialSize: { cols: 80, rows: 24 },
      });
    await expect(attempt(row.id, "p-missing")).rejects.toThrow(/not found|project/i);
    // Definite pre-effect failure: the host row was never created and the
    // pending intent survived for an explicit retry.
    expect(hostThreadRow(row.id)).toBeUndefined();
    expect(consumePendingManagedRootLaunch(row.id)).toEqual({
      isNewWorktree: false,
      commandId: expect.any(String),
    });
    notePendingManagedRootLaunch(row.id, false);

    await attempt(row.id, "p-1");
    expect(hostThreadRow(row.id)?.id).toBe(row.id);
  }, 60_000);

  it("retains the durable row and the SAME operation across an uncertain retry with one external start", async () => {
    supervisorTrace.startThreadFailures = 1;
    await activate();
    const row = useAppStore.getState().createThread({
      projectId: "p-1",
      agentKind: "claude",
      config: { model: "sonnet" },
      prompt: "uncertain",
    });
    const prototype = RemoteDesktopClient.prototype as unknown as {
      sendThreadCommand: (
        command: unknown,
        options?: { readonly commandId?: string },
      ) => Promise<unknown>;
    };
    const originalSend = prototype.sendThreadCommand;
    prototype.sendThreadCommand = function (
      command: unknown,
      options?: { readonly commandId?: string },
    ) {
      if ((command as { kind?: string }).kind === "start") {
        supervisorTrace.startThreadCommandIds.push(options?.commandId ?? null);
      }
      return originalSend.call(this, command, options);
    };
    const attempt = () =>
      performInitialThreadLaunch({
        thread: useAppStore.getState().threads.find((t) => t.id === row.id)!,
        projectLocation: { kind: "posix", path: "/tmp/repo" },
        prompt: "uncertain",
        initialSize: { cols: 80, rows: 24 },
      });
    try {
      const first = await attempt().then(
        () => ({ ok: true as const }),
        (error: unknown) => ({
          ok: false as const,
          error,
          uncertain: isRemoteCommandOutcomeUncertainError(error),
        }),
      );
      // Evidence 1: the host retained the durable row instead of rolling it
      // back, so absence can never stand in for "no effect".
      expect(first.ok).toBe(false);
      expect(first.ok === false && first.uncertain).toBe(true);
      expect(hostThreadRow(row.id)?.id).toBe(row.id);

      // Evidence 2: the pending create+launch intent kept the SAME operation id
      // and the exact original body for the explicit retry.
      const retained = peekPendingManagedRootLaunch(row.id);
      expect(retained).toBeDefined();
      expect(retained?.commandId).toBe(supervisorTrace.startThreadCommandIds[0]);
      expect(retained?.replay?.threadId).toBe(row.id);

      const second = await attempt().then(
        () => ({ ok: true as const }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      // Evidence 3: exactly ONE external start across the retry, and the same
      // receipt identity; the host refused to re-run the uncertain operation.
      expect(second.ok).toBe(false);
      expect(supervisorTrace.startThreadCalls).toBe(1);
      expect(supervisorTrace.startThreadCommandIds.length).toBe(2);
      expect(supervisorTrace.startThreadCommandIds[0]).toBe(
        supervisorTrace.startThreadCommandIds[1],
      );
      const receipts = getSqlite()
        .prepare("SELECT state FROM remote_command_receipts WHERE route LIKE '%/command'")
        .all() as Array<{ readonly state: string }>;
      expect(receipts).toEqual([{ state: "uncertain" }]);

      // The loopback leg drops: the retry fails locally ("not connected"), a
      // definite non-dispatch for the new attempt but NOT evidence about the
      // earlier uncertain operation. The retained operation keeps its exact id
      // and body; no third dispatch happens while the leg is down.
      resetDesktopLoopbackIntakeForTest();
      const third = await attempt().then(
        () => ({ ok: true as const }),
        (error: unknown) => ({
          ok: false as const,
          error,
          uncertain: isRemoteCommandOutcomeUncertainError(error),
        }),
      );
      expect(third.ok).toBe(false);
      expect(third.ok === false && third.uncertain).toBe(false);
      const afterLegDown = peekPendingManagedRootLaunch(row.id);
      expect(afterLegDown?.commandId).toBe(supervisorTrace.startThreadCommandIds[0]);
      expect(afterLegDown?.replay?.threadId).toBe(row.id);
      expect(supervisorTrace.startThreadCommandIds).toHaveLength(2);
    } finally {
      prototype.sendThreadCommand = originalSend;
    }
  }, 60_000);
});

describe("F4/F5 group and worktree-group host commands", () => {
  it("writes set-group/clear-group durably through the host", async () => {
    await activate();
    expect(threadRow("t-1")).toBeDefined();
    dispatchManagedRootThreadGroupIntents([
      { threadId: "t-1", groupId: "g-1", groupName: "Group One" },
    ]);
    await vi.waitFor(() => expect(hostThreadRow("t-1")?.group_id).toBe("g-1"), {
      timeout: 10_000,
    });
    expect(hostThreadRow("t-1")?.group_name).toBe("Group One");

    dispatchManagedRootThreadGroupIntents([{ threadId: "t-1" }]);
    await vi.waitFor(() => expect(hostThreadRow("t-1")?.group_id).toBeNull(), { timeout: 10_000 });
    expect(hostThreadRow("t-1")?.group_name).toBeNull();
  }, 60_000);

  it("removes a root worktree group through the host command and applies local deletes", async () => {
    seedThread("t-wt", "p-1", "/tmp/repo-wt");
    await activate();
    await vi.waitFor(() => expect(rootThreads().length).toBe(2), { timeout: 15_000 });

    deleteWorktreeGroup("p-1", "/tmp/repo-wt", ["t-wt"]);
    await vi.waitFor(() => expect(hostThreadRow("t-wt")).toBeUndefined(), { timeout: 10_000 });
    await vi.waitFor(
      () => expect(rootThreads().some((thread) => thread.id === "t-wt")).toBe(false),
      { timeout: 10_000 },
    );
  }, 60_000);
});

describe("F6 bounded managed-root history and notices", () => {
  it("hydrates items/turns over bounded HTTP, continues ct1 and older items, and never uses the local reads", async () => {
    seedRuntimeItems("t-1", 700);
    seedCompletedTurns("t-1", 450);
    await activate();
    await vi.waitFor(() => expect(threadRow("t-1")).toBeDefined(), { timeout: 15_000 });

    const page = await readManagedRootHistoryPage("t-1");
    expect(page.reads).toBe("bounded-v1");
    expect(page.runtimeItems.length).toBeGreaterThan(0);
    expect(page.completedTurns.length).toBe(200);
    expect(page.completedTurnsNextCursor).not.toBeNull();

    await hydrateThreadRuntimeItems("t-1");
    expect(hasHydratedThreadRuntimeItems("t-1")).toBe(true);
    expect(useAppStore.getState().runtimeItemIdsByThread["t-1"]?.length).toBeGreaterThan(0);

    // Older items continue over the SAME bounded route (no local-DB page read),
    // and the registered continuation extends the completed-turn level.
    await loadOlderThreadRuntimeItems("t-1");
    await loadOlderThreadRuntimeItems("t-1");
    const turns = useAppStore.getState().runtimeCompletedTurnsByThread["t-1"] ?? [];
    expect(turns.length).toBeGreaterThan(200);
    expect(turns.length).toBeLessThanOrEqual(450);

    expect(preloadCalls).not.toContain("dbGetThreadCompletedTurns");
    expect(preloadCalls).not.toContain("dbGetThreadRuntimeItemsPage");
  }, 90_000);

  it("treats an unpersisted root row as an empty transcript instead of a failed load", async () => {
    await activate();
    useAppStore.getState().createThread({
      threadId: "t-unpersisted",
      projectId: "p-1",
      agentKind: "claude",
      config: { model: "sonnet" },
      prompt: "launch in flight",
    });

    await hydrateThreadRuntimeItems("t-unpersisted");

    expect(hasHydratedThreadRuntimeItems("t-unpersisted")).toBe(true);
    expect(useAppStore.getState().runtimeItemIdsByThread["t-unpersisted"] ?? []).toEqual([]);
    expect(useAppStore.getState().runtimeHydrationStatus["t-unpersisted"] ?? null).not.toBe(
      "failed",
    );
  });

  it("declares notices=v1 on the first socket and completes gap read/ack over the managed client", async () => {
    seedThread("t-gap");
    seedGap("t-gap");
    await activate({ withNotices: true });
    expect(socketUrls.length).toBeGreaterThan(0);
    expect(new URL(socketUrls[0]!).searchParams.get("notices")).toBe("v1");

    await vi.waitFor(() => expect(threadRow("t-gap")).toBeDefined(), { timeout: 15_000 });
    await vi.waitFor(() => expect(managedRootSupportsRuntimeHistoryNotices()).toBe(true), {
      timeout: 10_000,
    });

    // The declared read of a thread with an open gap is refused; the managed
    // root surfaces the explicit recovery path instead of a silent failure.
    await hydrateThreadRuntimeItems("t-gap");
    expect(readThreadHistoryNotice("t-gap")?.needsReview).toBe(true);

    expect(await requestThreadHistoryGap("t-gap")).toBe("ok");
    const outcome = await acknowledgeThreadHistoryNotice("t-gap");
    expect(outcome).toBe("applied");
    expect(
      getSqlite().prepare("SELECT 1 FROM thread_runtime_gaps WHERE thread_id = 't-gap'").get(),
    ).toBeUndefined();

    // After acknowledgement the declared reader gets the retained transcript
    // plus the durable notice over the same managed client.
    await hydrateThreadRuntimeItems("t-gap");
    await vi.waitFor(
      () => expect(readThreadHistoryNotice("t-gap")?.notice?.refusedEvents).toBe(3),
      { timeout: 10_000 },
    );
  }, 60_000);
});

describe("F7 title, workspace and launch size preservation", () => {
  it("sends the explicit title, workspace and exact initial size in the gated start body", async () => {
    seedHomeProjectRow();
    await activate();
    const row = useAppStore.getState().createThread({
      projectId: HOME_PROJECT_ID,
      workspaceId: "w-1",
      agentKind: "claude",
      config: { model: "sonnet" },
      prompt: "home thread",
      title: "Home Thread",
    });
    await performInitialThreadLaunch({
      thread: row,
      projectLocation: { kind: "posix", path: "/tmp/home" },
      prompt: "home thread",
      initialSize: { cols: 132, rows: 43 },
    });
    const hostRow = hostThreadRow(row.id);
    expect(hostRow?.title).toBe("Home Thread");
    // The advertised `threadLaunchMetadata` capability carries the workspace and
    // the client's exact geometry in the ONE start operation.
    expect(hostRow?.workspace_id).toBe("w-1");
    expect(supervisorTrace.lastStartThreadPayload).toMatchObject({
      threadId: row.id,
      initialSize: { cols: 132, rows: 43 },
    });
  }, 60_000);

  it("keeps the narrow set-workspace fallback on a host without the launch-metadata capability", async () => {
    seedHomeProjectRow();
    await activate();
    const prototype = RemoteDesktopClient.prototype as unknown as {
      environment: () => Promise<{
        readonly capabilities?: Record<string, unknown>;
        readonly [key: string]: unknown;
      }>;
    };
    const originalEnvironment = prototype.environment;
    prototype.environment = function (this: RemoteDesktopClient) {
      return originalEnvironment.call(this).then((descriptor) => {
        const { threadLaunchMetadata: _unadvertised, ...capabilities } =
          descriptor.capabilities ?? {};
        return { ...descriptor, capabilities };
      });
    };
    try {
      const row = useAppStore.getState().createThread({
        projectId: HOME_PROJECT_ID,
        workspaceId: "w-2",
        agentKind: "claude",
        config: { model: "sonnet" },
        prompt: "legacy host thread",
        title: "Legacy Host",
      });
      await performInitialThreadLaunch({
        thread: row,
        projectLocation: { kind: "posix", path: "/tmp/home" },
        prompt: "legacy host thread",
        initialSize: { cols: 132, rows: 43 },
      });
      // The ungated metadata is NOT claimed: the host launches at its default
      // size and the workspace follows over the existing narrow command.
      expect(supervisorTrace.lastStartThreadPayload).toMatchObject({
        threadId: row.id,
        initialSize: DEFAULT_TERMINAL_SIZE,
      });
      await vi.waitFor(() => expect(hostThreadRow(row.id)?.workspace_id).toBe("w-2"), {
        timeout: 10_000,
      });
    } finally {
      prototype.environment = originalEnvironment;
    }
  }, 60_000);
});

describe("F8 full bounded order recovery", () => {
  it("recovers authoritative order beyond page 1 after a failed order intent", async () => {
    for (let index = 0; index < 250; index += 1) {
      seedThread(`t-${index.toString(16).padStart(4, "0")}`);
    }
    await activate();
    await vi.waitFor(() => expect(rootThreads().length).toBe(251), { timeout: 30_000 });

    // Simulate a rejected optimistic move: reverse the root rows locally.
    useAppStore.setState((state) => ({ threads: [...state.threads].reverse() }));
    // The host no longer knows this anchor (deleted outside the catalog), so
    // the relative order intent fails and the production catch must recover
    // the FULL authoritative order, not just page 1.
    getSqlite().prepare("DELETE FROM threads WHERE id = 't-00f8'").run();
    dispatchManagedRootThreadReorder("t-0000", "t-00f8", "after");

    const authoritative = [...rootThreads().map((thread) => thread.id)]
      .filter((id) => id !== "t-00f8")
      .sort();
    await vi.waitFor(
      () => {
        const ids = rootThreads().map((thread) => thread.id);
        expect(ids.filter((id) => id !== "t-00f8")).toEqual(authoritative);
      },
      { timeout: 30_000 },
    );
    // The row the host no longer has is not part of the authoritative order:
    // it trails until the membership gate confirms removal (it may already be
    // gone), and no id is duplicated by the recovery.
    const recovered = rootThreads().map((thread) => thread.id);
    expect(new Set(recovered).size).toBe(recovered.length);
  }, 120_000);
});

describe("I2 manual-order convergence", () => {
  it("converges thread and project manual order from ordinary bounded passes", async () => {
    seedThread("t-a", "p-1", undefined, 0);
    seedThread("t-b", "p-1", undefined, 1);
    seedThread("t-c", "p-1", undefined, 2);
    seedProject("p-a", 0);
    seedProject("p-b", 1);
    seedProject("p-c", 2);
    const server = await activate();
    await vi.waitFor(() => expect(rootThreads().length).toBe(4), { timeout: 15_000 });
    await vi.waitFor(() => expect(rootProjects().length).toBe(4), { timeout: 15_000 });
    const localThreads = () => rootThreads().map((thread) => thread.id);
    const localProjects = () => rootProjects().map((project) => project.id);
    await vi.waitFor(() => expect(localThreads()).toEqual(hostManualThreadOrder()), {
      timeout: 20_000,
    });
    await vi.waitFor(() => expect(localProjects()).toEqual(hostManualProjectOrder()), {
      timeout: 20_000,
    });

    const external = await externalClientFor(server);
    await external.sendThreadCommand(
      {
        kind: "reorder",
        threadId: "t-c",
        projectId: "p-1",
        threadIds: ["t-c"],
        targetThreadId: "t-a",
        placement: "before",
      },
      { commandId: crypto.randomUUID() },
    );
    expect(hostSortOrder("t-c")).toBeLessThan(hostSortOrder("t-a"));
    // The membership-driven manual paint pass converges the host order.
    await vi.waitFor(() => expect(localThreads()).toEqual(hostManualThreadOrder()), {
      timeout: 20_000,
    });

    // A new host thread is prepended by the host manual order (negative
    // sort_order) even though it arrives after the initial paint.
    await external.sendThreadCommand(
      {
        kind: "start",
        threadId: "t-new",
        projectId: "p-1",
        agentKind: "claude",
        config: { model: "sonnet" },
        prompt: "external new thread",
      },
      { commandId: crypto.randomUUID() },
    );
    await vi.waitFor(() => expect(localThreads()[0]).toBe("t-new"), { timeout: 20_000 });
    await vi.waitFor(() => expect(localThreads()).toEqual(hostManualThreadOrder()), {
      timeout: 20_000,
    });
    const manual = await external.boundedShellSnapshot({ order: "manual", threadLimit: 100 });
    const authoritative =
      manual.negotiation === "bounded" ? manual.page.threads.map((thread) => thread.id) : [];
    expect(localThreads()).toEqual(authoritative);

    // The same bounded manual pass converges the PROJECT order.
    await external.projectCommand(
      {
        kind: "reorder",
        projectId: "p-c",
        targetProjectId: "p-a",
        placement: "before",
      },
      { commandId: crypto.randomUUID() },
    );
    await vi.waitFor(() => expect(localProjects()).toEqual(hostManualProjectOrder()), {
      timeout: 20_000,
    });
    expect(localProjects().indexOf("p-c")).toBeLessThan(localProjects().indexOf("p-a"));
  }, 120_000);
});

describe("I3 late multi-page order recovery fence", () => {
  it("does not overwrite a newer local order and converges after the intent settles", async () => {
    for (let index = 0; index < 150; index += 1) {
      seedThread(`t-${index.toString(16).padStart(4, "0")}`, "p-1", undefined, index);
    }
    await activate();
    await vi.waitFor(() => expect(rootThreads().length).toBe(151), { timeout: 30_000 });

    const prototype = RemoteDesktopClient.prototype as unknown as {
      boundedThreadListPage: (options?: unknown) => Promise<unknown>;
      sendThreadCommand: (
        command: { readonly kind?: string },
        options?: unknown,
      ) => Promise<unknown>;
    };
    const originalPage = prototype.boundedThreadListPage;
    const originalSend = prototype.sendThreadCommand;
    const heldPages: Array<() => void> = [];
    const heldReorders: Array<() => void> = [];
    let holdPages = true;
    let holdReorder = true;
    prototype.boundedThreadListPage = function (this: RemoteDesktopClient, options?: unknown) {
      const mode = (options as { readonly mode?: string } | undefined)?.mode;
      if (!holdPages || mode === "inventory") return originalPage.call(this, options);
      return new Promise((resolve, reject) => {
        heldPages.push(() => {
          originalPage.call(this, options).then(resolve, reject);
        });
      });
    };
    prototype.sendThreadCommand = function (
      this: RemoteDesktopClient,
      command: { readonly kind?: string },
      options?: unknown,
    ) {
      if (!holdReorder || command.kind !== "reorder") {
        return originalSend.call(this, command, options);
      }
      return new Promise((resolve, reject) => {
        heldReorders.push(() => {
          originalSend.call(this, command, options).then(resolve, reject);
        });
      });
    };
    try {
      const resync = resyncManagedRootCatalogOrder("threads");
      await vi.waitFor(() => expect(heldPages.length).toBeGreaterThan(0), { timeout: 15_000 });

      // A newer local order: the production intent paints optimistically and
      // its host command is deliberately still in flight.
      const newerLocalOrder = [...rootThreads().map((thread) => thread.id)].reverse();
      useAppStore.setState((state) => ({ threads: [...state.threads].reverse() }));
      expect(dispatchManagedRootThreadReorder("t-0000", "t-0001", "after")).toBe(true);

      holdPages = false;
      for (const run of heldPages.splice(0)) run();
      await resync;

      // The late recovery's captured order was fenced: the newer local paint
      // survives.
      expect(rootThreads().map((thread) => thread.id)).toEqual(newerLocalOrder);

      // Settling the intent re-runs convergence through the ordinary bounded
      // pass; the local order follows the host, not the fence-abandoned walk.
      holdReorder = false;
      for (const run of heldReorders.splice(0)) run();
      await vi.waitFor(
        () => expect(rootThreads().map((thread) => thread.id)).toEqual(hostManualThreadOrder()),
        { timeout: 30_000 },
      );
      expect(rootThreads().map((thread) => thread.id)).not.toEqual(newerLocalOrder);
    } finally {
      holdPages = false;
      holdReorder = false;
      for (const run of heldPages.splice(0)) run();
      for (const run of heldReorders.splice(0)) run();
      prototype.boundedThreadListPage = originalPage;
      prototype.sendThreadCommand = originalSend;
    }
  }, 120_000);

  it("abandons a held recovery when the authority is replaced", async () => {
    for (let index = 0; index < 150; index += 1) {
      seedThread(`t-${index.toString(16).padStart(4, "0")}`, "p-1", undefined, index);
    }
    await activate();
    await vi.waitFor(() => expect(rootThreads().length).toBe(151), { timeout: 30_000 });

    const prototype = RemoteDesktopClient.prototype as unknown as {
      boundedThreadListPage: (options?: unknown) => Promise<unknown>;
    };
    const originalPage = prototype.boundedThreadListPage;
    const heldPages: Array<() => void> = [];
    let holdPages = true;
    prototype.boundedThreadListPage = function (this: RemoteDesktopClient, options?: unknown) {
      const mode = (options as { readonly mode?: string } | undefined)?.mode;
      if (!holdPages || mode === "inventory") return originalPage.call(this, options);
      return new Promise((resolve, reject) => {
        heldPages.push(() => {
          originalPage.call(this, options).then(resolve, reject);
        });
      });
    };
    try {
      const resync = resyncManagedRootCatalogOrder("threads");
      await vi.waitFor(() => expect(heldPages.length).toBeGreaterThan(0), { timeout: 15_000 });

      // The authority is replaced while the recovery walk is parked, and a
      // newer local paint exists. The released pages must not apply the retired
      // activation's captured order.
      __resetManagedRootCatalogRuntimeForTest();
      resetDesktopLoopbackIntakeForTest();
      const newerLocalOrder = [...rootThreads().map((thread) => thread.id)].reverse();
      useAppStore.setState((state) => ({ threads: [...state.threads].reverse() }));

      holdPages = false;
      for (const run of heldPages.splice(0)) run();
      await resync;
      expect(rootThreads().map((thread) => thread.id)).toEqual(newerLocalOrder);
    } finally {
      holdPages = false;
      const pending = heldPages.splice(0);
      for (const run of pending) run();
      prototype.boundedThreadListPage = originalPage;
    }
  }, 120_000);
});

describe("host housekeeping projection", () => {
  it("closes the pane of a root row the host archived, without a durable write", () => {
    useAppStore.getState().createThread({
      threadId: "t-arch",
      projectId: "p-1",
      agentKind: "claude",
      config: { model: "sonnet" },
      prompt: "archived later",
    });
    useAppStore.setState({ view: { kind: "thread", panes: ["t-arch"] } });

    const row = useAppStore.getState().threads.find((thread) => thread.id === "t-arch")!;
    applyRootCatalogThreadRows([{ ...row, archived: true, archivedAt: row.updatedAt }], new Set());

    expect(useAppStore.getState().view.kind).toBe("home");
    expect(useAppStore.getState().threads.some((thread) => thread.id === "t-arch")).toBe(true);
  });

  it("evicts the durable notice and pending intent on authoritative removal", () => {
    useAppStore.getState().createThread({
      threadId: "t-removed",
      projectId: "p-1",
      agentKind: "claude",
      config: { model: "sonnet" },
      prompt: "removed later",
    });
    notePendingManagedRootLaunch("t-removed", false);
    recordThreadHistoryNoticeRead("t-removed", "authority", {
      kind: "history-incomplete",
      source: "exact",
      reason: "oversize",
      refusedEvents: 1,
      refusedBytes: 1,
      acknowledgedCount: 1,
      firstAcknowledgedAt: 1,
      lastAcknowledgedAt: 1,
    });

    removeRootCatalogThreads(["t-removed"]);

    expect(useAppStore.getState().threads.some((thread) => thread.id === "t-removed")).toBe(false);
    expect(readThreadHistoryNotice("t-removed")).toBeUndefined();
    expect(consumePendingManagedRootLaunch("t-removed")).toBeUndefined();
  });
});

describe("F12 status-sweep scope", () => {
  it("preserves host-owned root rows on launch and flips renderer-owned rows only", () => {
    useAppStore.getState().createThread({
      threadId: "t-root",
      projectId: "p-1",
      agentKind: "claude",
      config: { model: "sonnet" },
      prompt: "root",
    });
    useAppStore.getState().updateThreadRuntime("t-root", {
      status: "working",
      attention: "working",
      canResumeWithConfig: false,
    });
    useAppStore.getState().markThreadsInactiveOnLaunch({ preserveHostOwnedRootRows: true });
    expect(threadRow("t-root")?.status).toBe("working");

    useAppStore.getState().markThreadsInactiveOnLaunch();
    expect(threadRow("t-root")?.status).toBe("inactive");
  });

  it("keeps root rows out of the absent-snapshot status sweep", () => {
    useAppStore.getState().createThread({
      threadId: "t-root-2",
      projectId: "p-1",
      agentKind: "claude",
      config: { model: "sonnet" },
      prompt: "root",
    });
    useAppStore.getState().updateThreadRuntime("t-root-2", {
      status: "working",
      attention: "working",
      canResumeWithConfig: false,
    });
    useAppStore
      .getState()
      .reconcileRuntimeSnapshots([], new Set(["t-root-2"]), { preserveHostOwnedRootRows: true });
    expect(threadRow("t-root-2")?.status).toBe("working");

    useAppStore.getState().reconcileRuntimeSnapshots([], new Set(["t-root-2"]));
    expect(threadRow("t-root-2")?.status).toBe("inactive");
  });
});

describe("O4/N2 managed project-order recovery over the real host", () => {
  it("recovers the authoritative project order after a rejected project reorder", async () => {
    seedProject("p2", 1);
    seedProject("p3", 2);
    await activate();
    await vi.waitFor(() =>
      expect(rootProjects().map((project) => project.id)).toEqual(["p-1", "p2", "p3"]),
    );

    // The UI's optimistic paint: p-1 moved to the tail, then the host rejects
    // the relative move because the target row does not exist.
    useAppStore.setState({
      projects: [
        ...useAppStore.getState().projects.filter((project) => project.id !== "p-1"),
        useAppStore.getState().projects.find((project) => project.id === "p-1")!,
      ],
    });
    expect(dispatchManagedRootProjectReorder("p-1", "missing", "after")).toBe(true);
    await vi.waitFor(
      () =>
        expect(rootProjects().map((project) => project.id)).toEqual(
          hostManualProjectOrder().filter((id) => id !== HOME_PROJECT_ID),
        ),
      { timeout: 10_000 },
    );
  }, 60_000);

  it("falls back to one bounded ordinary project refresh when the recovery walk fails", async () => {
    seedProject("p2", 1);
    seedProject("p3", 2);
    await activate();
    await vi.waitFor(() =>
      expect(rootProjects().map((project) => project.id)).toEqual(["p-1", "p2", "p3"]),
    );

    // The recovery walk's ONLY entry is the bounded shell snapshot (the paint
    // refresh uses the project page route). Fail it once: the recovery must
    // request the ordinary bounded refresh instead of waiting for an unrelated
    // event.
    const prototype = RemoteDesktopClient.prototype as unknown as {
      boundedShellSnapshot: (options?: unknown) => Promise<unknown>;
    };
    const originalSnapshot = prototype.boundedShellSnapshot;
    let failRecoverySnapshot = true;
    prototype.boundedShellSnapshot = function (
      this: RemoteDesktopClient,
      options?: unknown,
    ): Promise<never> {
      if (failRecoverySnapshot) {
        failRecoverySnapshot = false;
        return Promise.reject(new Error("fixture recovery read failed"));
      }
      return originalSnapshot.call(this, options) as Promise<never>;
    };
    try {
      useAppStore.setState({
        projects: [
          ...useAppStore.getState().projects.filter((project) => project.id !== "p-1"),
          useAppStore.getState().projects.find((project) => project.id === "p-1")!,
        ],
      });
      expect(dispatchManagedRootProjectReorder("p-1", "missing", "after")).toBe(true);
      await vi.waitFor(
        () =>
          expect(rootProjects().map((project) => project.id)).toEqual(
            hostManualProjectOrder().filter((id) => id !== HOME_PROJECT_ID),
          ),
        { timeout: 10_000 },
      );
      // The recovery walk did run and consumed the one injected failure; the
      // fallback ordinary refresh is what converged the order.
      expect(failRecoverySnapshot).toBe(false);
    } finally {
      prototype.boundedShellSnapshot = originalSnapshot;
    }
  }, 60_000);
});

describe("bounded catalog changes + project command results adoption (managed)", () => {
  /** Fully-populated, wire-legal row (~1 KiB serialized). */
  function representativeProject(index: number): Project {
    return {
      id: `project-${index}`,
      name: `Acme Platform Service ${index} (integration workspace)`,
      icon: "lucide:boxes",
      location: {
        kind: "posix",
        path: `/Users/operator/Development/acme/platform-service-${index}`,
      },
      lastDraftConfig: {
        agentKind: "claude",
        model: "claude-sonnet-4-5",
        effort: "high",
        fast: false,
      },
      scripts: {
        setupScript: "pnpm install --frozen-lockfile && pnpm run build",
        cleanupScript: "pnpm run clean",
        worktreeCopyPatterns: [".env.local", ".envrc", "config/local.*"],
        actions: [
          { id: "test", name: "Run tests", command: "pnpm run test", icon: "beaker" },
          { id: "lint", name: "Lint", command: "pnpm run lint", icon: "check" },
          { id: "migrate", name: "Migrate DB", command: "pnpm run db:migrate" },
        ],
      },
      searchSettings: {
        useIgnoreFiles: true,
        exclude: {
          "**/node_modules/**": true,
          "**/dist/**": true,
          "**/coverage/**": true,
          "**/.next/**": true,
          "**/build/**": false,
        },
      },
      worktreeLocation: { mode: "project-relative", basePath: ".poracode/worktrees" },
      ghAccount: { host: "github.com", login: "acme-operator" },
      workspaceId: `workspace-${index % 24}`,
      createdAt: "2026-01-01T00:00:00.000Z",
    } as unknown as Project;
  }

  it("declares catalogChanges on the first upgrade once the preflight descriptor proves it, then converges a bounded project action without a legacy catalog read", async () => {
    const server = await activate();

    // First-upgrade ordering (F1): the authenticated descriptor preflight runs
    // on the HTTP leg before the first ticket/open, so the socket this process
    // actually opened already carries the declaration — no forced reconnect.
    const first = new URL(socketUrls[0]!);
    expect(first.searchParams.get("catalogChanges")).toBe("bounded-v1");
    // B1 stays on the same first upgrade.
    expect(first.searchParams.get("notices")).toBe("v1");
    expect(socketUrls).toHaveLength(1);

    // Capture the actual client calls: the mutation must send the bounded
    // declaration and an explicit per-operation id, and convergence must ride
    // bounded reads (never the assembled legacy snapshot).
    const prototype = RemoteDesktopClient.prototype as unknown as {
      projectCommand: (command: unknown, options?: unknown) => Promise<unknown>;
      snapshot: (options?: unknown) => Promise<unknown>;
      boundedProjectListPage: (options?: unknown) => Promise<unknown>;
    };
    const originalProjectCommand = prototype.projectCommand;
    const originalSnapshot = prototype.snapshot;
    const originalProjectPage = prototype.boundedProjectListPage;
    const commandOptions: unknown[] = [];
    let legacySnapshotCalls = 0;
    let boundedProjectPageCalls = 0;
    prototype.projectCommand = function (
      this: RemoteDesktopClient,
      command: unknown,
      options?: unknown,
    ) {
      commandOptions.push(options);
      return originalProjectCommand.call(this, command, options);
    };
    prototype.snapshot = function (this: RemoteDesktopClient, options?: unknown) {
      legacySnapshotCalls += 1;
      return originalSnapshot.call(this, options);
    };
    prototype.boundedProjectListPage = function (this: RemoteDesktopClient, options?: unknown) {
      boundedProjectPageCalls += 1;
      return originalProjectPage.call(this, options);
    };
    try {
      const before = boundedProjectPageCalls;
      const startedAt = server.getInfo()?.httpBaseUrl;
      expect(startedAt).toBeTruthy();
      const response = await sendManagedRootProjectCommand({
        kind: "update",
        projectId: "p-1",
        patch: { name: "Renamed over bounded" },
      });
      expect("projects" in response).toBe(false);
      expect(JSON.stringify(response).length).toBeLessThan(2048);
      expect(commandOptions.at(-1)).toMatchObject({ result: "bounded" });
      expect((commandOptions.at(-1) as { readonly commandId?: string }).commandId).toEqual(
        expect.any(String),
      );

      // The live signal refreshes the catalog through bounded reads (page
      // route), and the local row converges without any legacy full read.
      await vi.waitFor(
        () =>
          expect(rootProjects().find((project) => project.id === "p-1")?.name).toBe(
            "Renamed over bounded",
          ),
        { timeout: 10_000 },
      );
      expect(boundedProjectPageCalls).toBeGreaterThan(before);
      expect(legacySnapshotCalls).toBe(0);
    } finally {
      prototype.projectCommand = originalProjectCommand;
      prototype.snapshot = originalSnapshot;
      prototype.boundedProjectListPage = originalProjectPage;
    }
  }, 60_000);

  it("returns a bounded project-command result for 2,000 rich projects without a full catalog read", async () => {
    getSqlite().transaction(() => {
      for (let index = 0; index < 2_000; index += 1) {
        dbUpsertProject(representativeProject(index), index);
      }
    })();
    await activate();
    await vi.waitFor(() => expect(getManagedRootCatalogStatus().status).toBe("ready"));

    const prototype = RemoteDesktopClient.prototype as unknown as {
      projectCommand: (command: unknown, options?: unknown) => Promise<unknown>;
    };
    const originalProjectCommand = prototype.projectCommand;
    const commandOptions: unknown[] = [];
    prototype.projectCommand = function (
      this: RemoteDesktopClient,
      command: unknown,
      options?: unknown,
    ) {
      commandOptions.push(options);
      return originalProjectCommand.call(this, command, options);
    };
    try {
      const response = await sendManagedRootProjectCommand({
        kind: "update",
        projectId: "project-1",
        patch: { name: "Renamed one rich project" },
      });
      const serialized = JSON.stringify(response);
      expect("projects" in response).toBe(false);
      expect(new TextEncoder().encode(serialized).byteLength).toBeLessThan(2048);
      expect(response.project?.name).toBe("Renamed one rich project");
      expect(commandOptions.at(-1)).toMatchObject({ result: "bounded" });
      expect((commandOptions.at(-1) as { readonly commandId?: string }).commandId).toEqual(
        expect.any(String),
      );
    } finally {
      prototype.projectCommand = originalProjectCommand;
    }
  }, 120_000);
});
