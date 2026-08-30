import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../state/appStore";
import { useRemoteServersStore } from "../state/remoteServersStore";
import { continueRemoteThreadInNewThread } from "./providerSwitchRemoteActions";
import { buildTranscriptContext } from "./handoffTranscript";
import type { Thread } from "@/shared/contracts";

const originalPoracode = window.poracode;

// Fresh mocks injected via setState each test — spying on `getState()` leaks
// the spied reference through subsequent state spreads.
let launchRemoteThread: ReturnType<
  typeof vi.fn<(input: Record<string, unknown>) => Promise<"started">>
>;
let sendThreadCommand: ReturnType<typeof vi.fn<(...args: unknown[]) => Promise<void>>>;

function mirroredThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "remote:d1:thread:rt-1",
    projectId: "project-1",
    remoteServerId: "d1",
    remoteId: "rt-1",
    agentKind: "claude",
    config: { model: "claude-opus-5" },
    title: "Incident triage",
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-08-29T00:00:00.000Z",
    updatedAt: "2026-08-29T00:00:00.000Z",
    ...overrides,
  };
}

describe("continueRemoteThreadInNewThread", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.poracode = {
      saveHandoffContext: vi.fn<() => Promise<string>>(),
    } as unknown as typeof window.poracode;
    localStorage.clear();
    useAppStore.setState((state) => ({
      ...state,
      projects: [],
      threads: [],
      view: { kind: "home" },
    }));
    launchRemoteThread = vi.fn<() => Promise<"started">>(async () => "started");
    sendThreadCommand = vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
    useRemoteServersStore.setState((state) => ({
      ...state,
      runtime: {
        d1: {
          status: "online",
          projects: [],
          threads: [],
          agentStatuses: { windows: [], wsl: [] },
        },
      } as never,
      launchRemoteThread: launchRemoteThread as never,
      sendThreadCommand: sendThreadCommand as never,
    }));
  });

  function seedSource(overrides: Partial<Thread> = {}) {
    const store = useAppStore.getState();
    const project = store.addProject({ kind: "windows", path: "C:\\repo", remoteServerId: "d1" });
    // Mirror the projection: a mirrored project's remoteId is the HOST project id.
    useAppStore.setState((state) => ({
      projects: state.projects.map((p) =>
        p.id === project.id ? { ...p, remoteServerId: "d1", remoteId: "host-p1" } : p,
      ),
    }));
    const thread = mirroredThread({ projectId: project.id, ...overrides });
    useAppStore.setState((state) => ({ threads: [...state.threads, thread] }));
    return thread;
  }

  afterEach(() => {
    window.poracode = originalPoracode;
  });

  it("creates the replacement as a projected row and launches it on the host", async () => {
    const source = seedSource();

    await continueRemoteThreadInNewThread({
      thread: source,
      targetAgentKind: "codex",
      targetConfig: { model: "gpt-5" },
      targetPresentationMode: "terminal",
      prompt: "next step",
      segments: undefined,
      extractedContext: null,
      title: "Incident triage",
      targetLabel: "Codex",
      fork: false,
    });

    // The optimistic row is projected onto the host thread id.
    const created = useAppStore
      .getState()
      .threads.find((t) => t.remoteServerId === "d1" && t.agentKind === "codex");
    expect(created).toMatchObject({
      remoteId: expect.any(String),
      title: "Incident triage",
      presentationMode: "terminal",
    });
    // Inherited worktree rides along; isNewWorktree must NOT be set — the
    // worktree already exists and prepare-worktree would demand a renderer
    // round-trip.
    expect(launchRemoteThread).toHaveBeenCalledWith(
      expect.objectContaining({
        desktopId: "d1",
        threadId: created?.remoteId,
        // The host PROJECT id, not the mirrored thread's host id.
        projectId: "host-p1",
        agentKind: "codex",
        config: { model: "gpt-5" },
        title: "Incident triage",
      }),
    );
    expect(launchRemoteThread.mock.calls[0]?.[0]).not.toHaveProperty("isNewWorktree");
    // A switch marks the mirrored source done through the host command.
    expect(sendThreadCommand).toHaveBeenCalledWith("d1", {
      kind: "set-done",
      threadId: "rt-1",
      done: true,
    });
  });

  it("groups the fork with its source locally and on the host row", async () => {
    const source = seedSource();

    await continueRemoteThreadInNewThread({
      thread: source,
      targetAgentKind: "codex",
      targetConfig: { model: "gpt-5" },
      targetPresentationMode: "gui",
      prompt: "next step",
      segments: undefined,
      extractedContext: null,
      title: "Incident triage (fork)",
      targetLabel: "Codex",
      fork: true,
    });

    const sourceAfter = useAppStore.getState().threads.find((t) => t.id === source.id);
    const fork = useAppStore
      .getState()
      .threads.find((t) => t.remoteServerId === "d1" && t.agentKind === "codex");
    expect(sourceAfter?.groupId).toBeDefined();
    expect(fork?.groupId).toBe(sourceAfter?.groupId);
    expect(sendThreadCommand).toHaveBeenCalledWith("d1", {
      kind: "set-group",
      threadId: "rt-1",
      groupId: sourceAfter?.groupId,
      groupName: "Incident triage",
    });
  });

  it("creates the projected owner before saving remote handoff context", async () => {
    const source = seedSource();
    const uploadAttachment = vi.fn<(input: { threadId: string }) => Promise<string>>(
      async (input) => {
        expect(
          useAppStore.getState().threads.find((thread) => thread.remoteId === input.threadId),
        ).toMatchObject({ remoteServerId: "d1" });
        return "/repo/.poracode/handoff-context.md";
      },
    );
    useRemoteServersStore.setState({
      withClient: async (_desktopId, invoke) => invoke({ uploadAttachment } as never),
    });

    await continueRemoteThreadInNewThread({
      thread: source,
      targetAgentKind: "codex",
      targetConfig: { model: "gpt-5" },
      targetPresentationMode: "gui",
      prompt: "next step",
      segments: undefined,
      extractedContext: {
        summary: "Prior context",
        sourceProvider: "claude",
        sourceSessionId: "session-1",
        extractedAt: "2026-08-29T00:00:00.000Z",
      },
      title: "Incident triage",
      targetLabel: "Codex",
      fork: true,
    });

    expect(launchRemoteThread).toHaveBeenCalledWith(
      expect.objectContaining({
        segments: expect.arrayContaining([
          expect.objectContaining({
            kind: "attachment",
            path: "/repo/.poracode/handoff-context.md",
          }),
        ]),
      }),
    );
  });

  it("bails without painting rows when the host is unreachable", async () => {
    const source = seedSource();
    useRemoteServersStore.setState((state) => ({ ...state, runtime: {} as never }));

    await continueRemoteThreadInNewThread({
      thread: source,
      targetAgentKind: "codex",
      targetConfig: { model: "gpt-5" },
      targetPresentationMode: "terminal",
      prompt: "next step",
      segments: undefined,
      extractedContext: null,
      title: "Incident triage",
      targetLabel: "Codex",
      fork: false,
    });

    expect(launchRemoteThread).not.toHaveBeenCalled();
    expect(useAppStore.getState().threads).toHaveLength(1);
  });

  it("deletes the optimistic row when the launch fails", async () => {
    const source = seedSource();
    launchRemoteThread.mockRejectedValueOnce(new Error("host offline"));

    await continueRemoteThreadInNewThread({
      thread: source,
      targetAgentKind: "codex",
      targetConfig: { model: "gpt-5" },
      targetPresentationMode: "terminal",
      prompt: "next step",
      segments: undefined,
      extractedContext: null,
      title: "Incident triage",
      targetLabel: "Codex",
      fork: false,
    });

    expect(
      useAppStore.getState().threads.filter((t) => t.remoteServerId === "d1" && t.done !== true),
    ).toHaveLength(1);
  });

  it("stops formatting transcript history once the handoff character budget is filled", () => {
    const source = seedSource();
    const olderItem = Object.defineProperty(
      {
        id: "older",
        type: "user_message",
        state: "completed",
        streams: {},
      },
      "payload",
      {
        get: () => {
          throw new Error("older transcript item should not be formatted");
        },
      },
    );
    useAppStore.setState({
      runtimeItemIdsByThread: { [source.id]: ["older", "latest"] },
      runtimeItemsByIdByThread: {
        [source.id]: {
          older: olderItem,
          latest: {
            id: "latest",
            type: "command_execution",
            state: "completed",
            payload: { command: "build" },
            streams: { command_output: "x".repeat(60_000) },
          },
        },
      },
    } as never);

    const result = buildTranscriptContext(source, "Claude");

    expect(result?.summary).toContain("[earlier transcript truncated]");
    expect(result?.summary).toContain("x".repeat(1_000));
  });
});
