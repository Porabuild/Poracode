import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "../state/appStore";
import { applyRemoteThreadStartCommand } from "./remoteStartCommandActions";
import type { RemoteThreadCommand } from "@/shared/contracts";

type StartCommand = Extract<RemoteThreadCommand, { kind: "start" }>;

function startCommand(overrides: Partial<StartCommand> = {}): StartCommand {
  return {
    kind: "start",
    threadId: "thread-1",
    projectId: "project-1",
    agentKind: "codex",
    config: { model: "gpt-5" },
    prompt: "next step",
    presentationMode: "gui",
    ...overrides,
  };
}

function seedSwitchedThread() {
  const store = useAppStore.getState();
  const project = store.addProject({ kind: "windows", path: "C:\\repo" });
  const thread = store.createThread({
    threadId: "thread-1",
    projectId: project.id,
    agentKind: "claude",
    config: { model: "claude-opus-5" },
    prompt: "start the task",
    presentationMode: "gui",
  });
  store.updateThreadRuntime(thread.id, {
    status: "idle",
    attention: "none",
    canResumeWithConfig: true,
    sessionRef: {
      providerSessionId: "claude-session-1",
      discoveredAt: "2026-08-29T00:00:00.000Z",
    },
  });
  return thread;
}

describe("applyRemoteThreadStartCommand", () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState((state) => ({
      ...state,
      projects: [],
      threads: [],
      pendingThreadLaunches: {},
      pendingLaunchSegments: {},
      pendingLaunchUserMessageItemIds: {},
      pendingLaunchProviderSwitches: {},
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      view: { kind: "home" },
    }));
  });

  it("retargets an existing thread on a switched start without queueing a launch", () => {
    const thread = seedSwitchedThread();

    applyRemoteThreadStartCommand(
      startCommand({
        threadId: thread.id,
        providerSwitch: { fromAgentKind: "claude", handoffItemId: "handoff-1" },
      }),
    );

    const after = useAppStore.getState().threads.find((t) => t.id === thread.id);
    expect(after).toMatchObject({
      agentKind: "codex",
      status: "launching",
      presentationMode: "gui",
    });
    expect(after?.sessionRef).toBeUndefined();
    // The durable supervisor event paints the divider only after launch setup succeeds.
    expect(useAppStore.getState().runtimeItemIdsByThread[thread.id]).toBeUndefined();
    // The HTTP path that forwarded the command owns the supervisor launch.
    expect(useAppStore.getState().pendingThreadLaunches[thread.id]).toBeUndefined();
  });

  it("ignores a plain start for a thread that already exists", () => {
    const thread = seedSwitchedThread();
    const before = useAppStore.getState().threads.find((t) => t.id === thread.id);

    applyRemoteThreadStartCommand(startCommand({ threadId: thread.id, agentKind: "codex" }));

    const after = useAppStore.getState().threads.find((t) => t.id === thread.id);
    expect(after).toBe(before);
  });

  it("applies the restored status on a reverted switch instead of parking at launching", () => {
    const thread = seedSwitchedThread();

    applyRemoteThreadStartCommand(
      startCommand({
        threadId: thread.id,
        providerSwitch: { fromAgentKind: "claude", previousStatus: "inactive" },
      }),
    );

    const after = useAppStore.getState().threads.find((t) => t.id === thread.id);
    expect(after).toMatchObject({ agentKind: "codex", status: "inactive" });
  });

  it("creates and queues a launch for a thread the store does not have yet", () => {
    const project = useAppStore.getState().addProject({ kind: "windows", path: "C:\\repo" });

    applyRemoteThreadStartCommand(
      startCommand({
        threadId: "thread-new",
        projectId: project.id,
        title: "TICKET-1",
        userMessageItemId: "user-1",
      }),
    );

    const created = useAppStore.getState().threads.find((t) => t.id === "thread-new");
    expect(created).toMatchObject({ agentKind: "codex", title: "TICKET-1" });
    expect(useAppStore.getState().pendingThreadLaunches["thread-new"]).toBe("next step");
    expect(useAppStore.getState().pendingLaunchUserMessageItemIds["thread-new"]).toBe("user-1");
  });
});
