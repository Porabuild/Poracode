import { afterEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import type { EventSocketConnectionContext } from "./eventSocketContext";
import { createEventSocketRecoveryState } from "./eventSocketContext";
import {
  __resetEventSocketRegistryForTest,
  setRemoteServerThreadItemInterests,
} from "./eventSocketRegistry";
import { recoverInterestedThreads, resyncOpenThread } from "./eventSocketResync";
import { remoteThreadId } from "@/renderer/state/remoteProjection";
import type { RemoteServerRecord, RemoteServersState } from "./types";

const PARENT_KEY = "conn-parent";
const ENV_KEY = "conn-child";
const CHILD_DESKTOP = "child-desktop";

const remoteThread = {
  id: "thread-1",
  projectId: "p1",
  title: "Remote thread",
  agentKind: "claude",
  config: {},
  status: "idle",
} as unknown as Thread;

function environmentRecord(): RemoteServerRecord {
  return {
    connectionId: ENV_KEY,
    desktopId: CHILD_DESKTOP,
    label: "Child",
    endpoint: "http://127.0.0.1:49153/api/environments/x/proxy/",
    accessToken: "child-access",
    scopes: ["session:read"],
    transport: {
      kind: "environment",
      parentConnectionId: PARENT_KEY,
      environmentId: "11111111-1111-4111-8111-111111111111",
      childDesktopId: CHILD_DESKTOP,
    },
  } as RemoteServerRecord;
}

interface ResyncHarness {
  readonly ctx: EventSocketConnectionContext;
  readonly threadHistory: ReturnType<typeof vi.fn>;
  readonly openThreads: { desktopId: string; threadId: string }[];
  readonly setRemoteServerFailure: ReturnType<typeof vi.fn>;
  readonly forceReconnect: ReturnType<typeof vi.fn>;
}

function harness(
  options: {
    readonly historyFails?: boolean;
    readonly openThread?: { desktopId: string; threadId: string } | null;
  } = {},
): ResyncHarness {
  const threadHistory = vi.fn<(threadId: string) => Promise<unknown>>(async (threadId: string) => {
    if (options.historyFails) throw new Error("history-unavailable");
    return {
      snapshotSeq: 4,
      thread: { ...remoteThread, id: threadId },
      runtimeItems: [],
      completedTurns: [],
      contextUsage: null,
      updatedAt: "now",
    } as unknown as Awaited<ReturnType<RemoteDesktopClient["threadHistory"]>>;
  });
  const openThreads: { desktopId: string; threadId: string }[] = [];
  const setRemoteServerFailure = vi.fn<(key: string, status: string, message: string) => void>();
  const forceReconnect = vi.fn<(socket: unknown) => void>();
  const socket = { close() {} };
  const ctx = {
    server: environmentRecord(),
    entry: { socket },
    socket,
    client: { threadHistory },
    get: () =>
      ({
        openThread:
          options.openThread === undefined
            ? { desktopId: ENV_KEY, threadId: "thread-1" }
            : options.openThread,
      }) as unknown as RemoteServersState,
    set: (partial: unknown) => {
      const next =
        typeof partial === "function" ? (partial as (s: never) => never)({} as never) : partial;
      if (next && typeof next === "object" && "openThread" in next) {
        openThreads.push(
          (next as { openThread: { desktopId: string; threadId: string } }).openThread,
        );
      }
    },
    buildOpenThread: (desktopId: string, snapshot: { thread: Thread }) => ({
      desktopId,
      threadId: snapshot.thread.id,
      thread: snapshot.thread,
    }),
    isCurrent: () => true,
    recovery: createEventSocketRecoveryState(),
    resyncSlots: { promise: null, socket: null },
    dispatchForwardEvent: () => undefined,
    setRemoteServerFailure,
    forceReconnect,
  } as unknown as EventSocketConnectionContext;
  return { ctx, threadHistory, openThreads, setRemoteServerFailure, forceReconnect };
}

afterEach(() => {
  __resetEventSocketRegistryForTest();
});

describe("eventSocketResync connection-key scope (C1 F1)", () => {
  it("fetches, projects, and opens interests registered under the environment connection key", async () => {
    setRemoteServerThreadItemInterests(ENV_KEY, ["thread-1"], true);
    const { ctx, threadHistory, openThreads } = harness();
    await expect(resyncOpenThread(ctx)).resolves.toBe(true);
    expect(threadHistory).toHaveBeenCalledWith("thread-1");
    expect(openThreads.map(({ desktopId, threadId }) => ({ desktopId, threadId }))).toEqual([
      { desktopId: ENV_KEY, threadId: "thread-1" },
    ]);
    expect(remoteThreadId(ENV_KEY, "thread-1")).not.toBe(remoteThreadId(CHILD_DESKTOP, "thread-1"));
  });

  it("never consumes the same child's direct-record interests through the environment client", async () => {
    // The direct pairing of the same child host registers its own interests
    // under the child desktop id; the environment record must not fetch them.
    setRemoteServerThreadItemInterests(CHILD_DESKTOP, ["thread-1"], true);
    const { ctx, threadHistory } = harness({ openThread: null });
    await expect(resyncOpenThread(ctx)).resolves.toBe(true);
    expect(threadHistory).not.toHaveBeenCalled();
  });

  it("reports an unreachable environment under its connection key, not the child identity", async () => {
    setRemoteServerThreadItemInterests(ENV_KEY, ["thread-1"], true);
    const { ctx, setRemoteServerFailure, forceReconnect } = harness({
      historyFails: true,
    });
    await expect(recoverInterestedThreads(ctx)).resolves.toBe(false);
    expect(forceReconnect).toHaveBeenCalledWith(ctx.socket);
    expect(setRemoteServerFailure).toHaveBeenCalledWith(ENV_KEY, "offline", expect.anything());
  });
});
