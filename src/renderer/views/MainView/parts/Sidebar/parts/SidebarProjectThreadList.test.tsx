import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { Project, Thread } from "@/shared/contracts";
import { HOME_PROJECT_ID, HOME_PROJECT_NAME } from "@/shared/homeScope";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useWorkspaceStore } from "@/renderer/state/workspaceStore";
import { SidebarProjectThreadList } from "./SidebarProjectThreadList";

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({}),
}));

vi.mock("@/renderer/dnd", () => ({
  useDragSource: () => null,
}));

vi.mock("@/renderer/actions/threadActions", () => ({
  openNewThread: vi.fn<() => void>(),
  openNewThreadSideBySide: vi.fn<() => void>(),
}));

vi.mock("./NewThreadButton", () => ({
  NewThreadButton: (props: { projectId: string }) => (
    <button type="button">new-thread:{props.projectId}</button>
  ),
}));

vi.mock("./SidebarThreadRow", () => ({
  SeeMoreThreadsButton: () => <button type="button">see-more</button>,
  SidebarThreadRow: (props: { row: { key: string }; project: { name: string } }) => (
    <div data-testid="row">
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

describe("SidebarProjectThreadList", () => {
  beforeEach(() => {
    useRemoteServersStore.setState({ servers: [], runtime: {} });
    useSharedSettings.setState({
      homeScopeEnabled: true,
      workspaces: [
        { id: "w1", name: "Work" },
        { id: "w2", name: "Side Hustle" },
      ],
    } as never);
    useWorkspaceStore.setState({ activeWorkspaceId: "w1" });
    useAppStore.setState({ projects: [homeProject, localProject], threads: [] });
  });

  it("hides Home threads filed under other workspaces but keeps untagged and dangling ones", () => {
    useAppStore.setState({
      threads: [
        makeThread("h-mine", HOME_PROJECT_ID, "2026-08-04T10:00:00.000Z", { workspaceId: "w1" }),
        makeThread("h-other", HOME_PROJECT_ID, "2026-08-03T10:00:00.000Z", { workspaceId: "w2" }),
        makeThread("h-legacy", HOME_PROJECT_ID, "2026-08-02T10:00:00.000Z"),
        makeThread("h-dangling", HOME_PROJECT_ID, "2026-08-01T10:00:00.000Z", {
          workspaceId: "w-deleted",
        }),
      ],
    });

    render(<SidebarProjectThreadList project={homeProject} sortMode="updated" />);

    expect(screen.getByText(/thread:h-mine/)).toBeInTheDocument();
    expect(screen.getByText(/thread:h-legacy/)).toBeInTheDocument();
    expect(screen.getByText(/thread:h-dangling/)).toBeInTheDocument();
    expect(screen.queryByText(/thread:h-other/)).not.toBeInTheDocument();
  });

  it("never filters a real project's threads by workspace", () => {
    useAppStore.setState({
      threads: [
        makeThread("p1", "local-1", "2026-08-04T10:00:00.000Z"),
        makeThread("p2", "local-1", "2026-08-03T10:00:00.000Z"),
      ],
    });

    render(<SidebarProjectThreadList project={localProject} sortMode="updated" />);

    expect(screen.getByText(/thread:p1 in Poracode/)).toBeInTheDocument();
    expect(screen.getByText(/thread:p2 in Poracode/)).toBeInTheDocument();
  });
});
