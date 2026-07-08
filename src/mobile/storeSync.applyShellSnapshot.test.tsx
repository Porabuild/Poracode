import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import type { RemoteShellSnapshot } from "@/shared/remote";
import { useAppStore } from "@/renderer/state/appStore";
import { applyShellSnapshot, dispatchRemoteSupervisorEvent, resetRemoteStores } from "./storeSync";

// The thread-state dispatch fans out to the desktop notification helper, which
// reads the Electron bridge — absent in this environment and irrelevant here.
vi.mock("@/renderer/notifications", () => ({
  handleThreadStateNotification: vi.fn<() => void>(),
}));

const THREAD_ID = "thread-1";

function makeThread(status: Thread["status"], overrides: Partial<Thread> = {}): Thread {
  return {
    id: THREAD_ID,
    projectId: "proj-1",
    title: "Demo",
    agentKind: "claude",
    config: { model: "sonnet" },
    status,
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    ...overrides,
  };
}

function makeShellSnapshot(threads: Thread[]): RemoteShellSnapshot {
  return {
    snapshotSeq: 1,
    projects: [],
    threads,
    runtimeSummariesByThread: {},
    updatedAt: "2026-03-21T10:00:00.000Z",
  };
}

function threadStatus(): Thread["status"] | undefined {
  return useAppStore.getState().threads.find((thread) => thread.id === THREAD_ID)?.status;
}

describe("applyShellSnapshot", () => {
  beforeEach(() => {
    resetRemoteStores();
    useAppStore.setState({ view: { kind: "home" } });
  });

  afterEach(() => {
    resetRemoteStores();
  });

  it("keeps the client-derived finished badge when the server row still says idle", () => {
    // A working thread completes while the user is on the threads list: the
    // live event downgrades idle -> finished (unwatched completion badge)...
    useAppStore.setState({ threads: [makeThread("working")] });
    dispatchRemoteSupervisorEvent({
      type: "thread-state",
      threadId: THREAD_ID,
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
    });
    expect(threadStatus()).toBe("finished");

    // ...and the shell refresh that same event triggers must not strip it —
    // the server only ever persists "idle"; "finished" exists client-side.
    applyShellSnapshot(makeShellSnapshot([makeThread("idle")]));
    expect(threadStatus()).toBe("finished");
  });

  it("applies non-idle snapshot statuses over a local finished badge", () => {
    useAppStore.setState({ threads: [makeThread("finished")] });
    applyShellSnapshot(makeShellSnapshot([makeThread("working")]));
    expect(threadStatus()).toBe("working");
  });

  it("applies idle when the local thread is not finished or is unknown", () => {
    useAppStore.setState({ threads: [makeThread("working")] });
    applyShellSnapshot(makeShellSnapshot([makeThread("idle")]));
    expect(threadStatus()).toBe("idle");

    useAppStore.setState({ threads: [] });
    applyShellSnapshot(makeShellSnapshot([makeThread("idle")]));
    expect(threadStatus()).toBe("idle");
  });

  it("lets idle through once the user has opened the thread", () => {
    useAppStore.setState({ threads: [makeThread("finished")] });
    useAppStore.getState().openThread(THREAD_ID);
    applyShellSnapshot(makeShellSnapshot([makeThread("idle")]));
    expect(threadStatus()).toBe("idle");
  });
});
