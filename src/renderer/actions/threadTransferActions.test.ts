import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, Project, Thread } from "@/shared/contracts";
import { RemoteClientError } from "@/shared/remote/client";
import { THREAD_TRANSFER_VERSION, type ThreadTransferCommand } from "@/shared/threadTransfer";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { useProjectGroupStore } from "@/renderer/state/projectGroups/projectGroupStore";
import { getProjectGroupIndex } from "@/renderer/state/projectGroups/useProjectGroups";
import {
  loadThreadTransferPreview,
  moveThreadToHost,
  transferCandidateMembers,
  transferTargetForMember,
} from "./threadTransferActions";

const hosts = vi.hoisted(() => ({
  source: undefined as unknown,
  target: undefined as unknown,
  entityHost: undefined as
    | ((entity: { id: string; remoteServerId?: string; remoteId?: string }) => unknown)
    | undefined,
}));
const actions = vi.hoisted(() => ({
  archiveThread: vi.fn<(threadId: string) => void>(),
  openThread: vi.fn<(threadId: string, options?: unknown) => void>(),
  submitThreadInput: vi.fn<(threadId: string, text: string) => Promise<void>>(async () => {}),
}));

vi.mock("@/renderer/state/entityHost", async (original) => ({
  ...(await original<typeof import("@/renderer/state/entityHost")>()),
  entityHost: (entity: { id: string }) => hosts.entityHost?.(entity) ?? hosts.source,
  hostHandle: () => hosts.target,
}));
vi.mock("./threadActions", async (original) => ({
  ...(await original<typeof import("./threadActions")>()),
  archiveThread: actions.archiveThread,
  openThread: actions.openThread,
}));
vi.mock("./threadRuntimeActions", async (original) => ({
  ...(await original<typeof import("./threadRuntimeActions")>()),
  submitThreadInput: actions.submitThreadInput,
}));

const PACKAGE = Buffer.from("abcdef");
const SHA = "f".repeat(64);
const thread = {
  id: "thread-1",
  projectId: "project-1",
  title: "Picker",
  agentKind: "codex",
  config: { model: "gpt-5" },
  status: "idle",
  attention: "none",
  canResumeWithConfig: false,
  archived: false,
  done: false,
  starred: false,
  presentationMode: "gui",
  createdAt: "2026-11-01T10:00:00Z",
  updatedAt: "2026-11-01T10:00:00Z",
} as Thread;
const moved = { ...thread, id: "moved-1", projectId: "project-b", status: "inactive" } as Thread;
const target = { key: "server", label: "Server", online: true };

type Handlers = Partial<Record<ThreadTransferCommand["kind"], (command: never) => unknown>>;

function readyAgent(kind: string, label: string, model: string): AgentStatus {
  return {
    kind,
    label,
    installed: true,
    authState: "ready",
    capabilities: { presentationModes: ["gui"], models: [{ id: model }] },
  } as unknown as AgentStatus;
}

function fakeHost(
  handlers: Handlers,
  options?: { desktopId?: string; agentStatuses?: { windows: AgentStatus[] } },
) {
  const uploads: Array<{ offset: number; data: Uint8Array }> = [];
  const client = {
    environment: vi.fn<
      () => Promise<{ capabilities: { threadTransfer: { versions: number[] } }; desktopId: string }>
    >(async () => ({
      capabilities: { threadTransfer: { versions: [THREAD_TRANSFER_VERSION] } },
      desktopId: options?.desktopId ?? "host",
    })),
    agentStatuses: vi.fn<(input?: unknown) => Promise<{ windows: AgentStatus[] }>>(async () => ({
      windows: options?.agentStatuses?.windows ?? [],
    })),
    threadTransfer: vi.fn<(command: ThreadTransferCommand) => Promise<unknown>>(async (command) => {
      const handler = handlers[command.kind];
      if (!handler) throw new Error(`unexpected ${command.kind}`);
      return handler(command as never);
    }),
    interruptThread: vi.fn<(threadId: string) => Promise<void>>(async () => {}),
    uploadThreadTransferChunk: vi.fn<
      (input: { offset: number; data: Uint8Array }) => Promise<number>
    >(async (input) => {
      uploads.push(input);
      return input.offset + input.data.length;
    }),
  };
  const host = {
    kind: "paired",
    connectionKey: "key",
    hostId: "host-thread-1",
    withClient: <T>(run: (value: typeof client) => T) => run(client),
    adoptThreadRow: (row: Thread) => ({ ...row, id: `view:${row.id}` }),
  };
  return {
    client,
    host,
    uploads,
    kinds: () => client.threadTransfer.mock.calls.map(([c]) => c.kind),
  };
}

function source(gitBasis = 1) {
  return fakeHost(sourceHandlers(gitBasis));
}

function sourceHandlers(gitBasis = 1): Handlers {
  return {
    describe: () => ({ kind: "describe", source: { git: null } }),
    export: () => ({
      kind: "export",
      transferId: "x",
      byteLength: PACKAGE.length,
      sha256: SHA,
      summary: {
        itemCount: 2,
        turnCount: 1,
        attachmentCount: 0,
        git: { head: "a".repeat(40), changedFiles: 1, basisCount: gitBasis, bundleBytes: 10 },
      },
    }),
    // The source answers at most four bytes per read, so the move takes two rounds.
    read: (command: { offset: number }) => ({
      kind: "read",
      offset: command.offset,
      data: PACKAGE.subarray(command.offset, command.offset + 4).toString("base64"),
    }),
    release: () => ({ kind: "release", ok: true }),
  };
}

function destination(commit: (command: never) => unknown) {
  return fakeHost({
    plan: () => ({ kind: "plan", projects: [], haves: ["b".repeat(40)] }),
    commit,
    abort: () => ({ kind: "abort", ok: true }),
  });
}

const committed = {
  kind: "commit",
  thread: moved,
  branch: "feature",
  branchRenamed: false,
  replayed: false,
};

describe("loadThreadTransferPreview", () => {
  beforeEach(() => {
    hosts.entityHost = undefined;
  });

  it("plans against the chosen project and returns the target's ready chat agents, source first", async () => {
    const from = fakeHost(
      { describe: () => ({ kind: "describe", source: { git: null } }) },
      { desktopId: "source-host" },
    );
    const claude = readyAgent("claude", "Claude", "sonnet");
    const codex = readyAgent("codex", "Codex", "gpt-5");
    const planCommands: ThreadTransferCommand[] = [];
    const to = fakeHost(
      {
        plan: (command) => {
          planCommands.push(command);
          return {
            kind: "plan",
            projects: [{ projectId: "project-b", name: "Bee", matched: true, git: true }],
            haves: [],
          };
        },
      },
      { desktopId: "target-host", agentStatuses: { windows: [claude, codex] } },
    );
    hosts.source = from.host;
    hosts.target = to.host;

    const preview = await loadThreadTransferPreview(thread, target, "project-b");

    expect(planCommands[0]).toMatchObject({
      kind: "plan",
      projectId: "project-b",
      repoIdentities: [],
    });
    expect(preview.project).toMatchObject({ projectId: "project-b", name: "Bee", git: true });
    // The thread's own agent (codex) sorts ahead of the other ready agent, and
    // each entry is the full status the composer needs, not a slim label/model.
    expect(preview.agents.map((agent) => agent.kind)).toEqual(["codex", "claude"]);
    expect(preview.agents[0]).toMatchObject({ kind: "codex", label: "Codex" });
    expect(preview.agents[0]!.capabilities).toBeDefined();
    expect(preview.sourceAgentReady).toBe(true);
  });

  it("returns no project when the chosen one is gone from the target", async () => {
    const from = fakeHost(
      { describe: () => ({ kind: "describe", source: { git: null } }) },
      { desktopId: "source-host" },
    );
    const to = fakeHost(
      {
        plan: () => ({
          kind: "plan",
          projects: [{ projectId: "other", name: "Other", matched: false, git: true }],
          haves: [],
        }),
      },
      { desktopId: "target-host" },
    );
    hosts.source = from.host;
    hosts.target = to.host;

    const preview = await loadThreadTransferPreview(thread, target, "project-b");

    expect(preview.project).toBeUndefined();
  });

  it("refuses a host without the transfer capability before any command", async () => {
    const from = fakeHost(
      { describe: () => ({ kind: "describe", source: { git: null } }) },
      { desktopId: "source-host" },
    );
    const to = fakeHost(
      { plan: () => ({ kind: "plan", projects: [], haves: [] }) },
      { desktopId: "target-host" },
    );
    to.client.environment.mockResolvedValue({
      capabilities: { threadTransfer: { versions: [] } },
      desktopId: "target-host",
    });
    hosts.source = from.host;
    hosts.target = to.host;

    await expect(loadThreadTransferPreview(thread, target, "project-b")).rejects.toThrow(
      /Update .* to move threads/,
    );
    expect(from.client.threadTransfer).not.toHaveBeenCalled();
    expect(to.client.threadTransfer).not.toHaveBeenCalled();
  });

  it("keeps the preview usable when the target's agent roster cannot be read", async () => {
    const from = fakeHost(
      { describe: () => ({ kind: "describe", source: { git: null } }) },
      { desktopId: "source-host" },
    );
    const to = fakeHost(
      {
        plan: () => ({
          kind: "plan",
          projects: [{ projectId: "project-b", name: "Bee", matched: true, git: true }],
          haves: [],
        }),
      },
      { desktopId: "target-host" },
    );
    to.client.agentStatuses.mockRejectedValue(new Error("roster unavailable"));
    hosts.source = from.host;
    hosts.target = to.host;

    const preview = await loadThreadTransferPreview(thread, target, "project-b");

    expect(preview.agents).toEqual([]);
    expect(preview.sourceAgentReady).toBe(true);
  });
});

describe("moveThreadToHost", () => {
  beforeEach(() => {
    useAppStore.setState({ threads: [thread] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("streams the package, commits, archives the original and continues on the new host", async () => {
    const from = source();
    const to = destination(() => committed);
    hosts.source = from.host;
    hosts.target = to.host;
    const phases: string[] = [];
    const outcome = await moveThreadToHost({
      thread,
      target,
      projectId: "project-b",
      continuePrompt: "  carry on  ",
      onProgress: (progress) => phases.push(progress.phase),
    });
    expect(from.kinds()).toEqual(["export", "read", "read", "release", "describe"]);
    expect(to.kinds()).toEqual(["plan", "commit"]);
    expect(from.client.threadTransfer.mock.calls[0]![0]).toMatchObject({
      threadId: "host-thread-1",
      haves: ["b".repeat(40)],
    });
    expect(to.uploads.map((upload) => [upload.offset, upload.data.length])).toEqual([
      [0, 4],
      [4, 2],
    ]);
    expect(phases).toEqual(["packaging", "transferring", "transferring", "restoring", "finishing"]);
    expect(actions.archiveThread).toHaveBeenCalledWith("thread-1");
    expect(actions.openThread).toHaveBeenCalledWith("view:moved-1", { reopenRuntime: false });
    expect(actions.submitThreadInput).toHaveBeenCalledWith("view:moved-1", "carry on");
    expect(outcome).toMatchObject({
      targetLabel: "Server",
      branch: "feature",
      continueFailed: false,
    });
  });

  it("asks again with the same commit when the first answer was lost", async () => {
    const from = source();
    const commit = vi
      .fn<(command: never) => unknown>()
      .mockRejectedValueOnce(
        new RemoteClientError("lost", 0, "network_error", { requestMayHaveCommitted: true }),
      )
      .mockResolvedValueOnce({ ...committed, replayed: true });
    const to = destination(commit);
    hosts.source = from.host;
    hosts.target = to.host;
    await moveThreadToHost({ thread, target, projectId: "project-b" });
    expect(commit).toHaveBeenCalledTimes(2);
    expect(commit.mock.calls[1]![0]).toEqual(commit.mock.calls[0]![0]);
  });

  it("stops a working agent, waits for it to settle, then resumes on the new host", async () => {
    let describes = 0;
    const from = fakeHost({
      ...sourceHandlers(),
      // Busy until the host has persisted the interrupted turn.
      describe: () => ({
        kind: "describe",
        source: { ...(describes++ === 0 ? { blocker: "busy" } : {}), git: null },
      }),
    });
    const commit = vi.fn<(command: never) => unknown>(() => committed);
    const to = destination(commit);
    hosts.source = from.host;
    hosts.target = to.host;
    useAppStore.setState({ threads: [{ ...thread, status: "working" }] });
    const phases: string[] = [];
    await moveThreadToHost({
      thread,
      target,
      projectId: "project-b",
      stopFirst: true,
      agent: { kind: "claude", config: { model: "sonnet" } },
      onProgress: (progress) => phases.push(progress.phase),
    });
    expect(from.client.interruptThread).toHaveBeenCalledWith("host-thread-1");
    expect(from.kinds().slice(0, 3)).toEqual(["describe", "describe", "export"]);
    expect(phases[0]).toBe("stopping");
    expect(commit.mock.calls[0]![0]).toMatchObject({
      agent: { kind: "claude", config: { model: "sonnet" } },
    });
    // The stopped run resumes on the target without the user typing anything.
    expect(actions.submitThreadInput).toHaveBeenCalledWith(
      "view:moved-1",
      "Continue where you left off.",
    );
    // The host confirmed the stop and still reports the thread settled after the
    // commit, so the lagging local row does not keep the original open.
    expect(actions.archiveThread).toHaveBeenCalledWith("thread-1");
  });

  it("keeps the source open when the host reports it busy after the commit", async () => {
    const from = fakeHost({
      ...sourceHandlers(),
      describe: () => ({
        kind: "describe",
        source: { blocker: "busy", git: null },
      }),
    });
    const to = destination(() => committed);
    hosts.source = from.host;
    hosts.target = to.host;
    const outcome = await moveThreadToHost({ thread, target, projectId: "project-b" });
    expect(outcome.thread.id).toBe("view:moved-1");
    expect(actions.archiveThread).not.toHaveBeenCalled();
  });

  it("keeps the source open when the settling describe fails", async () => {
    const from = fakeHost({
      ...sourceHandlers(),
      describe: () => {
        throw new Error("source host gone");
      },
    });
    const to = destination(() => committed);
    hosts.source = from.host;
    hosts.target = to.host;
    const outcome = await moveThreadToHost({ thread, target, projectId: "project-b" });
    expect(outcome.thread.id).toBe("view:moved-1");
    expect(actions.archiveThread).not.toHaveBeenCalled();
  });

  it("does not interrupt a run that already settled and sends no follow-up", async () => {
    const from = fakeHost({
      ...sourceHandlers(),
      // The host already reports the thread settled: nothing to stop.
      describe: () => ({ kind: "describe", source: { git: null } }),
    });
    const to = destination(() => committed);
    hosts.source = from.host;
    hosts.target = to.host;
    await moveThreadToHost({
      thread,
      target,
      projectId: "project-b",
      stopFirst: true,
    });
    expect(from.client.interruptThread).not.toHaveBeenCalled();
    expect(actions.submitThreadInput).not.toHaveBeenCalled();
    // The store thread is idle, so the original still archives after the move.
    expect(actions.archiveThread).toHaveBeenCalledWith("thread-1");
  });

  it("gives up when a stopped run never settles and sends nothing", async () => {
    vi.useFakeTimers();
    try {
      const from = fakeHost({
        ...sourceHandlers(),
        describe: () => ({ kind: "describe", source: { blocker: "busy", git: null } }),
      });
      const to = destination(() => committed);
      hosts.source = from.host;
      hosts.target = to.host;
      const attempt = moveThreadToHost({
        thread,
        target,
        projectId: "project-b",
        stopFirst: true,
      });
      // The rejection lands while the timers advance; keep it handled meanwhile.
      void attempt.catch(() => undefined);
      await vi.advanceTimersByTimeAsync(31_000);
      await expect(attempt).rejects.toThrow(/did not stop in time/);
      expect(from.client.interruptThread).toHaveBeenCalledTimes(1);
      expect(from.kinds()).not.toContain("export");
      expect(to.kinds()).toEqual([]);
      expect(actions.archiveThread).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a stopped run when the move fails after the interrupt", async () => {
    let describes = 0;
    const from = fakeHost({
      ...sourceHandlers(),
      describe: () => ({
        kind: "describe",
        source: { ...(describes++ === 0 ? { blocker: "busy" } : {}), git: null },
      }),
      export: () => {
        throw new Error("packaging exploded");
      },
    });
    const to = destination(() => committed);
    hosts.source = from.host;
    hosts.target = to.host;
    useAppStore.setState({ threads: [{ ...thread, status: "working" }] });
    await expect(
      moveThreadToHost({
        thread,
        target,
        projectId: "project-b",
        stopFirst: true,
      }),
    ).rejects.toThrow(/The agent was stopped here, but the move didn't finish:/);
    expect(from.client.interruptThread).toHaveBeenCalledWith("host-thread-1");
    expect(actions.archiveThread).not.toHaveBeenCalled();
  });

  it("offers the project's other environments as members and resolves their transfer targets", () => {
    hosts.entityHost = undefined;
    const stamp = "2026-11-01T10:00:00.000Z";
    const local = {
      id: "project-1",
      name: "App",
      location: { kind: "posix", path: "/app" },
      createdAt: stamp,
    } as Project;
    const mirror = (id: string, remoteServerId: string, remoteId = "app"): Project =>
      ({
        id,
        name: "App",
        remoteServerId,
        remoteId,
        location: { kind: "posix", path: "/app", remoteServerId },
        createdAt: stamp,
      }) as Project;
    useAppStore.setState({
      projects: [
        local,
        mirror("remote:mac:project:app", "mac"),
        mirror("remote:mini:project:app", "mini"),
        mirror("remote:env-1:project:app", "env-1"),
      ],
      threads: [thread],
    });
    useGitStore.setState({ statuses: {} });
    useProjectGroupStore.setState({ manualGroups: {}, lastUsedAt: {} });
    useRemoteServersStore.setState({
      servers: [
        { desktopId: "mac", label: "MacBook" },
        { desktopId: "mini", label: "Mac mini" },
        {
          desktopId: "env-child",
          connectionId: "env-1",
          label: "Poracode on GPU box",
          transport: { kind: "environment", environmentId: "e1", managedHostDesktopId: "me" },
        },
      ] as never,
      runtime: {
        mac: { status: "online", projects: [], threads: [] },
        mini: { status: "offline", projects: [], threads: [] },
        "env-1": { status: "online", projects: [], threads: [] },
      } as never,
    });
    hosts.entityHost = (entity) => {
      const key = entity.remoteServerId;
      if (!key) {
        return {
          kind: "managed",
          connectionKey: undefined,
          hostId: entity.id,
          isConnected: () => true,
        };
      }
      return {
        kind: "paired",
        connectionKey: key,
        hostId: entity.remoteId ?? entity.id,
        isConnected: () => useRemoteServersStore.getState().runtime[key]?.status === "online",
      };
    };

    // The local member shares the thread's host, so only the three remote
    // environments are offered — in group order, offline ones included.
    const members = getProjectGroupIndex().groupByProjectId.get(thread.projectId)?.members ?? [];
    const candidates = transferCandidateMembers(thread, members);
    expect(candidates.map((member) => member.id)).toEqual([
      "remote:mac:project:app",
      "remote:mini:project:app",
      "remote:env-1:project:app",
    ]);
    expect(candidates.map((member) => transferTargetForMember(member))).toEqual([
      {
        target: { key: "mac", label: "MacBook", online: true },
        hostProjectId: "app",
      },
      {
        target: { key: "mini", label: "Mac mini", online: false },
        hostProjectId: "app",
      },
      {
        target: { key: "env-1", label: "GPU box", online: true, viaThisComputer: true },
        hostProjectId: "app",
      },
    ]);
    hosts.entityHost = undefined;
  });

  it("refuses unrelated history before sending anything and cleans up both sides", async () => {
    const from = source(0);
    const to = destination(() => committed);
    hosts.source = from.host;
    hosts.target = to.host;
    await expect(moveThreadToHost({ thread, target, projectId: "project-b" })).rejects.toThrow(
      /share history/,
    );
    expect(from.kinds()).toEqual(["export", "release"]);
    expect(to.kinds()).toEqual(["plan", "abort"]);
    expect(actions.archiveThread).not.toHaveBeenCalled();
  });
});
