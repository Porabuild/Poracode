import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, RemoteThreadCommand, Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import {
  __resetBulkThreadRemovalCapabilityForTest,
  noteBulkThreadRemovalCapability,
} from "@/renderer/state/remote/bulkThreadRemovalCapability";
import { __resetManagedRootLaunchMetadataCapabilityForTest } from "@/renderer/state/managedRootCatalog/rootLaunchMetadataCapability";
import {
  __resetThreadLaunchIntentsForTest,
  dropPendingThreadLaunch,
  markPendingThreadCreated,
  notePendingThreadLaunch,
  peekPendingThreadLaunch,
  pinnedThreadRowIds,
} from "@/renderer/state/threadLaunchIntents";
import { forgetPendingCatalogEdit } from "@/renderer/state/pendingCatalogEdits";
import { remoteProjectId, remoteThreadId } from "@/renderer/state/remoteProjection";
import { archiveThreads, deleteThreads, deleteThreadsAndOwnedWorktrees } from "./threadActions";
import { applyForwardedRemoteThreadCommand } from "./remoteThreadCommandApplication";

const bridge = vi.hoisted(() => ({
  windowKind: "main" as const,
  closeSideChatPanel: vi.fn<() => Promise<void>>(async () => undefined),
  closeThread: vi.fn<() => Promise<void>>(async () => undefined),
}));
vi.mock("@/renderer/bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/renderer/bridge")>();
  return {
    ...actual,
    isQuickComposerWindow: () => false,
    isConversationWindow: () => false,
    readBridge: () => bridge,
  };
});

const clientRuntimeState = vi.hoisted(() => ({
  managedDesktop: false,
}));
vi.mock("@/renderer/clientRuntime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/renderer/clientRuntime")>();
  return {
    ...actual,
    hasAnyClientBridge: () => clientRuntimeState.managedDesktop,
    readClientRuntime: () => ({ transport: "electron-backend-host" as const }),
  };
});

const managedLoopbackState = vi.hoisted(() => ({
  activation: null as null | {
    readonly seq: number;
    readonly client: {
      readonly endpoint: string;
      environment: () => Promise<unknown>;
      sendThreadCommand: (command: RemoteThreadCommand) => Promise<void>;
    };
  },
}));
vi.mock("@/renderer/hostTransport/loopbackHttpWsTransport", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/renderer/hostTransport/loopbackHttpWsTransport")>();
  return {
    ...actual,
    readManagedLoopbackActivation: () => managedLoopbackState.activation,
  };
});

const toastDanger = vi.hoisted(() => vi.fn<(message: string) => void>());
vi.mock("@heroui/react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, toast: { ...(actual.toast as object), danger: toastDanger } };
});

function makeRemoteProject(serverId: string, remoteId: string): Project {
  return {
    id: remoteProjectId(serverId, remoteId),
    remoteServerId: serverId,
    remoteId,
    name: `Project ${remoteId}`,
    location: { kind: "posix", path: `/repo/${remoteId}` },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeRemoteThread(
  serverId: string,
  remoteId: string,
  projectRemoteId = "p1",
  overrides: Partial<Thread> = {},
): Thread {
  return {
    id: remoteThreadId(serverId, remoteId),
    remoteServerId: serverId,
    remoteId,
    projectId: remoteProjectId(serverId, projectRemoteId),
    title: `Thread ${remoteId}`,
    agentKind: "codex",
    config: { model: "gpt-5.4" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: true,
    starred: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("bulk thread removal over remote hosts", () => {
  const sendThreadCommand = vi.fn<
    (desktopId: string, command: RemoteThreadCommand) => Promise<void>
  >(async () => undefined);

  beforeEach(() => {
    for (const thread of useAppStore.getState().threads) {
      forgetPendingCatalogEdit("thread", thread.id);
    }
    vi.clearAllMocks();
    clientRuntimeState.managedDesktop = false;
    managedLoopbackState.activation = null;
    __resetThreadLaunchIntentsForTest();
    __resetBulkThreadRemovalCapabilityForTest();
    __resetManagedRootLaunchMetadataCapabilityForTest();
    sendThreadCommand.mockReset();
    sendThreadCommand.mockResolvedValue(undefined);
    useAppStore.setState({
      projects: [],
      threads: [],
      view: { kind: "home" },
      provisioningWorktreeThreadIds: {},
    });
    useRemoteServersStore.setState({
      sendThreadCommand: sendThreadCommand as typeof useRemoteServersStore.getState extends () => {
        sendThreadCommand: infer T;
      }
        ? T
        : never,
      scheduleServerRefresh: vi.fn<() => void>(),
    });
  });

  it("sends a single remove-threads archive command to a capable remote host", async () => {
    noteBulkThreadRemovalCapability("srv-1", true);
    const project = makeRemoteProject("srv-1", "p1");
    const t1 = makeRemoteThread("srv-1", "t1");
    const t2 = makeRemoteThread("srv-1", "t2");
    useAppStore.setState({ projects: [project], threads: [t1, t2] });

    archiveThreads([t1, t2]);

    await vi.waitFor(() => expect(sendThreadCommand).toHaveBeenCalledTimes(1));
    expect(sendThreadCommand).toHaveBeenCalledWith("srv-1", {
      kind: "remove-threads",
      threadId: "t1",
      threadIds: ["t1", "t2"],
      action: "archive",
    });
  });

  it("sends a single remove-threads delete command with removeOwnedWorktrees to a capable remote host", async () => {
    noteBulkThreadRemovalCapability("srv-1", true);
    const project = makeRemoteProject("srv-1", "p1");
    const t1 = makeRemoteThread("srv-1", "t1", "p1", {
      worktreePath: "/repo/p1/.poracode/worktrees/w1",
    });
    const t2 = makeRemoteThread("srv-1", "t2", "p1", {
      worktreePath: "/repo/p1/.poracode/worktrees/w2",
    });
    useAppStore.setState({ projects: [project], threads: [t1, t2] });

    deleteThreadsAndOwnedWorktrees([t1, t2]);

    await vi.waitFor(() => expect(sendThreadCommand).toHaveBeenCalledTimes(1));
    expect(sendThreadCommand).toHaveBeenCalledWith("srv-1", {
      kind: "remove-threads",
      threadId: "t1",
      threadIds: ["t1", "t2"],
      action: "delete",
      removeOwnedWorktrees: true,
    });
  });

  it("falls back to per-thread commands for an older remote host without bulkThreadRemoval", async () => {
    noteBulkThreadRemovalCapability("srv-old", false);
    const project = makeRemoteProject("srv-old", "p1");
    const t1 = makeRemoteThread("srv-old", "t1");
    const t2 = makeRemoteThread("srv-old", "t2");
    useAppStore.setState({ projects: [project], threads: [t1, t2] });

    archiveThreads([t1, t2]);

    await vi.waitFor(() => expect(sendThreadCommand).toHaveBeenCalledTimes(2));
    expect(sendThreadCommand).toHaveBeenNthCalledWith(1, "srv-old", {
      kind: "archive",
      threadId: "t1",
    });
    expect(sendThreadCommand).toHaveBeenNthCalledWith(2, "srv-old", {
      kind: "archive",
      threadId: "t2",
    });
  });

  it("groups threads by owning host and sends one bulk command per remote machine", async () => {
    noteBulkThreadRemovalCapability("srv-a", true);
    noteBulkThreadRemovalCapability("srv-b", true);
    const pa = makeRemoteProject("srv-a", "p1");
    const pb = makeRemoteProject("srv-b", "p1");
    const a1 = makeRemoteThread("srv-a", "a1");
    const a2 = makeRemoteThread("srv-a", "a2");
    const b1 = makeRemoteThread("srv-b", "b1");
    const b2 = makeRemoteThread("srv-b", "b2");
    useAppStore.setState({ projects: [pa, pb], threads: [a1, b1, a2, b2] });

    archiveThreads([a1, b1, a2, b2]);

    await vi.waitFor(() => expect(sendThreadCommand).toHaveBeenCalledTimes(2));
    expect(sendThreadCommand).toHaveBeenCalledWith("srv-a", {
      kind: "remove-threads",
      threadId: "a1",
      threadIds: ["a1", "a2"],
      action: "archive",
    });
    expect(sendThreadCommand).toHaveBeenCalledWith("srv-b", {
      kind: "remove-threads",
      threadId: "b1",
      threadIds: ["b1", "b2"],
      action: "archive",
    });
  });

  it("mirrors a host-forwarded remove-threads command locally without echoing", () => {
    const project: Project = {
      id: "local-p1",
      name: "Local",
      location: { kind: "posix", path: "/local" },
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const makeLocal = (id: string): Thread => ({
      id,
      projectId: project.id,
      title: id,
      agentKind: "codex",
      config: { model: "gpt-5.4" },
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
      archived: false,
      done: true,
      starred: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    useAppStore.setState({ projects: [project], threads: [makeLocal("l1"), makeLocal("l2")] });

    applyForwardedRemoteThreadCommand({
      kind: "remove-threads",
      threadId: "l1",
      threadIds: ["l1", "l2"],
      action: "archive",
    });

    expect(useAppStore.getState().threads.every((thread) => thread.archived)).toBe(true);
    expect(sendThreadCommand).not.toHaveBeenCalled();

    applyForwardedRemoteThreadCommand({
      kind: "remove-threads",
      threadId: "l1",
      threadIds: ["l1", "l2"],
      action: "delete",
      removeOwnedWorktrees: true,
    });

    expect(useAppStore.getState().threads).toEqual([]);
    expect(sendThreadCommand).not.toHaveBeenCalled();
  });

  it("rolls back optimistic archiving, surfaces toast.danger, and releases pins when remove-threads rejects", async () => {
    noteBulkThreadRemovalCapability("srv-1", true);
    const project = makeRemoteProject("srv-1", "p1");
    const t1 = makeRemoteThread("srv-1", "t1");
    const t2 = makeRemoteThread("srv-1", "t2");
    useAppStore.setState({
      projects: [project],
      threads: [t1, t2],
      provisioningWorktreeThreadIds: { [t1.id]: true },
    });
    notePendingThreadLaunch(t1.id, true, "cmd-launch-1");
    markPendingThreadCreated(t1.id);
    const pendingCommand = Promise.withResolvers<void>();
    sendThreadCommand.mockImplementationOnce(() => pendingCommand.promise);

    deleteThreads([t1, t2]);

    const removalPromise = peekPendingThreadLaunch(t1.id)?.removal;
    expect(removalPromise).toBeDefined();
    expect(useAppStore.getState().threads.every((thread) => thread.archived)).toBe(true);
    expect(pinnedThreadRowIds().has(t1.id)).toBe(true);
    expect(pinnedThreadRowIds().has(t2.id)).toBe(true);

    pendingCommand.reject(new Error("bulk delete failed"));

    await vi.waitFor(() => {
      expect(toastDanger).toHaveBeenCalledWith("bulk delete failed");
      expect(useAppStore.getState().threads.every((thread) => !thread.archived)).toBe(true);
      expect(pinnedThreadRowIds().size).toBe(0);
    });
    await expect(removalPromise).resolves.toBe(false);
    dropPendingThreadLaunch(t1.id);
  });

  it("awaits async managed-root bulkThreadRemoval capability before dispatching", async () => {
    clientRuntimeState.managedDesktop = true;
    const managedSend = vi.fn<(command: RemoteThreadCommand) => Promise<void>>(
      async () => undefined,
    );
    const project: Project = {
      id: "managed-p1",
      name: "Managed",
      location: { kind: "posix", path: "/managed" },
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const makeManaged = (id: string): Thread => ({
      id,
      projectId: project.id,
      title: id,
      agentKind: "codex",
      config: { model: "gpt-5.4" },
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
      archived: false,
      done: true,
      starred: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    managedLoopbackState.activation = {
      seq: 1,
      client: {
        endpoint: "http://127.0.0.1:43111",
        environment: async () => ({
          capabilities: { bulkThreadRemoval: { versions: [1] } },
        }),
        sendThreadCommand: managedSend,
      },
    };
    useAppStore.setState({
      projects: [project],
      threads: [makeManaged("m1"), makeManaged("m2")],
    });

    archiveThreads(useAppStore.getState().threads);
    await vi.waitFor(() => expect(managedSend).toHaveBeenCalledTimes(1));
    expect(managedSend).toHaveBeenCalledWith({
      kind: "remove-threads",
      threadId: "m1",
      threadIds: ["m1", "m2"],
      action: "archive",
    });

    managedSend.mockClear();
    __resetManagedRootLaunchMetadataCapabilityForTest();
    managedLoopbackState.activation = {
      seq: 2,
      client: {
        endpoint: "http://127.0.0.1:43111",
        environment: async () => ({ capabilities: {} }),
        sendThreadCommand: managedSend,
      },
    };
    useAppStore.setState({
      threads: [makeManaged("m3"), makeManaged("m4")],
    });

    archiveThreads(useAppStore.getState().threads);
    await vi.waitFor(() => expect(managedSend).toHaveBeenCalledTimes(2));
    expect(managedSend).toHaveBeenNthCalledWith(1, { kind: "archive", threadId: "m3" });
    expect(managedSend).toHaveBeenNthCalledWith(2, { kind: "archive", threadId: "m4" });
  });
});
