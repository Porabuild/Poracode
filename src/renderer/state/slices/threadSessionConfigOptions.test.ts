import { beforeEach, describe, expect, it } from "vitest";
import type { SessionConfigOptions } from "@/shared/contracts/sessionConfigOptions";
import { useAppStore } from "../appStore";

const inventory: SessionConfigOptions = [
  {
    id: "reasoning",
    type: "select",
    role: "effort",
    currentValue: "high",
    values: [{ value: "high" }, { value: "low" }],
    groups: [],
  },
];
function makeThread() {
  const store = useAppStore.getState();
  const project = store.addProject({ kind: "windows", path: "C:\\fixture" });
  return store.createThread({
    projectId: project.id,
    agentKind: "example",
    config: { model: "model-a", effort: "high" },
    prompt: "start",
    presentationMode: "gui",
  });
}
function stateFor(threadId: string, options?: SessionConfigOptions | null) {
  return {
    threadId,
    agentKind: "example",
    status: "idle" as const,
    attention: "none" as const,
    canResumeWithConfig: true,
    ...(options !== undefined ? { sessionConfigOptions: options } : {}),
  };
}
beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    projects: [],
    threads: [],
    view: { kind: "home" },
    lastRuntimeConfigByThreadId: {},
    runtimeLaunchConfigByThreadId: {},
    threadMentionToolsAvailableByThreadId: {},
  });
});

describe("per-thread live control inventories", () => {
  it("adopts ladder-only changes while preserving a pending effort edit", () => {
    const thread = makeThread();
    const store = useAppStore.getState();
    store.updateThreadRuntime(thread.id, { ...stateFor(thread.id), config: thread.config });
    store.updateThreadConfig(thread.id, { ...thread.config, effort: "low" });
    store.updateThreadRuntime(thread.id, {
      ...stateFor(thread.id, inventory),
      config: thread.config,
    });
    const current = useAppStore.getState().threads.find((t) => t.id === thread.id)!;
    expect(current.config.effort).toBe("low");
    expect(current.sessionConfigOptions).toEqual(inventory);
  });
  it("preserves old-host absence and explicitly retires on null", () => {
    const thread = makeThread();
    const store = useAppStore.getState();
    store.updateThreadRuntime(thread.id, stateFor(thread.id, inventory));
    store.updateThreadRuntime(thread.id, stateFor(thread.id));
    expect(useAppStore.getState().threads[0]?.sessionConfigOptions).toEqual(inventory);
    store.updateThreadRuntime(thread.id, stateFor(thread.id, null));
    expect(useAppStore.getState().threads[0]?.sessionConfigOptions).toBeNull();
  });
  it("accepts snapshot inventories even when scalar state is unchanged", () => {
    const thread = makeThread();
    const store = useAppStore.getState();
    store.updateThreadRuntime(thread.id, stateFor(thread.id));
    store.reconcileRuntimeSnapshots([stateFor(thread.id, inventory)]);
    expect(useAppStore.getState().threads[0]?.sessionConfigOptions).toEqual(inventory);
  });
  it("clears provider-switched metadata and rejects retired events and snapshots", () => {
    const thread = makeThread();
    const store = useAppStore.getState();
    store.updateThreadRuntime(thread.id, stateFor(thread.id, inventory));
    store.applyProviderSwitch(thread.id, {
      agentKind: "replacement",
      config: { model: "model-b" },
      presentationMode: "gui",
    });
    const replacementLaunch = { model: "model-b", effort: "low" };
    store.updateThreadRuntime(thread.id, {
      ...stateFor(thread.id),
      agentKind: "replacement",
      launchConfig: replacementLaunch,
      threadMentionToolsAvailable: true,
      status: "launching",
    });
    store.updateThreadRuntime(thread.id, stateFor(thread.id, inventory));
    store.reconcileRuntimeSnapshots([
      {
        ...stateFor(thread.id, inventory),
        launchConfig: { model: "model-a" },
        threadMentionToolsAvailable: false,
      },
    ]);
    expect(useAppStore.getState().runtimeLaunchConfigByThreadId[thread.id]).toEqual(
      replacementLaunch,
    );
    expect(useAppStore.getState().threadMentionToolsAvailableByThreadId[thread.id]).toBe(true);
    expect(useAppStore.getState().threads[0]?.agentKind).toBe("replacement");
    expect(useAppStore.getState().threads[0]?.sessionConfigOptions).toBeUndefined();
    expect(useAppStore.getState().threads[0]?.status).toBe("launching");
  });
  it.each(["idle", "inactive"] as const)(
    "retires live controls on an authoritative exit from %s",
    (status) => {
      const thread = makeThread();
      const store = useAppStore.getState();
      store.updateThreadRuntime(thread.id, { ...stateFor(thread.id, inventory), status });
      store.markThreadExited(thread.id);
      const retired = useAppStore.getState().threads[0]!;
      expect(retired.status).toBe("inactive");
      expect(retired.sessionConfigOptions).toBeNull();
      expect(retired.config).toEqual(thread.config);
    },
  );

  it.each(["idle", "inactive", "error"] as const)(
    "retires controls when the owned runtime is absent from a full pull (%s)",
    (status) => {
      const thread = makeThread();
      const store = useAppStore.getState();
      store.updateThreadRuntime(thread.id, { ...stateFor(thread.id, inventory), status });
      // A legacy IPC-owned row has no server marker; this full pull owns it.
      useAppStore.setState((state) => ({
        threads: state.threads.map((row) => {
          const { threadStatusSource: _source, ...owned } = row;
          return owned;
        }),
      }));
      store.reconcileRuntimeSnapshots([]);
      const retired = useAppStore.getState().threads[0]!;
      expect(retired.status).toBe(status === "error" ? "error" : "inactive");
      expect(retired.sessionConfigOptions).toBeNull();
      expect(retired.config).toEqual(thread.config);
    },
  );
  it("keeps server-owned metadata when a local runtime pull does not cover it", () => {
    const thread = makeThread();
    const store = useAppStore.getState();
    store.updateThreadRuntime(thread.id, {
      ...stateFor(thread.id, inventory),
      threadStatusSource: "server",
    });
    store.reconcileRuntimeSnapshots([]);
    expect(useAppStore.getState().threads[0]?.sessionConfigOptions).toEqual(inventory);
  });
});
