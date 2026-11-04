import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer, Project, Thread } from "@/shared/contracts";
import { useAppStore } from "../appStore";
import { remoteThreadId } from "../remoteProjection";
import {
  applyRootCatalogProjectRows,
  applyRootCatalogThreadRows,
} from "../managedRootCatalog/rootCatalogRows";
import { useRemoteServersStore } from "../remoteServersStore";
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

describe("shared host catalog row merge", () => {
  it.each(["managed", "paired"])("keeps unchanged %s catalog rows stable", (host) => {
    const row = hostThread();
    const apply = (incoming: Thread) => {
      if (host === "managed") applyRootCatalogThreadRows([incoming], new Set());
      else syncRemoteAppRows(desktopId, [hostProject], [incoming], { partial: true });
    };
    apply(row);
    const threads = useAppStore.getState().threads;
    for (let index = 0; index < 5; index++) apply(structuredClone(row));
    expect(useAppStore.getState().threads).toBe(threads);
    apply({ ...row, title: "Updated on host" });
    expect(useAppStore.getState().threads[0]?.title).toBe("Updated on host");
  });

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

/**
 * A catalog page that restates a project without changing it must not hand
 * subscribers (sidebar, composer, project pickers) a new row object: private
 * `mcpServers`, workspace filings and name overlays are rebuilt the same way
 * on every pass, so an unchanged page keeps both the row and the array.
 */
describe("host catalog project row identity", () => {
  const smokeExternal: McpServer = {
    id: "smoke-external-id",
    name: "smoke_external",
    description: "",
    enabled: true,
    timeoutMs: 30_000,
    transport: { type: "http", url: "http://127.0.0.1:1/mcp", headers: {} },
  };

  const managedPage = (): Project => ({ ...hostProject, workspaceId: "ws-1" });

  const applyPage = (host: "managed" | "paired", page: Project): void => {
    if (host === "managed") applyRootCatalogProjectRows([page]);
    else syncRemoteAppRows(desktopId, [page], [], { partial: true });
  };

  beforeEach(() => {
    useRemoteServersStore.setState({ projectWorkspaceIds: {} });
  });

  /** Paired mirror rows carry projected ids; managed rows keep the host id. */
  const appProjectRow = (): Project =>
    useAppStore
      .getState()
      .projects.find((row) => row.id === hostProject.id || row.remoteId === hostProject.id)!;

  it.each(["managed", "paired"] as const)(
    "keeps an unchanged %s project page from replacing resident rows",
    (host) => {
      if (host === "managed") applyPage(host, managedPage());
      else {
        useRemoteServersStore.setState({
          projectWorkspaceIds: { [desktopId]: { [hostProject.id]: "ws-1" } },
        });
        applyPage(host, hostProject);
      }
      // Private settings ride the resident row the way a loaded project
      // settings projection leaves them.
      const installed = appProjectRow();
      useAppStore.setState({
        projects: [{ ...installed, mcpServers: [smokeExternal] }],
      });

      // A first restated page settles the overlays; capture after it.
      applyPage(host, structuredClone(host === "managed" ? managedPage() : hostProject));
      const stable = useAppStore.getState().projects;
      expect(stable).toHaveLength(1);

      const listener = vi.fn<(state: { projects: Project[] }) => void>();
      const unsubscribe = useAppStore.subscribe(listener);
      for (let index = 0; index < 3; index += 1)
        applyPage(host, structuredClone(host === "managed" ? managedPage() : hostProject));
      unsubscribe();

      expect(useAppStore.getState().projects).toBe(stable);
      // Selector subscribers (sidebar, composer) never see a new array. The
      // managed apply skips its update entirely; the paired sync still runs
      // its bounded upsert, which restates the same references.
      expect(listener.mock.calls.every(([{ projects }]) => projects === stable)).toBe(true);
      const row = useAppStore.getState().projects[0]!;
      expect(row.mcpServers).toEqual([smokeExternal]);
      expect(row.workspaceId).toBe("ws-1");
    },
  );

  it.each(["managed", "paired"] as const)(
    "applies a real %s project change without moving or replacing other rows",
    (host) => {
      const second: Project = {
        ...hostProject,
        id: "proj-2",
        name: "Second Repo",
        location: { kind: "posix", path: "/repo-2" },
      };
      if (host === "managed") applyRootCatalogProjectRows([hostProject, second]);
      else syncRemoteAppRows(desktopId, [hostProject, second], [], { partial: true });
      const before = useAppStore.getState().projects;

      const renamed = { ...hostProject, name: "Remote Repo Renamed" };
      // A partial page omits proj-2 entirely; it must be retained, in place.
      applyPage(host, renamed);

      const projects = useAppStore.getState().projects;
      expect(projects.map((row) => row.name)).toEqual(["Remote Repo Renamed", "Second Repo"]);
      expect(projects[0]).not.toBe(before[0]);
      expect(projects[1]).toBe(before[1]);
    },
  );
});
