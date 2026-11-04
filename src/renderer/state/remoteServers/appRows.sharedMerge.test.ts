import { beforeEach, describe, expect, it } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { useAppStore } from "../appStore";
import { remoteThreadId } from "../remoteProjection";
import { removeRemoteAppRows, syncRemoteAppRows } from "./appRows";

/**
 * A paired host's catalog rows merge over the resident mirror with the same
 * merge the desktop host's rows use: client state newer than a page survives
 * it, and a host-archived thread closes its pane.
 */

const desktopId = "desktop-1";

const hostProject: Project = {
  id: "proj-1",
  name: "Remote Repo",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-10-08T00:00:00.000Z",
};

function hostThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "host-thread-1",
    projectId: hostProject.id,
    title: "Host thread",
    agentKind: "test-agent",
    config: { model: "auto" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: true,
    archived: false,
    done: false,
    starred: false,
    createdAt: "2026-10-08T00:00:00.000Z",
    updatedAt: "2026-10-08T00:00:00.000Z",
    presentationMode: "gui",
    ...overrides,
  };
}

const appId = remoteThreadId(desktopId, hostThread().id);

const residentRow = (): Thread => useAppStore.getState().threads.find((row) => row.id === appId)!;

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({ projects: [], threads: [], view: { kind: "home" } });
  removeRemoteAppRows(desktopId);
});

describe("shared host row merge on a paired host", () => {
  it("keeps the running turn's start time when an older page restates a later one", () => {
    const working = {
      status: "working" as const,
      lastTurnStartedAt: "2026-10-08T00:00:00.000Z",
    };
    syncRemoteAppRows(
      desktopId,
      [hostProject],
      [hostThread({ ...working, activeTurnStartedAt: "2026-10-08T01:00:00.000Z" })],
    );
    expect(residentRow().activeTurnStartedAt).toBe("2026-10-08T01:00:00.000Z");

    // A page built from a later turn start would make the timer jump forward.
    syncRemoteAppRows(
      desktopId,
      [hostProject],
      [hostThread({ ...working, activeTurnStartedAt: "2026-10-08T01:00:09.000Z" })],
    );
    expect(residentRow().activeTurnStartedAt).toBe("2026-10-08T01:00:00.000Z");
  });

  it("closes the pane of a thread the host archived on its own", () => {
    syncRemoteAppRows(desktopId, [hostProject], [hostThread()]);
    useAppStore.setState({ view: { kind: "thread", panes: [appId] } });

    syncRemoteAppRows(desktopId, [hostProject], [hostThread({ archived: true })]);

    expect(useAppStore.getState().view).not.toMatchObject({ panes: [appId] });
    expect(residentRow().archived).toBe(true);
  });

  it("keeps a pane open when the thread was already archived before the page", () => {
    syncRemoteAppRows(desktopId, [hostProject], [hostThread({ archived: true })]);
    useAppStore.setState({ view: { kind: "thread", panes: [appId] } });

    syncRemoteAppRows(desktopId, [hostProject], [hostThread({ archived: true, title: "Renamed" })]);

    expect(useAppStore.getState().view).toMatchObject({ kind: "thread", panes: [appId] });
  });
});
