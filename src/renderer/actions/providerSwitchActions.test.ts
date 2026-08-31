import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../state/appStore";
import { switchThreadProviderInPlace } from "./providerSwitchActions";

function itemTypes(threadId: string): string[] {
  const state = useAppStore.getState();
  return (state.runtimeItemIdsByThread[threadId] ?? []).map(
    (itemId) => state.runtimeItemsByIdByThread[threadId]?.[itemId]?.type ?? "?",
  );
}

describe("switchThreadProviderInPlace", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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

  function chatThread() {
    const project = useAppStore.getState().addProject({ kind: "windows", path: "C:\\repo" });
    return useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "claude",
      config: { model: "claude-opus-5" },
      prompt: "start the task",
      presentationMode: "gui",
    });
  }

  async function switchToCodex(threadId: string) {
    const thread = useAppStore.getState().threads.find((row) => row.id === threadId)!;
    await switchThreadProviderInPlace({
      thread,
      targetAgentKind: "codex",
      targetConfig: { model: "gpt-5.4" },
      prompt: "keep going",
      segments: undefined,
      handoffContext: { strategy: "thread-transcript" },
      targetLabel: "Codex",
    });
  }

  it("paints the handoff divider and the user's message before the launch is queued", async () => {
    const thread = chatThread();

    await switchToCodex(thread.id);

    // The launch only reaches the supervisor later; without these rows the pane
    // would show a working indicator with nothing above it.
    expect(itemTypes(thread.id)).toEqual(["provider_handoff", "user_message"]);
  });

  it("queues the launch with the ids it painted, so the supervisor's own rows dedupe", async () => {
    const thread = chatThread();

    await switchToCodex(thread.id);

    const state = useAppStore.getState();
    const [handoffItemId, userMessageItemId] = state.runtimeItemIdsByThread[thread.id] ?? [];
    expect(state.pendingLaunchProviderSwitches[thread.id]).toEqual({
      fromAgentKind: "claude",
      handoffItemId,
      contextStrategy: "thread-transcript",
    });
    expect(state.pendingLaunchUserMessageItemIds[thread.id]).toBe(userMessageItemId);
    expect(state.pendingThreadLaunches[thread.id]).toBe("keep going");
  });

  it("records a context-file switch as such, so the supervisor adds no transcript instruction", async () => {
    const thread = chatThread();
    const row = useAppStore.getState().threads.find((candidate) => candidate.id === thread.id)!;

    await switchThreadProviderInPlace({
      thread: row,
      targetAgentKind: "codex",
      targetConfig: { model: "gpt-5.4" },
      prompt: "keep going",
      segments: undefined,
      handoffContext: { strategy: "context-file", extracted: null },
      targetLabel: "Codex",
    });

    expect(useAppStore.getState().pendingLaunchProviderSwitches[thread.id]).toMatchObject({
      contextStrategy: "context-file",
    });
  });
});
