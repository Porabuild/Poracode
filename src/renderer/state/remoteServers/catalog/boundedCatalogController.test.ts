import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { RemoteBoundedReadProtocolError, type RemoteDesktopClient } from "@/shared/remote/client";
import { __resetRemoteServersStoreForTest, useRemoteServersStore } from "../../remoteServersStore";
import { noteBoundedCatalogMembershipEvent } from "./boundedCatalogController";
import { readBoundedHistoryTail } from "./boundedHistoryRegistry";
import { remoteThreadId } from "@/renderer/state/remoteProjection";
import { useAppStore } from "@/renderer/state/appStore";
import {
  loadOlderThreadRuntimeItems,
  rehydrateThreadRuntimeItemsAfterReset,
} from "@/renderer/state/chatRuntimePersister";
import { remoteServerSnapshotSeq } from "../eventSocketRegistry";

const bridge = vi.hoisted(() => ({
  sshConnect: vi.fn<() => Promise<unknown>>(),
  sshDisconnect: vi.fn<() => Promise<void>>(async () => {}),
  remoteHttpBridgeVersion: 2,
  openRemoteHttpBridge: vi.fn<() => Promise<unknown>>(),
  cancelRemoteHttpBridge: vi.fn<() => Promise<void>>(async () => {}),
  appendUsageEvents: vi.fn<() => Promise<void>>(async () => {}),
  dbGetThreadRuntimeItemsPage: vi.fn<() => Promise<{ items: never[]; nextCursor: null }>>(
    async () => ({ items: [], nextCursor: null }),
  ),
  dbGetThreadCompletedTurns: vi.fn<() => Promise<never[]>>(async () => []),
  dbGetThreadContextUsage: vi.fn<() => Promise<null>>(async () => null),
  dbGetLatestThreadGoalItem: vi.fn<() => Promise<null>>(async () => null),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));

const toastDanger = vi.hoisted(() => vi.fn<(message: string) => void>());
vi.mock("@heroui/react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, toast: { ...(actual.toast as object), danger: toastDanger } };
});

const proj: Project = {
  id: "p1",
  name: "Remote App",
  location: { kind: "posix", path: "/r/app" },
  createdAt: "2026-01-01T00:00:00.000Z",
};

function threadRow(id: string, status: Thread["status"] = "idle"): Thread {
  return {
    id,
    projectId: "p1",
    title: `Thread ${id}`,
    agentKind: "claude",
    config: {},
    status,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as Thread;
}

interface FakeBoundedHost {
  readonly client: RemoteDesktopClient;
  readonly shellPages: number;
  readonly listPages: number;
  readonly inventoryPages: number;
  readonly maxListInFlight: number;
  readonly maxInventoryInFlight: number;
  readonly membershipCalls: Array<{ threadIds?: string[]; projectIds?: string[] }>;
  readonly snapshot: ReturnType<typeof vi.fn>;
  /** Holds every subsequent inventory page until released. */
  holdInventoryPages(): void;
  releaseHeldInventoryPages(): void;
  resolveListPage?: (page: {
    threads: Thread[];
    nextCursor: string | null;
    inventoryFrontier?: string;
  }) => void;
}

interface FakeHostOptions {
  readonly rows: readonly Thread[];
  readonly pageSize?: number;
  /** Membership answer: which requested ids still exist. */
  readonly existing?: (requested: readonly string[]) => readonly string[];
  /** Delay the first paint continuation page until released. */
  readonly deferFirstListPage?: boolean;
  readonly onListPage?: (options: {
    readonly mode: "page" | "inventory";
    readonly cursor: string | undefined;
    readonly pageIndex: number;
  }) => { readonly threads: Thread[]; readonly nextCursor: string | null } | undefined;
}

function makeBoundedHost(options: FakeHostOptions): FakeBoundedHost {
  const pageSize = options.pageSize ?? 200;
  const deferral = options.deferFirstListPage
    ? (() => {
        let release: (value: {
          threads: Thread[];
          nextCursor: string | null;
          inventoryFrontier?: string;
        }) => void = () => {};
        const promise = new Promise<{
          threads: Thread[];
          nextCursor: string | null;
          inventoryFrontier?: string;
        }>((resolve) => {
          release = resolve;
        });
        return { promise, release };
      })()
    : null;
  let shellPages = 0;
  let listPages = 0;
  let inventoryPages = 0;
  let listInFlight = 0;
  let maxListInFlight = 0;
  let inventoryInFlight = 0;
  let maxInventoryInFlight = 0;
  let holdInventory = false;
  const heldInventory: Array<() => void> = [];
  const membershipCalls: Array<{ threadIds?: string[]; projectIds?: string[] }> = [];
  const snapshot = vi.fn<() => Promise<never>>(async () => {
    throw new Error("the assembled snapshot must not be called for a bounded host");
  });
  const client = {
    snapshot,
    setTokenLifecycle: () => {},
    setCertFingerprintPin: () => {},
    environment: async () => ({
      protocolVersion: 12,
      desktopId: "d1",
      label: "Server One",
      appVersion: "1.0",
      auth: {
        policy: "remote-reachable",
        bootstrapMethods: ["one-time-token"],
        sessionMethods: ["bearer-access-token"],
        scopes: ["session:read", "projects:manage"],
      },
      endpoints: {
        httpBaseUrl: "http://192.168.1.9:38987/",
        wsBaseUrl: "ws://192.168.1.9:38987/",
      },
    }),
    agentStatuses: async () => ({ windows: [], wsl: [], updatedAt: "now" }),
    describeHost: async () => ({}),
    boundedShellSnapshot: async () => {
      shellPages += 1;
      const firstPage = options.rows.slice(0, pageSize);
      return {
        negotiation: "bounded" as const,
        page: {
          snapshotSeq: 1,
          projects: [proj],
          threads: firstPage,
          runtimeSummariesByThread: {},
          reads: "bounded-v1" as const,
          threadsNextCursor: options.rows.length > pageSize ? "tp1.0" : null,
          projectsNextCursor: null,
          updatedAt: "now",
        },
      };
    },
    boundedThreadListPage: async (pageOptions: {
      mode?: "page" | "inventory";
      cursor?: string;
      limit?: number;
    }) => {
      const mode = pageOptions.mode ?? "page";
      if (mode === "inventory") {
        inventoryPages += 1;
        inventoryInFlight += 1;
        maxInventoryInFlight = Math.max(maxInventoryInFlight, inventoryInFlight);
        try {
          if (holdInventory) {
            await new Promise<void>((resolve) => heldInventory.push(resolve));
          }
          const plan = options.onListPage?.({
            mode,
            cursor: pageOptions.cursor,
            pageIndex: inventoryPages - 1,
          });
          return {
            negotiation: "bounded" as const,
            page: plan
              ? {
                  threads: plan.threads,
                  runtimeSummariesByThread: {},
                  nextCursor: plan.nextCursor,
                  reads: "bounded-v1" as const,
                }
              : {
                  threads: [],
                  runtimeSummariesByThread: {},
                  nextCursor: null,
                  reads: "bounded-v1" as const,
                },
          };
        } finally {
          inventoryInFlight -= 1;
        }
      }
      listPages += 1;
      listInFlight += 1;
      maxListInFlight = Math.max(maxListInFlight, listInFlight);
      try {
        if (deferral && listPages === 1) {
          const page = await deferral.promise;
          return {
            negotiation: "bounded" as const,
            page: {
              threads: page.threads,
              runtimeSummariesByThread: {},
              nextCursor: page.nextCursor,
              reads: "bounded-v1" as const,
            },
          };
        }
        const plan = options.onListPage?.({
          mode,
          cursor: pageOptions.cursor,
          pageIndex: listPages - 1,
        });
        if (plan) {
          return {
            negotiation: "bounded" as const,
            page: {
              threads: plan.threads,
              runtimeSummariesByThread: {},
              nextCursor: plan.nextCursor,
              reads: "bounded-v1" as const,
            },
          };
        }
        const offset = Number((pageOptions.cursor ?? "tp1.0").split(".")[1] ?? "0");
        const nextOffset = (offset + 1) * pageSize;
        const threads = options.rows.slice(nextOffset, nextOffset + pageSize);
        const nextCursor = nextOffset + pageSize < options.rows.length ? `tp1.${offset + 1}` : null;
        return {
          negotiation: "bounded" as const,
          page: {
            threads,
            runtimeSummariesByThread: {},
            nextCursor,
            reads: "bounded-v1" as const,
          },
        };
      } finally {
        listInFlight -= 1;
      }
    },
    boundedProjectListPage: async () => ({
      projects: [],
      projectsNextCursor: null,
      reads: "bounded-v1" as const,
    }),
    boundedCatalogMembership: async (request: { threadIds?: string[]; projectIds?: string[] }) => {
      membershipCalls.push(request);
      const ids = request.threadIds ?? request.projectIds ?? [];
      const existing = options.existing ? options.existing(ids) : ids;
      const existingSet = new Set(existing);
      return {
        existingThreadIds: (request.threadIds ?? []).filter((id) => existingSet.has(id)),
        existingProjectIds: (request.projectIds ?? []).filter((id) => existingSet.has(id)),
      };
    },
    boundedThreadHistory: async () => {
      throw new Error("not used by catalog tests");
    },
    boundedThreadTurns: async () => {
      throw new Error("not used by catalog tests");
    },
    boundedThreadHistoryItems: async () => {
      throw new Error("not used by catalog tests");
    },
    websocketTicket: async () => "ticket-1",
    websocketUrl: () => "ws://192.168.1.9:38987/ws?ticket=ticket-1",
    parseSocketMessage: (value: string) => JSON.parse(value),
    agentSlashCommands: async (kind: string) => ({ kind, commands: [] }),
    threadRuntimeItemsPage: async () => ({ items: [], nextCursor: null }),
  } as unknown as RemoteDesktopClient;
  return {
    client,
    get shellPages() {
      return shellPages;
    },
    get listPages() {
      return listPages;
    },
    get inventoryPages() {
      return inventoryPages;
    },
    get maxListInFlight() {
      return maxListInFlight;
    },
    get maxInventoryInFlight() {
      return maxInventoryInFlight;
    },
    holdInventoryPages: () => {
      holdInventory = true;
    },
    releaseHeldInventoryPages: () => {
      holdInventory = false;
      while (heldInventory.length > 0) {
        heldInventory.shift()?.();
      }
    },
    membershipCalls,
    snapshot,
    ...(deferral ? { resolveListPage: deferral.release } : {}),
  };
}

function installServer(client: RemoteDesktopClient): void {
  useRemoteServersStore.setState({
    servers: [
      {
        desktopId: "d1",
        label: "Server One",
        endpoint: "http://desktop-one.test/",
        accessToken: "token-one",
        scopes: [],
      },
    ],
    runtime: { d1: { status: "online", projects: [proj], threads: [] } },
  });
  useRemoteServersStore.getState().setClientFactory(() => client);
}

async function flushAsyncWork(): Promise<void> {
  for (let index = 0; index < 80; index += 1) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("boundedCatalogController", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetRemoteServersStoreForTest();
    useAppStore.setState({ threads: [], projects: [] });
    useRemoteServersStore.setState({
      servers: [],
      runtime: {},
      openThread: null,
      hostUpdates: {},
      hostUpdateRestarts: {},
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("paints the first bounded page without assembling the catalog", async () => {
    const rows = Array.from({ length: 10_000 }, (_, index) =>
      threadRow(`t-${String(index).padStart(5, "0")}`),
    );
    const host = makeBoundedHost({ rows, pageSize: 100 });
    installServer(host.client);

    await useRemoteServersStore.getState().refreshServer("d1");

    expect(useRemoteServersStore.getState().runtime.d1?.threads).toHaveLength(100);
    expect(host.snapshot).not.toHaveBeenCalled();
    expect(remoteServerSnapshotSeq("d1")).toBe(1);

    await vi.waitFor(
      () => {
        expect(useRemoteServersStore.getState().runtime.d1?.threads).toHaveLength(10_000);
      },
      { timeout: 10_000 },
    );
    // Continuation pages never advance the shell cursor.
    expect(remoteServerSnapshotSeq("d1")).toBe(1);
  });

  it("renders nothing when rows arrive as an empty bounded shell", async () => {
    const host = makeBoundedHost({ rows: [] });
    installServer(host.client);
    await useRemoteServersStore.getState().refreshServer("d1");
    expect(useRemoteServersStore.getState().runtime.d1?.status).toBe("online");
    expect(useRemoteServersStore.getState().runtime.d1?.threads).toEqual([]);
  });

  it("surfaces a protocol error from a malformed bounded first page", async () => {
    const host = makeBoundedHost({ rows: [threadRow("t-1")] });
    (
      host.client as unknown as { boundedShellSnapshot: () => Promise<never> }
    ).boundedShellSnapshot = async () => {
      throw new RemoteBoundedReadProtocolError(
        "reads_echo_mismatch",
        "The host echoed an unknown reads capability.",
      );
    };
    installServer(host.client);
    await useRemoteServersStore.getState().refreshServer("d1");
    expect(useRemoteServersStore.getState().runtime.d1?.status).toBe("error");
    // The localized catalog message, never the raw English SDK violation.
    expect(useRemoteServersStore.getState().runtime.d1?.message).toBe(
      "The remote catalog read failed.",
    );
    expect(toastDanger).not.toHaveBeenCalled();
  });

  it("confirms absence before deleting, and keeps pinned and restored rows", async () => {
    const rows = [
      threadRow("keep"),
      threadRow("gone"),
      threadRow("pinned"),
      threadRow("restored"),
      threadRow("provisioning"),
    ];
    const host = makeBoundedHost({
      rows,
      pageSize: 400,
      onListPage: ({ mode }) => {
        if (mode !== "inventory") return undefined;
        return { threads: [threadRow("keep")], nextCursor: null };
      },
      existing: (requested) => requested.filter((id) => id !== "gone" && id !== "pinned"),
    });
    installServer(host.client);
    // The open thread and a provisioning worktree are pinned: confirmed-absent
    // ids that are pinned stay.
    useRemoteServersStore.setState({
      openThread: {
        desktopId: "d1",
        threadId: "pinned",
        thread: threadRow("pinned"),
      },
    });
    useAppStore.setState((state) => ({
      provisioningWorktreeThreadIds: {
        ...state.provisioningWorktreeThreadIds,
        [remoteThreadId("d1", "provisioning")]: true,
      },
    }));
    await useRemoteServersStore.getState().refreshServer("d1");

    await vi.waitFor(() => {
      expect(host.membershipCalls.length).toBeGreaterThan(0);
      expect(useRemoteServersStore.getState().runtime.d1?.threads.map((row) => row.id)).toEqual([
        "keep",
        "pinned",
        "restored",
        "provisioning",
      ]);
    });
    // Membership saw exactly the candidates: seen rows and pinned rows are not
    // requested once the confirmation proves them gone.
    expect(host.membershipCalls.find((call) => call.threadIds !== undefined)?.threadIds).toEqual([
      "gone",
      "restored",
    ]);
    expect(
      useAppStore.getState().threads.some((row) => row.id === remoteThreadId("d1", "gone")),
    ).toBe(false);
    expect(
      useAppStore.getState().threads.some((row) => row.id === remoteThreadId("d1", "pinned")),
    ).toBe(true);
    expect(
      useAppStore.getState().threads.some((row) => row.id === remoteThreadId("d1", "restored")),
    ).toBe(true);
  });

  it("drops a delayed continuation page after a host switch (generation fence)", async () => {
    const rows = Array.from({ length: 3 }, (_, index) => threadRow(`t-${index}`));
    const host = makeBoundedHost({
      rows,
      pageSize: 1,
      deferFirstListPage: true,
    });
    installServer(host.client);
    await useRemoteServersStore.getState().refreshServer("d1");
    expect(useRemoteServersStore.getState().runtime.d1?.threads.map((row) => row.id)).toEqual([
      "t-0",
    ]);

    // Simulate a host switch / removal while the continuation is in flight.
    useRemoteServersStore.getState().removeServer("d1");
    host.resolveListPage?.({ threads: [threadRow("t-1")], nextCursor: null });
    await flushAsyncWork();
    expect(useRemoteServersStore.getState().runtime.d1).toBeUndefined();
  });

  it("reconciles project membership events into thread and project passes", async () => {
    vi.useFakeTimers();
    const rows = [threadRow("t-1")];
    const host = makeBoundedHost({ rows, pageSize: 10 });
    installServer(host.client);
    await useRemoteServersStore.getState().refreshServer("d1");
    const threadsBefore = host.listPages;
    const inventoryBefore = host.inventoryPages;

    noteBoundedCatalogMembershipEvent("d1", "remote-projects-changed");
    await vi.advanceTimersByTimeAsync(700);
    await vi.advanceTimersByTimeAsync(0);
    expect(host.inventoryPages).toBeGreaterThan(inventoryBefore);
    // A paired connection now declares manual-order convergence, so the event
    // also refreshes page-1 manual paint for BOTH kinds (external reorder and
    // host-prepended rows converge, not just membership): one bounded thread
    // paint page plus the project paint page.
    expect(host.listPages).toBe(threadsBefore + 1);
  });

  it("yields an inventory segment after the page bound and resumes", async () => {
    vi.useFakeTimers();
    const rows = [threadRow("t-1")];
    let inventoryPage = 0;
    const host = makeBoundedHost({
      rows,
      pageSize: 10,
      onListPage: ({ mode }) => {
        if (mode !== "inventory") return undefined;
        inventoryPage += 1;
        if (inventoryPage >= 130) return { threads: [], nextCursor: null };
        return { threads: [], nextCursor: `ti1.${inventoryPage}` };
      },
    });
    installServer(host.client);
    await useRemoteServersStore.getState().refreshServer("d1");
    await vi.advanceTimersByTimeAsync(0);

    // The first segment stops at the 128-page bound.
    expect(host.inventoryPages).toBe(128);
    for (let flush = 0; flush < 4; flush += 1) {
      await vi.advanceTimersByTimeAsync(1);
      if (inventoryPage >= 130) break;
    }
    expect(host.inventoryPages).toBeGreaterThan(128);
    expect(inventoryPage).toBe(130);
  });

  it("runs the periodic online foreground reconciliation after the interval", async () => {
    vi.useFakeTimers();
    const host = makeBoundedHost({ rows: [threadRow("t-1")], pageSize: 10 });
    installServer(host.client);
    await useRemoteServersStore.getState().refreshServer("d1");
    await vi.advanceTimersByTimeAsync(0);
    const inventoryBefore = host.inventoryPages;

    // Before the interval, the 30s ticker must not start a pass.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(host.inventoryPages).toBe(inventoryBefore);

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(host.inventoryPages).toBeGreaterThan(inventoryBefore);
  });

  it("runs a follow-up pass when a membership event lands during a walk", async () => {
    vi.useFakeTimers();
    const rows = [threadRow("t-1")];
    let inventoryPage = 0;
    const host = makeBoundedHost({
      rows,
      pageSize: 10,
      onListPage: ({ mode }) => {
        if (mode !== "inventory") return undefined;
        inventoryPage += 1;
        if (inventoryPage < 130) {
          return { threads: [], nextCursor: `ti1.${inventoryPage}` };
        }
        return { threads: [], nextCursor: null };
      },
    });
    installServer(host.client);
    await useRemoteServersStore.getState().refreshServer("d1");
    await vi.advanceTimersByTimeAsync(0);
    expect(inventoryPage).toBe(128);

    // The event arrives while the logical pass is in flight: completion must
    // schedule a follow-up pass instead of clearing the pending change.
    noteBoundedCatalogMembershipEvent("d1", "remote-threads-changed");
    for (let flush = 0; flush < 6; flush += 1) {
      await vi.advanceTimersByTimeAsync(700);
    }
    expect(inventoryPage).toBeGreaterThan(130);
  });

  it("falls back to the assembled legacy snapshot only on an absent echoes", async () => {
    const rows = [threadRow("legacy-1")];
    const host = makeBoundedHost({ rows, pageSize: 10 });
    (
      host.client as unknown as { boundedShellSnapshot: () => Promise<unknown> }
    ).boundedShellSnapshot = async () => ({
      negotiation: "legacy" as const,
      page: {
        snapshotSeq: 9,
        projects: [proj],
        threads: rows,
        runtimeSummariesByThread: {},
        updatedAt: "now",
      },
    });
    host.snapshot.mockResolvedValue({
      snapshotSeq: 9,
      projects: [proj],
      threads: rows,
      runtimeSummariesByThread: {},
      updatedAt: "now",
    });
    installServer(host.client);
    await useRemoteServersStore.getState().refreshServer("d1");

    expect(host.snapshot).toHaveBeenCalledTimes(1);
    expect(useRemoteServersStore.getState().runtime.d1?.threads.map((row) => row.id)).toEqual([
      "legacy-1",
    ]);
    // No bounded inventory pass runs on a legacy connection.
    expect(host.inventoryPages).toBe(0);
    // The legacy verdict is remembered for this connection generation.
    await useRemoteServersStore.getState().refreshServer("d1");
    expect(host.snapshot).toHaveBeenCalledTimes(2);
  });

  it("restarts a fresh pass after a reconnect", async () => {
    const host = makeBoundedHost({ rows: [threadRow("t-1")], pageSize: 10 });
    installServer(host.client);
    await useRemoteServersStore.getState().refreshServer("d1");
    expect(host.shellPages).toBe(1);

    useRemoteServersStore.setState((state) => ({
      runtime: {
        ...state.runtime,
        d1: { ...state.runtime.d1!, status: "offline" },
      },
    }));
    await useRemoteServersStore.getState().refreshServer("d1");
    expect(host.shellPages).toBe(2);
  });

  it("routes bounded reads through the current connection authority after a re-pair", async () => {
    const oldHost = makeBoundedHost({
      rows: [threadRow("t-0"), threadRow("t-1")],
      pageSize: 1,
      deferFirstListPage: true,
    });
    installServer(oldHost.client);
    await useRemoteServersStore.getState().refreshServer("d1");
    expect(useRemoteServersStore.getState().runtime.d1?.threads.map((row) => row.id)).toEqual([
      "t-0",
    ]);

    // Re-pair the same connection key with a fresh client/grant before the
    // retired client's continuation page resolves.
    useRemoteServersStore.getState().removeServer("d1");
    const newHost = makeBoundedHost({ rows: [threadRow("fresh")], pageSize: 10 });
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "d1",
          label: "Server One",
          endpoint: "http://desktop-one.test/",
          accessToken: "token-two",
          scopes: [],
        },
      ],
      runtime: { d1: { status: "online", projects: [proj], threads: [] } },
    });
    useRemoteServersStore.getState().setClientFactory(() => newHost.client);
    await useRemoteServersStore.getState().refreshServer("d1");

    oldHost.resolveListPage?.({ threads: [threadRow("ghost")], nextCursor: null });
    await flushAsyncWork();

    expect(newHost.shellPages).toBe(1);
    expect(useRemoteServersStore.getState().runtime.d1?.threads.map((row) => row.id)).toEqual([
      "fresh",
    ]);
  });

  it("continues older completed turns through the chat runtime hook", async () => {
    const host = makeBoundedHost({ rows: [threadRow("rt-1")], pageSize: 10 });
    const persistedTurn = (index: number) => ({
      startedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      endedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index + 1)).toISOString(),
      anchorItemId: null,
    });
    const turnsCalls: Array<{ cursor?: string; limit?: number }> = [];
    const client = host.client as unknown as {
      boundedThreadHistory: () => Promise<unknown>;
      boundedThreadTurns: (input: { cursor?: string; limit?: number }) => Promise<unknown>;
    };
    client.boundedThreadHistory = async () => ({
      negotiation: "bounded" as const,
      page: {
        snapshotSeq: 2,
        thread: threadRow("rt-1"),
        runtimeItems: [],
        completedTurns: [persistedTurn(10), persistedTurn(11)],
        completedTurnsNextCursor: "ct1.10",
        contextUsage: null,
        reads: "bounded-v1" as const,
        updatedAt: "now",
      },
    });
    client.boundedThreadTurns = async (input) => {
      turnsCalls.push(input);
      return {
        turns: [persistedTurn(8), persistedTurn(9)],
        completedTurnsNextCursor: null,
        reads: "bounded-v1" as const,
      };
    };
    installServer(host.client);
    useRemoteServersStore.getState().setSocketFactory(() => ({
      close: vi.fn<() => void>(),
      onmessage: null,
      onclose: null,
    }));

    await expect(useRemoteServersStore.getState().openRemoteThread("d1", "rt-1")).resolves.toBe(
      true,
    );
    const viewThreadId = remoteThreadId("d1", "rt-1");
    expect(useAppStore.getState().runtimeCompletedTurnsByThread[viewThreadId]).toHaveLength(2);

    await loadOlderThreadRuntimeItems(viewThreadId);
    await vi.waitFor(
      () => {
        expect(turnsCalls.length).toBe(1);
      },
      { timeout: 2000 },
    );
    await vi.waitFor(() => {
      expect(useAppStore.getState().runtimeCompletedTurnsByThread[viewThreadId]).toHaveLength(4);
    });
    expect(turnsCalls[0]?.cursor).toBe("ct1.10");
    expect(turnsCalls[0]?.limit).toBe(200);
  });

  it("starts a single inventory walk when a reconcile tick races a queued event pass", async () => {
    vi.useFakeTimers();
    const host = makeBoundedHost({
      rows: [threadRow("t-1")],
      pageSize: 10,
      onListPage: ({ mode }) =>
        mode === "inventory" ? { threads: [], nextCursor: null } : undefined,
    });
    installServer(host.client);
    await useRemoteServersStore.getState().refreshServer("d1");
    await vi.advanceTimersByTimeAsync(0);
    const inventoryBefore = host.inventoryPages;
    expect(inventoryBefore).toBeGreaterThan(0);

    host.holdInventoryPages();
    await vi.advanceTimersByTimeAsync(5 * 60_000 - 1);
    noteBoundedCatalogMembershipEvent("d1", "remote-threads-changed");
    // The 5-minute reconcile tick fires while the debounced event pass is
    // already queued; it must coalesce instead of opening a second walk.
    await vi.advanceTimersByTimeAsync(600);
    host.releaseHeldInventoryPages();
    for (let flush = 0; flush < 8; flush += 1) await vi.advanceTimersByTimeAsync(1);

    expect(host.maxInventoryInFlight).toBe(1);
    expect(host.inventoryPages).toBeGreaterThan(inventoryBefore);
  });

  it("hands over a fresh paint continuation without a second concurrent loop", async () => {
    vi.useFakeTimers();
    const rows = [threadRow("t-0"), threadRow("t-1"), threadRow("t-2")];
    const host = makeBoundedHost({ rows, pageSize: 1, deferFirstListPage: true });
    installServer(host.client);
    await useRemoteServersStore.getState().refreshServer("d1");
    await vi.advanceTimersByTimeAsync(0);
    expect(host.listPages).toBe(1);

    // A reconnect starts a fresh attempt while the first paint page is in
    // flight; the retired loop's late resolution must hand the slot over.
    useRemoteServersStore.setState((state) => ({
      runtime: { ...state.runtime, d1: { ...state.runtime.d1!, status: "offline" } },
    }));
    await useRemoteServersStore.getState().refreshServer("d1");
    await vi.advanceTimersByTimeAsync(0);
    host.resolveListPage?.({ threads: [threadRow("t-0")], nextCursor: "tp1.1" });
    for (let flush = 0; flush < 10; flush += 1) await vi.advanceTimersByTimeAsync(1);

    expect(host.maxListInFlight).toBe(1);
    // The held page (attempt 1) plus the two pages of the successor's walk.
    expect(host.listPages).toBe(3);
    expect(useRemoteServersStore.getState().runtime.d1?.threads.map((row) => row.id)).toEqual([
      "t-0",
      "t-1",
      "t-2",
    ]);
  });

  it("resumes a failed paint walk on the next shell install", async () => {
    vi.useFakeTimers();
    const rows = [threadRow("t-0"), threadRow("t-1"), threadRow("t-2")];
    const host = makeBoundedHost({ rows, pageSize: 1 });
    const originalListPage = host.client.boundedThreadListPage;
    let failNextPaint = true;
    let paintAttempts = 0;
    (
      host.client as unknown as {
        boundedThreadListPage: typeof originalListPage;
      }
    ).boundedThreadListPage = async (pageOptions) => {
      if ((pageOptions?.mode ?? "page") === "page") {
        paintAttempts += 1;
        if (failNextPaint) {
          failNextPaint = false;
          throw new Error("paint transport flap");
        }
      }
      return originalListPage(pageOptions);
    };
    installServer(host.client);
    await useRemoteServersStore.getState().refreshServer("d1");
    await vi.advanceTimersByTimeAsync(1);
    expect(paintAttempts).toBe(1);
    expect(host.listPages).toBe(0);

    // A plain refresh keeps the connection attempt and reinstalls the shell
    // page: the failed walk must resume instead of stalling.
    await useRemoteServersStore.getState().refreshServer("d1");
    for (let flush = 0; flush < 6; flush += 1) await vi.advanceTimersByTimeAsync(1);

    expect(paintAttempts).toBe(3);
    expect(host.maxListInFlight).toBe(1);
    expect(useRemoteServersStore.getState().runtime.d1?.threads.map((row) => row.id)).toEqual([
      "t-0",
      "t-1",
      "t-2",
    ]);
  });

  it("observes an eager agent-status rejection when the bounded probe fails", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      const host = makeBoundedHost({ rows: [] });
      (host.client as unknown as { agentStatuses: () => Promise<never> }).agentStatuses =
        async () => {
          throw new Error("agent statuses 500");
        };
      (
        host.client as unknown as { boundedShellSnapshot: () => Promise<never> }
      ).boundedShellSnapshot = async () => {
        throw new Error("probe down");
      };
      installServer(host.client);
      await useRemoteServersStore.getState().refreshServer("d1");
      await flushAsyncWork();

      expect(unhandled).toEqual([]);
      // The probe failure stays the visible error; the concurrent status
      // rejection must not crash the renderer or replace the message.
      expect(useRemoteServersStore.getState().runtime.d1?.status).toBe("error");
      expect(useRemoteServersStore.getState().runtime.d1?.message).toBe("probe down");
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("observes the status rejection when a superseded shell probe returns", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      const host = makeBoundedHost({ rows: [threadRow("t-1")], pageSize: 10 });
      const client = host.client as unknown as {
        agentStatuses: () => Promise<never>;
        boundedShellSnapshot: () => Promise<unknown>;
      };
      client.agentStatuses = async () => {
        throw new Error("agent statuses 500");
      };
      let releaseFirstShell!: (value: unknown) => void;
      client.boundedShellSnapshot = () =>
        new Promise((resolve) => {
          releaseFirstShell = resolve;
        });
      installServer(host.client);

      const first = useRemoteServersStore.getState().refreshServer("d1");
      // Supersede before the first probe resolves.
      const shellPage = {
        snapshotSeq: 1,
        projects: [proj],
        threads: [threadRow("t-1")],
        runtimeSummariesByThread: {},
        reads: "bounded-v1" as const,
        threadsNextCursor: null,
        projectsNextCursor: null,
        updatedAt: "now",
      };
      client.boundedShellSnapshot = async () => ({
        negotiation: "bounded" as const,
        page: shellPage,
      });
      await useRemoteServersStore.getState().refreshServer("d1");
      releaseFirstShell({ negotiation: "bounded" as const, page: shellPage });
      await first;
      await flushAsyncWork();

      expect(unhandled).toEqual([]);
      // The superseding refresh owns the runtime; the retired probe result was
      // dropped without touching it.
      expect(useRemoteServersStore.getState().runtime.d1?.threads.map((row) => row.id)).toEqual([
        "t-1",
      ]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("keeps an agent-status failure visible after the first page paints", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      const host = makeBoundedHost({ rows: [threadRow("t-1")], pageSize: 10 });
      (host.client as unknown as { agentStatuses: () => Promise<never> }).agentStatuses =
        async () => {
          throw new Error("agent statuses 500");
        };
      installServer(host.client);
      // A later successful inventory read reactivates the runtime (existing
      // reachability policy), so observe every transition instead of the
      // steady state.
      const failures: Array<string | undefined> = [];
      const unsubscribe = useRemoteServersStore.subscribe((state) => {
        if (state.runtime.d1?.status === "error") failures.push(state.runtime.d1.message);
      });
      try {
        await useRemoteServersStore.getState().refreshServer("d1");
        await flushAsyncWork();

        expect(unhandled).toEqual([]);
        // Honest partial status: the catalog page is painted and the status
        // failure is surfaced instead of silently swallowed.
        expect(useRemoteServersStore.getState().runtime.d1?.threads.map((row) => row.id)).toEqual([
          "t-1",
        ]);
        expect(failures).toContain("agent statuses 500");
      } finally {
        unsubscribe();
      }
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("localizes a protocol error from a background continuation", async () => {
    toastDanger.mockClear();
    const host = makeBoundedHost({ rows: [threadRow("t-0"), threadRow("t-1")], pageSize: 1 });
    const protocolError = () =>
      new RemoteBoundedReadProtocolError(
        "reads_echo_mismatch",
        "The host echoed an unknown reads capability.",
      );
    (
      host.client as unknown as { boundedThreadListPage: () => Promise<never> }
    ).boundedThreadListPage = async () => {
      throw protocolError();
    };
    // Every continuation fails so no later successful read reactivates the
    // runtime and hides the surfaced message.
    (
      host.client as unknown as { boundedProjectListPage: () => Promise<never> }
    ).boundedProjectListPage = async () => {
      throw protocolError();
    };
    installServer(host.client);
    await useRemoteServersStore.getState().refreshServer("d1");

    await vi.waitFor(
      () => {
        expect(toastDanger).toHaveBeenCalledWith("The remote catalog read failed.");
      },
      { timeout: 2000 },
    );
    // A typed read-protocol failure is an error, never "host offline".
    expect(useRemoteServersStore.getState().runtime.d1?.status).toBe("error");
    expect(useRemoteServersStore.getState().runtime.d1?.message).toBe(
      "The remote catalog read failed.",
    );
    expect(toastDanger).not.toHaveBeenCalledWith("The host echoed an unknown reads capability.");
  });

  it("invalidates the turn continuation on a timeline reset and resumes from a fresh tail", async () => {
    const host = makeBoundedHost({ rows: [threadRow("rt-1")], pageSize: 10 });
    const persistedTurn = (index: number) => ({
      startedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      endedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index + 1)).toISOString(),
      anchorItemId: null,
    });
    const turnsCalls: Array<{ cursor?: string; limit?: number }> = [];
    let tailCursor = "ct1.10";
    const client = host.client as unknown as {
      boundedThreadHistory: () => Promise<unknown>;
      boundedThreadTurns: (input: { cursor?: string; limit?: number }) => Promise<unknown>;
    };
    client.boundedThreadHistory = async () => ({
      negotiation: "bounded" as const,
      page: {
        snapshotSeq: 2,
        thread: threadRow("rt-1"),
        runtimeItems: [],
        completedTurns: [persistedTurn(10), persistedTurn(11)],
        completedTurnsNextCursor: tailCursor,
        contextUsage: null,
        reads: "bounded-v1" as const,
        updatedAt: "now",
      },
    });
    client.boundedThreadTurns = async (input) => {
      turnsCalls.push(input);
      return {
        turns: [persistedTurn(8), persistedTurn(9)],
        completedTurnsNextCursor: null,
        reads: "bounded-v1" as const,
      };
    };
    installServer(host.client);
    useRemoteServersStore.getState().setSocketFactory(() => ({
      close: vi.fn<() => void>(),
      onmessage: null,
      onclose: null,
    }));

    const viewThreadId = remoteThreadId("d1", "rt-1");
    await expect(useRemoteServersStore.getState().openRemoteThread("d1", "rt-1")).resolves.toBe(
      true,
    );
    expect(readBoundedHistoryTail(viewThreadId)).toBeDefined();

    // The actual thread-reset timeline path drops the continuation...
    await rehydrateThreadRuntimeItemsAfterReset(viewThreadId);
    expect(readBoundedHistoryTail(viewThreadId)).toBeUndefined();

    // ...so the UI "load older" gesture cannot reach the host with the
    // pre-reset cursor.
    await loadOlderThreadRuntimeItems(viewThreadId);
    await flushAsyncWork();
    expect(turnsCalls).toHaveLength(0);

    // A fresh bounded tail (re-open after the reset) resumes normally.
    tailCursor = "ct1.4";
    await expect(useRemoteServersStore.getState().openRemoteThread("d1", "rt-1")).resolves.toBe(
      true,
    );
    expect(readBoundedHistoryTail(viewThreadId)).toBeDefined();
    await loadOlderThreadRuntimeItems(viewThreadId);
    await vi.waitFor(
      () => {
        expect(turnsCalls.length).toBe(1);
      },
      { timeout: 2000 },
    );
    expect(turnsCalls[0]?.cursor).toBe("ct1.4");
  });
});
