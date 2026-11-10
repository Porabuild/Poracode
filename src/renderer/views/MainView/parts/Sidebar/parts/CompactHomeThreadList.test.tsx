import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { Project, Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useSidebarUiStore } from "@/renderer/state/sidebarUiStore";
import { useWorkspaceStore } from "@/renderer/state/workspaceStore";
import { useProjectGroupStore } from "@/renderer/state/projectGroups/projectGroupStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { CompactHomeThreadList } from "./CompactHomeThreadList";

vi.mock("./workspaceSwitchSettling", () => ({ isWorkspaceSwitchSettling: () => false }));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({}),
  isWindows: () => true,
  isMac: () => false,
}));
vi.mock("@/renderer/adaptiveLayout", () => ({ useCompactLayout: () => true }));

vi.mock("./MobileQuickCompose", () => ({
  MobileQuickCompose: (props: { projectId: string }) => <div>quick-compose:{props.projectId}</div>,
}));

vi.mock("./SidebarThreadRow", () => ({
  SeeMoreThreadsButton: (props: { onPress: () => void }) => (
    <button type="button" onClick={props.onPress}>
      see-more
    </button>
  ),
  SidebarThreadRow: (props: { row: { kind: string; key: string }; project: { name: string } }) => (
    <div data-testid="row" data-kind={props.row.kind}>
      {props.row.key} in {props.project.name}
    </div>
  ),
}));

function makeThread(
  id: string,
  projectId: string,
  updatedAt: string,
  overrides: Partial<Thread> = {},
): Thread {
  return {
    id,
    projectId,
    title: `Thread ${id}`,
    status: "inactive",
    done: false,
    starred: false,
    archived: false,
    createdAt: updatedAt,
    updatedAt,
    agentKind: "claude",
    ...overrides,
  } as unknown as Thread;
}

const localProject: Project = {
  id: "local-1",
  name: "Poracode",
  location: { kind: "windows", path: "C:\\repo" },
  createdAt: "2026-07-01T00:00:00.000Z",
  workspaceId: "w1",
} as Project;

const secondProject: Project = {
  id: "local-2",
  name: "Side Project",
  location: { kind: "windows", path: "C:\\side" },
  createdAt: "2026-07-01T00:00:00.000Z",
  workspaceId: "w1",
} as Project;

const unreachableRemoteProject: Project = {
  id: "remote-1",
  name: "Mac Poracode",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-07-01T00:00:00.000Z",
  remoteServerId: "desktop-1",
  remoteId: "rp-1",
  workspaceId: "w1",
} as Project;

function rowKeys(): string[] {
  return screen.queryAllByTestId("row").map((row) => row.textContent?.split(" in ")[0] ?? "");
}

describe("CompactHomeThreadList", () => {
  beforeEach(() => {
    useRemoteServersStore.setState({ servers: [], runtime: {} });
    useProjectGroupStore.setState({ manualGroups: {}, lastUsedAt: {} });
    useGitStore.setState({ statuses: {} });
    useSharedSettings.setState({
      homeScopeEnabled: false,
      workspaces: [{ id: "w1", name: "Side Hustle" }],
    } as never);
    useWorkspaceStore.setState({ activeWorkspaceId: "w1" });
    useSidebarUiStore.setState({
      flatListProjectFilter: null,
      flatListShowDone: false,
      collapsedWorktrees: {},
      threadListLimits: {},
    });
  });

  it("lists active threads flat, with no Done section, grouping, or section label", () => {
    useAppStore.setState({
      projects: [localProject],
      threads: [
        makeThread("a", "local-1", "2026-08-01T10:00:00.000Z"),
        makeThread("b", "local-1", "2026-08-02T10:00:00.000Z", { done: true }),
        // Two worktree threads and two grouped threads would group on desktop.
        makeThread("w1", "local-1", "2026-08-03T10:00:00.000Z", { worktreePath: "/wt" }),
        makeThread("w2", "local-1", "2026-08-04T10:00:00.000Z", { worktreePath: "/wt" }),
        makeThread("g1", "local-1", "2026-08-05T10:00:00.000Z", { groupId: "g" }),
        makeThread("g2", "local-1", "2026-08-06T10:00:00.000Z", { groupId: "g" }),
      ],
    });

    render(<CompactHomeThreadList sortMode="updated" />);

    expect(rowKeys()).toEqual(["thread:g2", "thread:g1", "thread:w2", "thread:w1", "thread:a"]);
    expect(screen.getAllByTestId("row").every((row) => row.dataset.kind === "thread")).toBe(true);
    expect(screen.queryByText(/done/i)).not.toBeInTheDocument();
  });

  it("puts starred threads first and honors the created and manual sort modes", () => {
    useAppStore.setState({
      projects: [localProject],
      threads: [
        makeThread("old", "local-1", "2026-08-01T10:00:00.000Z", {
          createdAt: "2026-08-09T10:00:00.000Z",
        }),
        makeThread("new", "local-1", "2026-08-08T10:00:00.000Z", {
          createdAt: "2026-08-02T10:00:00.000Z",
        }),
        makeThread("pin", "local-1", "2026-07-01T10:00:00.000Z", { starred: true }),
      ],
    });

    const view = render(<CompactHomeThreadList sortMode="updated" />);
    expect(rowKeys()).toEqual(["thread:pin", "thread:new", "thread:old"]);
    view.rerender(<CompactHomeThreadList sortMode="created" />);
    expect(rowKeys()).toEqual(["thread:pin", "thread:old", "thread:new"]);
    view.rerender(<CompactHomeThreadList sortMode="manual" />);
    expect(rowKeys()).toEqual(["thread:pin", "thread:old", "thread:new"]);
  });

  it("shows only done threads, newest first, once Done is selected in the filter", () => {
    useSidebarUiStore.setState({ flatListShowDone: true });
    useAppStore.setState({
      projects: [localProject],
      threads: [
        makeThread("live", "local-1", "2026-08-09T10:00:00.000Z"),
        makeThread("d1", "local-1", "2026-08-01T10:00:00.000Z", { done: true }),
        makeThread("d2", "local-1", "2026-08-02T10:00:00.000Z", { done: true }),
      ],
    });

    render(<CompactHomeThreadList sortMode="updated" />);

    expect(rowKeys()).toEqual(["thread:d2", "thread:d1"]);
    // The composer still targets the most recently active project.
    expect(screen.getByText("quick-compose:local-1")).toBeInTheDocument();
  });

  it("applies the project filter to the active list and the Done view", () => {
    useAppStore.setState({
      projects: [localProject, secondProject],
      threads: [
        makeThread("a", "local-1", "2026-08-01T10:00:00.000Z"),
        makeThread("b", "local-2", "2026-08-02T10:00:00.000Z"),
        makeThread("d", "local-2", "2026-08-03T10:00:00.000Z", { done: true }),
      ],
    });
    useSidebarUiStore.setState({ flatListProjectFilter: ["local-2"] });

    const view = render(<CompactHomeThreadList sortMode="updated" />);
    expect(rowKeys()).toEqual(["thread:b"]);

    useSidebarUiStore.setState({ flatListShowDone: true });
    view.rerender(<CompactHomeThreadList sortMode="updated" />);
    expect(rowKeys()).toEqual(["thread:d"]);
  });

  it("explains an empty list for each view", () => {
    useAppStore.setState({
      projects: [localProject, secondProject],
      threads: [makeThread("d", "local-1", "2026-08-03T10:00:00.000Z", { done: true })],
    });

    const view = render(<CompactHomeThreadList sortMode="updated" />);
    // Done threads exist, so the empty Active view points at them.
    expect(screen.getByText("No active threads")).toBeInTheDocument();

    useSidebarUiStore.setState({ flatListProjectFilter: ["local-2"] });
    view.rerender(<CompactHomeThreadList sortMode="updated" />);
    expect(screen.getByText("No matching threads")).toBeInTheDocument();

    useSidebarUiStore.setState({ flatListShowDone: true });
    view.rerender(<CompactHomeThreadList sortMode="updated" />);
    expect(screen.getByText("No done threads")).toBeInTheDocument();
    expect(screen.getByText("Adjust your project filter.")).toBeInTheDocument();

    useSidebarUiStore.setState({ flatListProjectFilter: null });
    useAppStore.setState({ threads: [] });
    view.rerender(<CompactHomeThreadList sortMode="updated" />);
    expect(screen.getByText("No done threads")).toBeInTheDocument();
    expect(screen.queryByText("Adjust your project filter.")).not.toBeInTheDocument();
  });

  it("pages long lists behind See more", () => {
    useAppStore.setState({
      projects: [localProject],
      threads: Array.from({ length: 25 }, (_, i) =>
        makeThread(`t${i}`, "local-1", `2026-08-01T10:${String(i).padStart(2, "0")}:00.000Z`),
      ),
    });

    render(<CompactHomeThreadList sortMode="updated" />);
    expect(rowKeys()).toHaveLength(20);
    fireEvent.click(screen.getByText("see-more"));
    expect(rowKeys()).toHaveLength(25);
    expect(screen.queryByText("see-more")).not.toBeInTheDocument();
  });

  it("pages the Done view on its own and keeps starred threads past the page limit", () => {
    useSidebarUiStore.setState({ flatListShowDone: true });
    useAppStore.setState({
      projects: [localProject],
      threads: [
        ...Array.from({ length: 25 }, (_, i) =>
          makeThread(`d${i}`, "local-1", `2026-08-01T10:${String(i).padStart(2, "0")}:00.000Z`, {
            done: true,
          }),
        ),
        makeThread("old-star", "local-1", "2026-01-01T10:00:00.000Z", {
          done: true,
          starred: true,
        }),
      ],
    });

    render(<CompactHomeThreadList sortMode="updated" />);
    // 20 slots, with the starred oldest thread kept instead of a newer one.
    expect(rowKeys()).toHaveLength(20);
    expect(rowKeys()).toContain("thread:old-star");
    fireEvent.click(screen.getByText("see-more"));
    expect(rowKeys()).toHaveLength(26);
    // The Active view's pager is untouched by Done paging.
    expect(useSidebarUiStore.getState().threadListLimits["__flat__"]).toBeUndefined();
  });

  it("points at Done when every thread is done instead of claiming no conversations", () => {
    useAppStore.setState({
      projects: [localProject],
      threads: [makeThread("d", "local-1", "2026-08-03T10:00:00.000Z", { done: true })],
    });

    render(<CompactHomeThreadList sortMode="updated" />);

    expect(screen.getByText("No active threads")).toBeInTheDocument();
    expect(
      screen.getByText("Select Done in the filter to see finished threads."),
    ).toBeInTheDocument();
    expect(screen.queryByText("No conversations yet")).not.toBeInTheDocument();
  });

  it("keeps cached threads from unavailable machines and targets the composer at a reachable project", () => {
    useRemoteServersStore.setState({
      servers: [{ desktopId: "desktop-1", label: "Poracode on MacBook 16" }],
      runtime: { "desktop-1": { status: "error", projects: [], threads: [] } },
    } as never);
    useAppStore.setState({
      projects: [localProject, unreachableRemoteProject],
      threads: [
        makeThread("p1", "local-1", "2026-08-01T10:00:00.000Z"),
        makeThread("r1", "remote-1", "2026-08-03T10:00:00.000Z"),
      ],
    });

    render(<CompactHomeThreadList sortMode="updated" />);

    expect(screen.getByText(/thread:r1 in Mac Poracode/)).toBeInTheDocument();
    expect(screen.getByText(/thread:p1 in Poracode/)).toBeInTheDocument();
    expect(screen.getByText("quick-compose:local-1")).toBeInTheDocument();
  });
});
