import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import {
  __resetBoundedCatalogForTest,
  configureBoundedCatalogController,
  installBoundedCatalogShellPage,
  noteBoundedCatalogMembershipEvent,
  type BoundedCatalogDeps,
} from "./boundedCatalogController";

/**
 * Manual-order convergence contract of the shared bounded controller (I2): a
 * completed manual paint pass reports its accumulated authoritative id order to
 * the declared consumer for BOTH kinds, a membership event refreshes the paint
 * from page 1 (external reorder / prepended row), and the order reported is the
 * generation captured when the pass started. The managed adapter owns the
 * accept/reject decision; this suite pins the controller side of the contract.
 */

const KEY = "root";

const TEST_CONSUMER = { id: "manual-order-test", ownsConnection: () => true };

function threadRow(id: string): Thread {
  return {
    id,
    projectId: "p1",
    title: id,
    agentKind: "claude",
    config: {},
    status: "idle",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as Thread;
}

function projectRow(id: string): Project {
  return {
    id,
    name: id,
    location: { kind: "posix", path: `/tmp/${id}` },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

interface AppliedOrder {
  readonly kind: string;
  readonly ids: readonly string[];
  readonly generation: number;
}

interface Harness {
  readonly applied: AppliedOrder[];
  readonly deps: BoundedCatalogDeps;
  readonly threadPages: number;
  readonly projectPages: number;
  readonly held: Array<() => void>;
  holdContinuations: boolean;
  releaseHeld(): void;
  setThreads(rows: readonly Thread[], pageSize: number): void;
  setProjects(rows: readonly Project[], pageSize: number): void;
  setGeneration(next: number): void;
  setKindGeneration(kind: "threads" | "projects", next: number): void;
}

function makeHarness(options: {
  readonly declareOrder: boolean;
  /**
   * Production shape: each kind owns its generation, and an applied order
   * bumps that kind's generation (the adapter's real decision). The default
   * single-generation fake is kept for the historical contract tests.
   */
  readonly perKind?: boolean;
}): Harness {
  let manualThreads: readonly Thread[] = [];
  let manualProjects: readonly Project[] = [];
  let threadPageSize = 100;
  let projectPageSize = 100;
  let runtimeThreads: Thread[] = [];
  let runtimeProjects: Project[] = [];
  let generation = 3;
  const kindGenerations = { threads: 3, projects: 3 };
  const applied: AppliedOrder[] = [];
  const counters = { threadPages: 0, projectPages: 0 };
  const hold = { enabled: false, pending: [] as Array<() => void> };
  const maybeHold = async (pageOptions: { mode?: string; cursor?: string }): Promise<void> => {
    if (!hold.enabled || pageOptions.mode !== "page" || pageOptions.cursor === undefined) return;
    await new Promise<void>((resolve) => hold.pending.push(resolve));
  };

  const client = {
    boundedThreadListPage: async (pageOptions: {
      mode?: string;
      cursor?: string;
      limit?: number;
    }) => {
      counters.threadPages += 1;
      const offset = pageOptions.cursor ? Number(pageOptions.cursor.replace("tp1.", "")) : 0;
      const threads = manualThreads.slice(offset, offset + threadPageSize);
      const nextOffset = offset + threadPageSize;
      const result = {
        negotiation: "bounded" as const,
        page: {
          threads,
          runtimeSummariesByThread: {},
          nextCursor: nextOffset < manualThreads.length ? `tp1.${nextOffset}` : null,
          reads: "bounded-v1" as const,
        },
      };
      await maybeHold(pageOptions);
      return result;
    },
    boundedProjectListPage: async (pageOptions: {
      mode?: "page" | "inventory";
      cursor?: string;
      projectLimit?: number;
    }) => {
      if (pageOptions.mode !== "inventory") counters.projectPages += 1;
      const offset = pageOptions.cursor ? Number(pageOptions.cursor.replace("pp1.", "")) : 0;
      const projects = manualProjects.slice(offset, offset + projectPageSize);
      const nextOffset = offset + projectPageSize;
      const result = {
        projects,
        projectsNextCursor: nextOffset < manualProjects.length ? `pp1.${nextOffset}` : null,
        reads: "bounded-v1" as const,
      };
      await maybeHold(pageOptions);
      return result;
    },
  } as unknown as RemoteDesktopClient;

  const deps: BoundedCatalogDeps = {
    connectionIdentity: () => ({ generation: 1, identity: "root", client }),
    runtimeThreads: () => runtimeThreads,
    runtimeProjects: () => runtimeProjects,
    runtimeStatus: () => "online",
    commitThreadRows: (_key, rows) => {
      runtimeThreads = [...rows];
    },
    commitProjectRows: (_key, rows) => {
      runtimeProjects = [...rows];
    },
    removeThreadRows: () => {},
    removeProjectRows: () => {},
    withClient: (_key, invoke) => invoke(client),
    reportProtocolError: () => {},
    appliedThreadSeq: () => undefined,
    connectionSeq: () => 0,
    bumpConnectionSeq: () => {},
    protectedThreadIds: () => new Set(),
    isForeground: () => true,
    ...(options.declareOrder
      ? {
          manualOrderConvergence: {
            generation: (_key, kind) =>
              options.perKind === true ? kindGenerations[kind] : generation,
            apply: (_key, kind, ids, capturedGeneration) => {
              applied.push({ kind, ids: [...ids], generation: capturedGeneration });
              if (options.perKind === true) kindGenerations[kind as "threads" | "projects"] += 1;
              return "applied" as const;
            },
          },
        }
      : {}),
    schedule: (callback) => setTimeout(callback, 0),
  };

  return {
    applied,
    deps,
    get threadPages() {
      return counters.threadPages;
    },
    get projectPages() {
      return counters.projectPages;
    },
    get held() {
      return hold.pending;
    },
    get holdContinuations() {
      return hold.enabled;
    },
    set holdContinuations(enabled: boolean) {
      hold.enabled = enabled;
    },
    releaseHeld: () => {
      for (const resolve of hold.pending.splice(0)) resolve();
    },
    setThreads: (rows, pageSize) => {
      manualThreads = rows;
      threadPageSize = pageSize;
    },
    setProjects: (rows, pageSize) => {
      manualProjects = rows;
      projectPageSize = pageSize;
    },
    setGeneration: (next) => {
      generation = next;
      kindGenerations.threads = next;
      kindGenerations.projects = next;
    },
    setKindGeneration: (kind, next) => {
      kindGenerations[kind] = next;
    },
  };
}

describe("bounded catalog manual-order convergence", () => {
  beforeEach(() => {
    __resetBoundedCatalogForTest();
  });

  afterEach(() => {
    __resetBoundedCatalogForTest();
  });

  it("applies the accumulated manual order of completed thread and project passes", async () => {
    const harness = makeHarness({ declareOrder: true });
    harness.setThreads(["t-3", "t-2", "t-1", "t-0"].map(threadRow), 2);
    harness.setProjects(["p-2", "p-1", "p-0"].map(projectRow), 2);
    configureBoundedCatalogController(TEST_CONSUMER, harness.deps);
    installBoundedCatalogShellPage(KEY, {
      snapshotSeq: 1,
      projects: [projectRow("p-2"), projectRow("p-1")],
      threads: [threadRow("t-3"), threadRow("t-2")],
      runtimeSummariesByThread: {},
      reads: "bounded-v1",
      threadsNextCursor: "tp1.2",
      projectsNextCursor: "pp1.2",
      updatedAt: "now",
    });

    await vi.waitFor(() => expect(harness.applied.length).toBe(2), { timeout: 5_000 });
    const threads = harness.applied.find((entry) => entry.kind === "threads");
    const projects = harness.applied.find((entry) => entry.kind === "projects");
    expect(threads?.ids).toEqual(["t-3", "t-2", "t-1", "t-0"]);
    expect(projects?.ids).toEqual(["p-2", "p-1", "p-0"]);
    // Both passes report the generation captured when their walk started.
    expect(threads?.generation).toBe(3);
    expect(projects?.generation).toBe(3);
  });

  it("refreshes page 1 on a membership event so an external reorder and a prepended row converge", async () => {
    const harness = makeHarness({ declareOrder: true });
    harness.setThreads(["t-a", "t-b", "t-c"].map(threadRow), 100);
    configureBoundedCatalogController(TEST_CONSUMER, harness.deps);
    installBoundedCatalogShellPage(KEY, {
      snapshotSeq: 1,
      projects: [],
      threads: [threadRow("t-a"), threadRow("t-b"), threadRow("t-c")],
      runtimeSummariesByThread: {},
      reads: "bounded-v1",
      threadsNextCursor: null,
      projectsNextCursor: null,
      updatedAt: "now",
    });
    await vi.waitFor(() => expect(harness.applied.length).toBe(1), { timeout: 5_000 });
    expect(harness.applied[0]?.ids).toEqual(["t-a", "t-b", "t-c"]);

    // The host order moved externally and a new row was prepended.
    harness.setThreads(["t-new", "t-c", "t-a", "t-b"].map(threadRow), 100);
    harness.setGeneration(4);
    noteBoundedCatalogMembershipEvent(KEY, "remote-threads-changed");

    await vi.waitFor(() => expect(harness.applied.length).toBe(2), { timeout: 5_000 });
    expect(harness.applied[1]?.ids).toEqual(["t-new", "t-c", "t-a", "t-b"]);
    expect(harness.applied[1]?.generation).toBe(4);
  });

  it("does not refresh or apply order when the connection did not declare convergence", async () => {
    const harness = makeHarness({ declareOrder: false });
    harness.setThreads(["t-a", "t-b"].map(threadRow), 100);
    harness.setProjects([projectRow("p-a")], 100);
    configureBoundedCatalogController(TEST_CONSUMER, harness.deps);
    installBoundedCatalogShellPage(KEY, {
      snapshotSeq: 1,
      projects: [projectRow("p-a")],
      threads: [threadRow("t-a"), threadRow("t-b")],
      runtimeSummariesByThread: {},
      reads: "bounded-v1",
      threadsNextCursor: null,
      projectsNextCursor: null,
      updatedAt: "now",
    });
    await vi.waitFor(() => expect(harness.threadPages).toBeGreaterThan(0), { timeout: 5_000 });
    noteBoundedCatalogMembershipEvent(KEY, "remote-threads-changed");
    noteBoundedCatalogMembershipEvent(KEY, "remote-projects-changed");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(harness.applied).toEqual([]);
    // The project paint walk is opt-in: without the declaration no project page
    // read beyond the shell slice happens at all.
    expect(harness.projectPages).toBe(0);
  });

  it("keeps both kinds' generations independent: completed multi-page passes of BOTH kinds apply", async () => {
    // The per-kind production shape: a completed pass of one kind bumps only
    // its own generation, so the other kind's in-flight pass is never refused.
    const harness = makeHarness({ declareOrder: true, perKind: true });
    harness.setThreads(["t-0", "t-1", "t-2", "t-3"].map(threadRow), 2);
    harness.setProjects(["p-0", "p-1", "p-2", "p-3"].map(projectRow), 2);
    configureBoundedCatalogController(TEST_CONSUMER, harness.deps);
    installBoundedCatalogShellPage(KEY, {
      snapshotSeq: 1,
      projects: [projectRow("p-0"), projectRow("p-1")],
      threads: [threadRow("t-0"), threadRow("t-1")],
      runtimeSummariesByThread: {},
      reads: "bounded-v1",
      threadsNextCursor: "tp1.2",
      projectsNextCursor: "pp1.2",
      updatedAt: "now",
    });

    await vi.waitFor(
      () =>
        expect(harness.applied.filter((entry) => entry.kind === "threads").length).toBeGreaterThan(
          0,
        ),
      { timeout: 5_000 },
    );
    await vi.waitFor(
      () =>
        expect(harness.applied.filter((entry) => entry.kind === "projects").length).toBeGreaterThan(
          0,
        ),
      { timeout: 5_000 },
    );
    const threads = harness.applied.find((entry) => entry.kind === "threads");
    const projects = harness.applied.find((entry) => entry.kind === "projects");
    expect(threads?.ids).toEqual(["t-0", "t-1", "t-2", "t-3"]);
    expect(projects?.ids).toEqual(["p-0", "p-1", "p-2", "p-3"]);
    // Every applied order carries that kind's generation at walk start (3),
    // and each apply bumped only its own kind.
    expect(threads?.generation).toBe(3);
    expect(projects?.generation).toBe(3);
  });

  it("runs a refresh requested while the walk awaited its final page (no unrelated event needed)", async () => {
    const harness = makeHarness({ declareOrder: true });
    harness.setThreads(["t-a", "t-b", "t-c", "t-d"].map(threadRow), 2);
    configureBoundedCatalogController(TEST_CONSUMER, harness.deps);
    installBoundedCatalogShellPage(KEY, {
      snapshotSeq: 1,
      projects: [],
      threads: [threadRow("t-a"), threadRow("t-b")],
      runtimeSummariesByThread: {},
      reads: "bounded-v1",
      threadsNextCursor: "tp1.2",
      projectsNextCursor: null,
      updatedAt: "now",
    });
    await vi.waitFor(() => expect(harness.applied.length).toBe(1), { timeout: 5_000 });

    // A refresh walk whose FINAL continuation page is parked while a second
    // membership event lands: the pending refresh must run when the page
    // arrives instead of being dropped until some unrelated future event.
    harness.holdContinuations = true;
    noteBoundedCatalogMembershipEvent(KEY, "remote-threads-changed");
    await vi.waitFor(() => expect(harness.held.length).toBe(1), { timeout: 5_000 });
    harness.setThreads(["t-d", "t-c", "t-b", "t-a"].map(threadRow), 2);
    noteBoundedCatalogMembershipEvent(KEY, "remote-threads-changed");
    harness.holdContinuations = false;
    harness.releaseHeld();

    await vi.waitFor(() => expect(harness.applied.length).toBe(3), { timeout: 5_000 });
    expect(harness.applied[2]?.kind).toBe("threads");
    expect(harness.applied[2]?.ids).toEqual(["t-d", "t-c", "t-b", "t-a"]);
    // Coalesced, not looping: no further pass after the pending refresh ran.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(harness.applied).toHaveLength(3);
  });

  it("re-walks a pass whose captured generation was superseded instead of dropping its order", async () => {
    const harness = makeHarness({ declareOrder: true, perKind: true });
    harness.setThreads(["t-a", "t-b", "t-c", "t-d"].map(threadRow), 2);
    configureBoundedCatalogController(TEST_CONSUMER, harness.deps);
    installBoundedCatalogShellPage(KEY, {
      snapshotSeq: 1,
      projects: [],
      threads: [threadRow("t-a"), threadRow("t-b")],
      runtimeSummariesByThread: {},
      reads: "bounded-v1",
      threadsNextCursor: "tp1.2",
      projectsNextCursor: null,
      updatedAt: "now",
    });
    await vi.waitFor(() => expect(harness.applied.length).toBe(1), { timeout: 5_000 });

    // A newer authoritative paint bumps the generation while the walk's final
    // page is parked. The completed pass is refused (stale), and the controller
    // requests one bounded re-walk that captures the newer generation and
    // applies the newest order.
    harness.holdContinuations = true;
    harness.setKindGeneration("threads", 9);
    harness.setThreads(["t-d", "t-c", "t-b", "t-a"].map(threadRow), 2);
    noteBoundedCatalogMembershipEvent(KEY, "remote-threads-changed");
    await vi.waitFor(() => expect(harness.held.length).toBe(1), { timeout: 5_000 });
    harness.holdContinuations = false;
    harness.releaseHeld();

    await vi.waitFor(
      () =>
        expect(
          harness.applied.some((entry) => entry.kind === "threads" && entry.generation === 9),
        ).toBe(true),
      { timeout: 5_000 },
    );
    const applied = harness.applied.filter((entry) => entry.kind === "threads");
    expect(applied[applied.length - 1]?.ids).toEqual(["t-d", "t-c", "t-b", "t-a"]);
    expect(harness.applied[0]?.generation).not.toBe(9);
  });
});
