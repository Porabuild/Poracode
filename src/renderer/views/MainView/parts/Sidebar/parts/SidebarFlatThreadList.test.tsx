import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { Project, Thread } from "@/shared/contracts";
import { HOME_PROJECT_ID, HOME_PROJECT_NAME } from "@/shared/homeScope";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useSidebarUiStore } from "@/renderer/state/sidebarUiStore";
import { useWorkspaceStore } from "@/renderer/state/workspaceStore";
import { SidebarFlatThreadList } from "./SidebarFlatThreadList";

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({}),
  // sidebarBodyScrollClass (scroll gutter classes) reads the platform.
  isWindows: () => true,
  isMac: () => false,
}));

vi.mock("@/renderer/dnd", () => ({
  useDragSource: () => null,
}));

// Records every render so tests can assert where the button was docked.
const newThreadCalls = vi.hoisted(
  () => [] as Array<{ projectId: string; inline: boolean | undefined }>,
);
const layoutMock = vi.hoisted(() => ({ compact: false }));
const quickComposeCalls = vi.hoisted(() => [] as string[]);

vi.mock("@/renderer/adaptiveLayout", () => ({
  useCompactLayout: () => layoutMock.compact,
}));

vi.mock("./NewThreadButton", () => ({
  NewThreadButton: (props: { projectId: string; inline?: boolean }) => {
    newThreadCalls.push({ projectId: props.projectId, inline: props.inline });
    return <button type="button">new-thread:{props.projectId}</button>;
  },
}));

vi.mock("./MobileQuickCompose", () => ({
  MobileQuickCompose: (props: { projectId: string }) => {
    quickComposeCalls.push(props.projectId);
    return <div>quick-compose:{props.projectId}</div>;
  },
}));

vi.mock("./SidebarThreadRow", () => ({
  SeeMoreThreadsButton: () => <button type="button">see-more</button>,
  SidebarThreadRow: (props: {
    row: { key: string };
    project: { name: string };
    projectTag?: React.ReactNode;
  }) => (
    <div data-testid="row">
      {props.row.key} in {props.project.name}
      {props.projectTag}
    </div>
  ),
}));

// Filter interaction is covered by SidebarProjectFilter.test.tsx; here a stub
// exposes the effective (normalized) filter the list passes down.
vi.mock("./SidebarProjectFilter", () => ({
  SidebarProjectFilter: (props: {
    projects: readonly Project[];
    filterableProjectIds: ReadonlySet<string>;
    value: ReadonlySet<string> | null;
  }) => (
    <div data-testid="project-filter">
      {props.value === null ? "all" : [...props.value].join(",")}
      {` projects:${props.projects.map((project) => project.id).join(",")}`}
      {` filterable:${[...props.filterableProjectIds].join(",")}`}
    </div>
  ),
}));

function makeThread(id: string, projectId: string, updatedAt: string): Thread {
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
  } as unknown as Thread;
}

// The real Home row is persisted with `disabled: true` (see
// `ensureHomeProjectRow`); the flat list must not filter it out on that flag.
const homeProject: Project = {
  id: HOME_PROJECT_ID,
  name: HOME_PROJECT_NAME,
  location: { kind: "windows", path: "C:\\Users\\me" },
  createdAt: "2026-07-01T00:00:00.000Z",
  disabled: true,
} as Project;

const localProject: Project = {
  id: "local-1",
  name: "Poracode",
  location: { kind: "windows", path: "C:\\repo" },
  createdAt: "2026-07-01T00:00:00.000Z",
  workspaceId: "w1",
} as Project;

const secondLocalProject: Project = {
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

describe("SidebarFlatThreadList", () => {
  beforeEach(() => {
    layoutMock.compact = false;
    quickComposeCalls.length = 0;
    useRemoteServersStore.setState({ servers: [], runtime: {} });
    useSharedSettings.setState({
      homeScopeEnabled: true,
      workspaces: [{ id: "w1", name: "Side Hustle" }],
    } as never);
    useWorkspaceStore.setState({ activeWorkspaceId: "w1" });
    useSidebarUiStore.setState({ flatListProjectFilter: null });
    newThreadCalls.length = 0;
  });

  it("uses the old PWA quick composer instead of the desktop new-thread row on mobile", () => {
    layoutMock.compact = true;
    useAppStore.setState({
      projects: [localProject],
      threads: [makeThread("p1", "local-1", "2026-08-01T10:00:00.000Z")],
    });

    render(<SidebarFlatThreadList sortMode="updated" />);

    expect(screen.getByText("quick-compose:local-1")).toBeInTheDocument();
    expect(screen.queryByText("new-thread:local-1")).not.toBeInTheDocument();
    expect(quickComposeCalls.length).toBeGreaterThan(0);
    expect(quickComposeCalls.every((projectId) => projectId === "local-1")).toBe(true);
  });

  it("shows Home threads alongside project threads with the new-thread row", () => {
    useAppStore.setState({
      projects: [homeProject, localProject],
      threads: [
        makeThread("h1", HOME_PROJECT_ID, "2026-08-02T10:00:00.000Z"),
        makeThread("p1", "local-1", "2026-08-01T10:00:00.000Z"),
      ],
    });

    render(<SidebarFlatThreadList sortMode="updated" />);

    expect(screen.getByText(`new-thread:${HOME_PROJECT_ID}`)).toBeInTheDocument();
    expect(screen.getByText(/thread:h1 in Home/)).toBeInTheDocument();
    expect(screen.getByText(/thread:p1 in Poracode/)).toBeInTheDocument();
  });

  it("keeps Home threads and the new-thread row when the only workspace project is unreachable", () => {
    useAppStore.setState({
      projects: [homeProject, unreachableRemoteProject],
      threads: [
        makeThread("h1", HOME_PROJECT_ID, "2026-08-02T10:00:00.000Z"),
        makeThread("r1", "remote-1", "2026-08-03T10:00:00.000Z"),
      ],
    });

    render(<SidebarFlatThreadList sortMode="updated" />);

    expect(screen.getByText(`new-thread:${HOME_PROJECT_ID}`)).toBeInTheDocument();
    expect(screen.getByText(/thread:h1 in Home/)).toBeInTheDocument();
    expect(screen.queryByText(/thread:r1/)).not.toBeInTheDocument();
  });

  it("hides remote threads while the server reports an error (e.g. relay answering for an off machine)", () => {
    useRemoteServersStore.setState({
      runtime: { "desktop-1": { status: "error", projects: [], threads: [] } },
    } as never);
    useAppStore.setState({
      projects: [homeProject, unreachableRemoteProject],
      threads: [makeThread("r1", "remote-1", "2026-08-03T10:00:00.000Z")],
    });

    render(<SidebarFlatThreadList sortMode="updated" />);

    expect(screen.queryByText(/thread:r1/)).not.toBeInTheDocument();
  });

  it("shows remote threads while the server is online", () => {
    useRemoteServersStore.setState({
      runtime: { "desktop-1": { status: "online", projects: [], threads: [] } },
    } as never);
    useAppStore.setState({
      projects: [homeProject, unreachableRemoteProject],
      threads: [makeThread("r1", "remote-1", "2026-08-03T10:00:00.000Z")],
    });

    render(<SidebarFlatThreadList sortMode="updated" />);

    expect(screen.getByText(/thread:r1 in Mac Poracode/)).toBeInTheDocument();
  });

  it("tags remote-project rows with the machine name; local rows carry none", () => {
    useRemoteServersStore.setState({
      servers: [{ desktopId: "desktop-1", label: "Poracode on MacBook 16" }],
      runtime: { "desktop-1": { status: "online", projects: [], threads: [] } },
    } as never);
    useAppStore.setState({
      projects: [homeProject, localProject, unreachableRemoteProject],
      threads: [
        makeThread("p1", "local-1", "2026-08-01T10:00:00.000Z"),
        makeThread("r1", "remote-1", "2026-08-03T10:00:00.000Z"),
      ],
    });

    render(<SidebarFlatThreadList sortMode="updated" />);

    const remoteRow = screen.getByText(/thread:r1 in Mac Poracode/).closest("[data-testid=row]");
    expect(remoteRow).toHaveTextContent("MacBook 16");
    const localRow = screen.getByText(/thread:p1 in Poracode/).closest("[data-testid=row]");
    expect(localRow).not.toHaveTextContent("MacBook 16");
  });

  it("hides Home threads when home scope is disabled", () => {
    useSharedSettings.setState({ homeScopeEnabled: false } as never);
    useAppStore.setState({
      projects: [homeProject, localProject],
      threads: [
        makeThread("h1", HOME_PROJECT_ID, "2026-08-02T10:00:00.000Z"),
        makeThread("p1", "local-1", "2026-08-01T10:00:00.000Z"),
      ],
    });

    render(<SidebarFlatThreadList sortMode="updated" />);

    expect(screen.queryByText(/thread:h1/)).not.toBeInTheDocument();
    expect(screen.getByText(/thread:p1 in Poracode/)).toBeInTheDocument();
    expect(screen.getByText("new-thread:local-1")).toBeInTheDocument();
  });

  it("filters threads to the selected projects and targets new threads there", () => {
    useSidebarUiStore.setState({ flatListProjectFilter: ["local-1"] });
    useAppStore.setState({
      projects: [homeProject, localProject, secondLocalProject],
      threads: [
        makeThread("h1", HOME_PROJECT_ID, "2026-08-03T10:00:00.000Z"),
        makeThread("p1", "local-1", "2026-08-01T10:00:00.000Z"),
        makeThread("s1", "local-2", "2026-08-02T10:00:00.000Z"),
      ],
    });

    render(<SidebarFlatThreadList sortMode="updated" />);

    expect(screen.getByTestId("project-filter")).toHaveTextContent("local-1");
    expect(screen.getByText(/thread:p1 in Poracode/)).toBeInTheDocument();
    expect(screen.queryByText(/thread:h1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/thread:s1/)).not.toBeInTheDocument();
    // The most recently updated thread overall is h1 (Home), but the filtered
    // list must not offer creating a thread in a hidden project.
    expect(screen.getByText("new-thread:local-1")).toBeInTheDocument();
  });

  it("treats a persisted selection covering every visible project as no filter", () => {
    useSidebarUiStore.setState({ flatListProjectFilter: [HOME_PROJECT_ID, "local-1"] });
    useAppStore.setState({
      projects: [homeProject, localProject],
      threads: [
        makeThread("h1", HOME_PROJECT_ID, "2026-08-02T10:00:00.000Z"),
        makeThread("p1", "local-1", "2026-08-01T10:00:00.000Z"),
      ],
    });

    render(<SidebarFlatThreadList sortMode="updated" />);

    expect(screen.getByTestId("project-filter")).toHaveTextContent("all");
    expect(screen.getByText(/thread:h1/)).toBeInTheDocument();
    expect(screen.getByText(/thread:p1/)).toBeInTheDocument();
  });

  it("ignores stale project ids in the persisted filter", () => {
    useSidebarUiStore.setState({ flatListProjectFilter: ["deleted-project"] });
    useAppStore.setState({
      projects: [homeProject, localProject],
      threads: [
        makeThread("h1", HOME_PROJECT_ID, "2026-08-02T10:00:00.000Z"),
        makeThread("p1", "local-1", "2026-08-01T10:00:00.000Z"),
      ],
    });

    render(<SidebarFlatThreadList sortMode="updated" />);

    expect(screen.getByTestId("project-filter")).toHaveTextContent("all");
    expect(screen.getByText(/thread:h1/)).toBeInTheDocument();
    expect(screen.getByText(/thread:p1/)).toBeInTheDocument();
  });

  it("falls back to the first filtered project for new threads when the filter has none", () => {
    useSidebarUiStore.setState({ flatListProjectFilter: ["local-1"] });
    useAppStore.setState({
      projects: [homeProject, localProject],
      threads: [makeThread("h1", HOME_PROJECT_ID, "2026-08-02T10:00:00.000Z")],
    });

    render(<SidebarFlatThreadList sortMode="updated" />);

    expect(screen.queryByText(/thread:h1/)).not.toBeInTheDocument();
    expect(screen.getByText("new-thread:local-1")).toBeInTheDocument();
  });

  it("omits the project filter when only one project is visible", () => {
    useSharedSettings.setState({ homeScopeEnabled: false } as never);
    useAppStore.setState({
      projects: [homeProject, localProject],
      threads: [makeThread("p1", "local-1", "2026-08-01T10:00:00.000Z")],
    });

    render(<SidebarFlatThreadList sortMode="updated" />);

    expect(screen.queryByTestId("project-filter")).not.toBeInTheDocument();
    expect(screen.getByText(/thread:p1 in Poracode/)).toBeInTheDocument();
  });

  it("keeps the only disabled project in the filter so it can be re-enabled", () => {
    useSharedSettings.setState({ homeScopeEnabled: false } as never);
    useAppStore.setState({
      projects: [{ ...localProject, disabled: true }],
      threads: [makeThread("p1", "local-1", "2026-08-01T10:00:00.000Z")],
    });

    render(<SidebarFlatThreadList sortMode="updated" />);

    expect(screen.getByTestId("project-filter")).toHaveTextContent("projects:local-1");
    expect(screen.getByTestId("project-filter")).toHaveTextContent("filterable:");
    expect(screen.queryByText(/thread:p1/)).not.toBeInTheDocument();
    expect(screen.queryByText("new-thread:local-1")).not.toBeInTheDocument();
  });

  it("docks the new-thread control into the filter head row when several projects are visible", () => {
    useAppStore.setState({
      projects: [homeProject, localProject],
      threads: [makeThread("p1", "local-1", "2026-08-01T10:00:00.000Z")],
    });

    const { container } = render(<SidebarFlatThreadList sortMode="updated" />);

    const head = container.querySelector(".poracode-flat-list-head");
    expect(head).not.toBeNull();
    expect(head).toHaveTextContent("new-thread:local-1");
    expect(head?.querySelector('[data-testid="project-filter"]')).not.toBeNull();
    expect(newThreadCalls.at(-1)).toEqual({ projectId: "local-1", inline: true });
  });

  it("pins the filter/new-thread head above the scrolling rows", () => {
    useAppStore.setState({
      projects: [homeProject, localProject],
      threads: [makeThread("p1", "local-1", "2026-08-01T10:00:00.000Z")],
    });

    const { container } = render(<SidebarFlatThreadList sortMode="updated" />);

    const head = container.querySelector(".poracode-flat-list-head");
    const scroller = container.querySelector(".overflow-y-auto");
    if (!head || !scroller) throw new Error("expected head row and scroll container");
    // The head lives outside (above) the scroll container, so it stays put
    // while the thread rows scroll underneath it.
    expect(scroller.contains(head)).toBe(false);
    expect(scroller).toHaveTextContent("thread:p1");
  });

  it("keeps the new-thread control as a full row when only one project is visible", () => {
    useSharedSettings.setState({ homeScopeEnabled: false } as never);
    useAppStore.setState({
      projects: [homeProject, localProject],
      threads: [makeThread("p1", "local-1", "2026-08-01T10:00:00.000Z")],
    });

    const { container } = render(<SidebarFlatThreadList sortMode="updated" />);

    expect(container.querySelector(".poracode-flat-list-head")).toBeNull();
    expect(newThreadCalls.at(-1)).toEqual({ projectId: "local-1", inline: undefined });
  });

  it("drops Home from the active filter when home scope is disabled, keeping the rest", () => {
    useSidebarUiStore.setState({ flatListProjectFilter: [HOME_PROJECT_ID, "local-1"] });
    useSharedSettings.setState({ homeScopeEnabled: false } as never);
    useAppStore.setState({
      projects: [homeProject, localProject, secondLocalProject],
      threads: [
        makeThread("h1", HOME_PROJECT_ID, "2026-08-02T10:00:00.000Z"),
        makeThread("p1", "local-1", "2026-08-01T10:00:00.000Z"),
        makeThread("s1", "local-2", "2026-08-03T10:00:00.000Z"),
      ],
    });

    render(<SidebarFlatThreadList sortMode="updated" />);

    // Home is invisible (homeScope off), so the stale Home id is dropped from
    // the filter — but with local-2 still visible the selection stays active
    // rather than collapsing to "all".
    expect(screen.getByTestId("project-filter")).toHaveTextContent("local-1");
    expect(screen.getByText(/thread:p1/)).toBeInTheDocument();
    expect(screen.queryByText(/thread:h1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/thread:s1/)).not.toBeInTheDocument();
  });
});
