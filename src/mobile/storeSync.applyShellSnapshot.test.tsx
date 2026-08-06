import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import type { RemoteShellSnapshot } from "@/shared/remote";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitReadModelStore } from "@/renderer/state/gitReadModelStore";
import { emptyGitStateSnapshot } from "@/shared/gitState";
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

function makeShellSnapshot(
  threads: Thread[],
  projects: RemoteShellSnapshot["projects"] = [],
): RemoteShellSnapshot {
  return {
    snapshotSeq: 1,
    projects,
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

  it("clears a finished badge only when the metadata event explicitly marks it viewed", () => {
    useAppStore.setState({ threads: [makeThread("finished")] });

    dispatchRemoteSupervisorEvent({
      type: "remote-threads-changed",
      threadIds: [THREAD_ID],
      viewedThreadIds: [THREAD_ID],
    });

    expect(threadStatus()).toBe("idle");
    applyShellSnapshot(makeShellSnapshot([makeThread("idle")]));
    expect(threadStatus()).toBe("idle");
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

  it("does not restore a finished badge onto an open thread", () => {
    useAppStore.setState({ threads: [makeThread("finished")] });
    useAppStore.getState().openThread(THREAD_ID);

    applyShellSnapshot(makeShellSnapshot([makeThread("finished")]));

    expect(threadStatus()).toBe("idle");
  });

  it("preserves unchanged project and thread identities", () => {
    const project = {
      id: "proj-1",
      name: "Demo",
      location: { kind: "windows" as const, path: "C:\\demo" },
      createdAt: "2026-03-21T10:00:00.000Z",
    };
    const firstThread = makeThread("working");
    const secondThread = makeThread("working", { id: "thread-2", title: "Other" });
    applyShellSnapshot(makeShellSnapshot([firstThread, secondThread], [project]));
    const before = useAppStore.getState();

    applyShellSnapshot(
      makeShellSnapshot(
        [{ ...firstThread }, { ...secondThread }],
        [{ ...project, location: { ...project.location } }],
      ),
    );
    const after = useAppStore.getState();

    expect(after.projects).toBe(before.projects);
    expect(after.projects[0]).toBe(before.projects[0]);
    expect(after.threads).toBe(before.threads);
    expect(after.threads[0]).toBe(before.threads[0]);
    expect(after.threads[1]).toBe(before.threads[1]);
  });

  it("replaces only the thread that changed", () => {
    const firstThread = makeThread("working");
    const secondThread = makeThread("working", { id: "thread-2", title: "Other" });
    applyShellSnapshot(makeShellSnapshot([firstThread, secondThread]));
    const before = useAppStore.getState().threads;

    applyShellSnapshot(
      makeShellSnapshot([{ ...firstThread, title: "Renamed" }, { ...secondThread }]),
    );
    const after = useAppStore.getState().threads;

    expect(after).not.toBe(before);
    expect(after[0]).not.toBe(before[0]);
    expect(after[1]).toBe(before[1]);
  });

  it("closes an open thread pane when the authoritative snapshot removes it", () => {
    useAppStore.setState({ threads: [makeThread("idle")] });
    useAppStore.getState().openThread(THREAD_ID);

    applyShellSnapshot(makeShellSnapshot([]));

    expect(useAppStore.getState().threads).toEqual([]);
    expect(useAppStore.getState().view).toEqual({ kind: "home" });
  });

  it("closes an open project draft when the authoritative snapshot removes it", () => {
    const project = {
      id: "proj-1",
      name: "Demo",
      location: { kind: "windows" as const, path: "C:\\demo" },
      createdAt: "2026-03-21T10:00:00.000Z",
    };
    useAppStore.setState({
      projects: [project],
      view: { kind: "draft", projectId: project.id },
    });

    applyShellSnapshot(makeShellSnapshot([]));

    expect(useAppStore.getState().projects).toEqual([]);
    expect(useAppStore.getState().view).toEqual({ kind: "home" });
  });

  it("hydrates the host-owned Git read model from the shell snapshot", () => {
    applyShellSnapshot({
      ...makeShellSnapshot([]),
      gitState: { ...emptyGitStateSnapshot(), revision: 4 },
    });

    expect(useGitReadModelStore.getState().revision).toBe(4);
  });
});
