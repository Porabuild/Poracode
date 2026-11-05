import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import { __resetRemoteServersStoreForTest, useRemoteServersStore } from "../remoteServersStore";
import { useAppStore } from "../appStore";
import { deleteThread } from "@/renderer/actions/threadActions";
import { remoteThreadId } from "../remoteProjection";
import { noteBoundedCatalogMembershipEvent } from "./catalog/boundedCatalogController";

/**
 * A paired delete paints the optimistic archive immediately, then the host
 * catalog converges. A bounded shell page read that STARTED before the delete
 * must never restore the row after a deletion gate already confirmed it absent:
 * the install compares its removal mark against the connection's latest
 * confirmed removal and repaints page 1 instead of committing the stale page.
 */

const bridge = vi.hoisted(() => ({}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));

const toastDanger = vi.hoisted(() => vi.fn<(message: string) => void>());
vi.mock("@heroui/react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, toast: { ...(actual.toast as object), danger: toastDanger } };
});

const PROJ: Project = {
  id: "p1",
  name: "Remote App",
  location: { kind: "posix", path: "/r/app" },
  createdAt: "2026-01-01T00:00:00.000Z",
};

function threadRow(id: string): Thread {
  return {
    id,
    projectId: "p1",
    title: `Thread ${id}`,
    agentKind: "claude",
    config: {},
    status: "idle",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as Thread;
}

interface PairedHost {
  readonly client: RemoteDesktopClient;
  holdNextShell(): void;
  releaseHeldShell(): boolean;
  readonly heldShellCount: number;
}

/** Fake paired host with a mutable membership and a holdable shell read. */
function makePairedHost(initialRows: readonly Thread[]): PairedHost {
  let rows = [...initialRows];
  let holdShell = false;
  const heldShells: Array<{ release: () => void }> = [];

  const client = {
    endpoint: "http://desktop-one.test/",
    accessToken: "token-one",
    setTokenLifecycle: () => {},
    setCertFingerprintPin: () => {},
    environment: async () => ({
      protocolVersion: 12,
      hostMode: "desktop",
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
        httpBaseUrl: "http://desktop-one.test/",
        wsBaseUrl: "ws://desktop-one.test/",
      },
    }),
    agentStatuses: async () => ({ windows: [], wsl: [], updatedAt: "now" }),
    describeHost: async () => ({}),
    boundedShellSnapshot: async () => {
      // Capture the page before the optional hold: a read that starts now
      // describes this moment, however late it is allowed to resolve.
      const captured = [...rows];
      if (holdShell) {
        holdShell = false;
        await new Promise<void>((release) => {
          heldShells.push({ release: () => release() });
        });
      }
      return {
        negotiation: "bounded" as const,
        page: {
          snapshotSeq: 0,
          projects: [PROJ],
          threads: captured,
          runtimeSummariesByThread: {},
          reads: "bounded-v1" as const,
          threadsNextCursor: null,
          projectsNextCursor: null,
          updatedAt: "now",
        },
      };
    },
    boundedThreadListPage: async () => ({
      negotiation: "bounded" as const,
      page: {
        threads: [...rows],
        runtimeSummariesByThread: {},
        nextCursor: null,
        reads: "bounded-v1" as const,
      },
    }),
    boundedProjectListPage: async () => ({
      projects: [PROJ],
      projectsNextCursor: null,
      reads: "bounded-v1" as const,
    }),
    boundedCatalogMembership: async (request: { readonly threadIds?: string[] }) => {
      const requested = request.threadIds ?? [];
      return {
        existingThreadIds: requested.filter((id) => rows.some((row) => row.id === id)),
        existingProjectIds: [],
      };
    },
    snapshot: async () => {
      throw new Error("legacy snapshot must not be used by a bounded paired host");
    },
    sendThreadCommand: async (command: { readonly kind?: string; readonly threadId?: string }) => {
      if (command.kind !== "delete" || !command.threadId) return;
      rows = rows.filter((row) => row.id !== command.threadId);
    },
  } as unknown as RemoteDesktopClient;

  return {
    client,
    holdNextShell: () => {
      holdShell = true;
    },
    releaseHeldShell: () => {
      const held = heldShells.shift();
      held?.release();
      return held !== undefined;
    },
    get heldShellCount() {
      return heldShells.length;
    },
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
    runtime: { d1: { status: "online", projects: [PROJ], threads: [] } },
  } as never);
  useRemoteServersStore.getState().setClientFactory(() => client);
}

async function settle(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

interface Transition {
  readonly exists: boolean;
  readonly archived: boolean;
  readonly visible: boolean;
}

describe("paired thread delete", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    __resetRemoteServersStoreForTest();
    useAppStore.setState({
      threads: [],
      projects: [],
      provisioningWorktreeThreadIds: {},
      pendingThreadLaunches: {},
    });
    useRemoteServersStore.setState({
      servers: [],
      runtime: {},
      openThread: null,
      hostUpdates: {},
      hostUpdateRestarts: {},
    });
    toastDanger.mockClear();
  });

  afterEach(() => {
    useRemoteServersStore.getState().closeRemoteThread();
    __resetRemoteServersStoreForTest();
    vi.useRealTimers();
  });

  it("never shows a deleted row again when a shell read from before the delete lands after the confirmed removal", async () => {
    const hostId = "t-del";
    const viewId = remoteThreadId("d1", hostId);
    const host = makePairedHost([threadRow("t-keep-1"), threadRow(hostId), threadRow("t-keep-2")]);
    installServer(host.client);
    await useRemoteServersStore.getState().refreshServer("d1");
    await settle(0);
    await settle(0);
    expect(
      useAppStore.getState().threads.filter((thread) => thread.remoteServerId === "d1"),
    ).toHaveLength(3);
    useAppStore.getState().openThread(viewId);

    // An inventory follow-up is already queued, and a shell read starts before
    // the delete, capturing the row that is about to go away.
    noteBoundedCatalogMembershipEvent("d1", "remote-threads-changed");
    await settle(599);
    host.holdNextShell();
    void useRemoteServersStore.getState().refreshServer("d1");
    await settle(0);
    expect(host.heldShellCount).toBe(1);

    const transitions: Transition[] = [];
    const read = (state: ReturnType<typeof useAppStore.getState>) => {
      const row = state.threads.find((candidate) => candidate.id === viewId);
      return {
        exists: row !== undefined,
        archived: row?.archived === true,
        visible: row !== undefined && row.archived !== true,
      };
    };
    transitions.push(read(useAppStore.getState()));
    const unsubscribe = useAppStore.subscribe((state) => {
      const next = read(state);
      const previous = transitions.at(-1)!;
      if (next.exists === previous.exists && next.visible === previous.visible) return;
      transitions.push(next);
    });
    try {
      deleteThread(viewId);
      // The queued inventory pass reads after the delete, confirms absence and
      // removes the row (forgetting its optimistic catalog edit).
      await settle(1);
      // The pre-delete shell read now resolves while it is still the latest
      // request. Its rows are stale: they must not be committed.
      host.releaseHeldShell();
      await settle(0);
      await settle(0);
      // The host's next membership change converges membership again.
      noteBoundedCatalogMembershipEvent("d1", "remote-threads-changed");
      await settle(700);
      await settle(700);
      await settle(2000);
    } finally {
      unsubscribe();
    }

    // The row hid, was confirmed removed, and never became visible again.
    expect(transitions.some((entry) => !entry.exists)).toBe(true);
    expect(transitions.slice(1).every((entry) => !entry.visible)).toBe(true);
    expect(useAppStore.getState().threads.find((row) => row.id === viewId)).toBeUndefined();
  });
});
