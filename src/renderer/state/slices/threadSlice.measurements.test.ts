import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "../appStore";
import {
  clearTimelineMeasurementCache,
  readTimelineMeasurements,
  writeTimelineMeasurements,
} from "../timelineMeasurementCache";

const signature = "500:14px";
const measurement = { key: "completed-row", index: 0, size: 184 };

function createThread(id: string, projectId = "project") {
  return useAppStore.getState().createThread({
    threadId: id,
    projectId,
    agentKind: "test-agent",
    config: { model: "auto" },
    prompt: "Measurement owner",
    focus: false,
    suppressHostCreateIntent: true,
  });
}

function cache(id: string) {
  writeTimelineMeasurements(id, signature, [measurement]);
}

beforeEach(() => {
  clearTimelineMeasurementCache();
  useAppStore.setState({
    projects: [],
    threads: [],
    view: { kind: "home" },
    keepAlivePaneIds: [],
    runtimeItemIdsByThread: {},
    runtimeItemsByIdByThread: {},
  });
});

describe("thread measurement snapshot retirement", () => {
  it("forgets a deleted closed thread and keeps every surviving snapshot", () => {
    createThread("removed");
    createThread("survivor");
    cache("removed");
    cache("survivor");

    useAppStore.getState().deleteThread("removed");

    expect(useAppStore.getState().threads.map((thread) => thread.id)).toEqual(["survivor"]);
    expect(readTimelineMeasurements("removed", signature)).toEqual([]);
    expect(readTimelineMeasurements("survivor", signature)).toEqual([measurement]);
  });

  it("makes repeated accepted deletion forget a snapshot even when the row is already absent", () => {
    cache("already-removed");
    createThread("survivor");
    cache("survivor");
    useAppStore.getState().deleteThread("already-removed");
    useAppStore.getState().deleteThread("already-removed");

    expect(readTimelineMeasurements("already-removed", signature)).toEqual([]);
    expect(readTimelineMeasurements("survivor", signature)).toEqual([measurement]);
  });

  it("keeps snapshots through ordinary pane close and archive while the thread remains", () => {
    createThread("closed");
    createThread("visible");
    cache("closed");
    cache("visible");
    useAppStore.setState({ view: { kind: "thread", panes: ["closed", "visible"] } });

    useAppStore.getState().closePane("closed");
    useAppStore.getState().archiveThread("closed");

    expect(useAppStore.getState().threads.find((thread) => thread.id === "closed")?.archived).toBe(
      true,
    );
    expect(readTimelineMeasurements("closed", signature)).toEqual([measurement]);
    expect(readTimelineMeasurements("visible", signature)).toEqual([measurement]);
  });

  it("forgets only archived rows actually removed by the expiry sweep", () => {
    createThread("expired");
    createThread("recent");
    createThread("active");
    for (const id of ["expired", "recent", "active"]) cache(id);
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const recent = new Date().toISOString();
    useAppStore.setState((state) => ({
      threads: state.threads.map((thread) =>
        thread.id === "active"
          ? thread
          : { ...thread, archived: true, archivedAt: thread.id === "expired" ? old : recent },
      ),
    }));

    useAppStore.getState().purgeStaleArchivedThreads(7);

    expect(readTimelineMeasurements("expired", signature)).toEqual([]);
    expect(readTimelineMeasurements("recent", signature)).toEqual([measurement]);
    expect(readTimelineMeasurements("active", signature)).toEqual([measurement]);
  });

  it("forgets all threads deleted with their project without touching another project", () => {
    const removedProject = useAppStore
      .getState()
      .addProject({ kind: "posix", path: "/measurement-removed" });
    const survivingProject = useAppStore
      .getState()
      .addProject({ kind: "posix", path: "/measurement-surviving" });
    createThread("removed-a", removedProject.id);
    createThread("removed-b", removedProject.id);
    createThread("survivor", survivingProject.id);
    for (const id of ["removed-a", "removed-b", "survivor"]) cache(id);
    useAppStore.setState({
      runtimeItemsByIdByThread: {
        "removed-a": {
          row: { id: "row", type: "assistant_message", state: "completed", streams: {} },
        },
      },
    });

    useAppStore.getState().deleteProject(removedProject.id);

    expect(useAppStore.getState().threads.map((thread) => thread.id)).toEqual(["survivor"]);
    expect(useAppStore.getState().runtimeItemsByIdByThread["removed-a"]?.row).toBeDefined();
    expect(readTimelineMeasurements("removed-a", signature)).toEqual([]);
    expect(readTimelineMeasurements("removed-b", signature)).toEqual([]);
    expect(readTimelineMeasurements("survivor", signature)).toEqual([measurement]);
  });
});
