import { beforeEach, describe, expect, it } from "vitest";
import type { Thread } from "@/shared/contracts";
import { useAppStore } from "../appStore";

function makeThread() {
  const store = useAppStore.getState();
  const project = store.addProject({ kind: "windows", path: "C:\\fixture" });
  return store.createThread({
    projectId: project.id,
    agentKind: "example",
    config: { model: "model-a" },
    prompt: "start",
    presentationMode: "gui",
  });
}
function stateFor(status: Thread["status"], interruptedTurn?: Thread["interruptedTurn"] | null) {
  return {
    agentKind: "example",
    status,
    attention: "none" as const,
    canResumeWithConfig: true,
    ...(interruptedTurn !== undefined ? { interruptedTurn } : {}),
  };
}
function current(threadId: string) {
  return useAppStore.getState().threads.find((thread) => thread.id === threadId)!;
}
beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({ projects: [], threads: [], view: { kind: "home" } });
});

describe("cut-off turn marker", () => {
  it("keeps the marker through events that do not state it", () => {
    const thread = makeThread();
    const store = useAppStore.getState();
    store.updateThreadRuntime(thread.id, stateFor("error", "error"));
    expect(current(thread.id).interruptedTurn).toBe("error");
    store.updateThreadRuntime(thread.id, stateFor("idle"));
    expect(current(thread.id).interruptedTurn).toBe("error");
  });

  it("drops the marker when a turn starts or the host clears it", () => {
    const thread = makeThread();
    const store = useAppStore.getState();
    store.updateThreadRuntime(thread.id, stateFor("inactive", "restart"));
    // An optimistic send starts the turn without stating the marker.
    store.updateThreadRuntime(thread.id, stateFor("working"));
    expect(current(thread.id).interruptedTurn).toBeUndefined();

    store.updateThreadRuntime(thread.id, stateFor("idle", "error"));
    store.updateThreadRuntime(thread.id, stateFor("idle", null));
    expect(current(thread.id).interruptedTurn).toBeUndefined();
  });

  it("applies a marker-only change", () => {
    const thread = makeThread();
    const store = useAppStore.getState();
    store.updateThreadRuntime(thread.id, stateFor("idle"));
    const before = current(thread.id);
    store.updateThreadRuntime(thread.id, stateFor("idle", "error"));
    expect(current(thread.id)).not.toBe(before);
    expect(current(thread.id).interruptedTurn).toBe("error");
  });
});
