import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { SidebarWorktreeGroup } from "./SidebarWorktreeGroup";
import type { WorktreeThreadGroup } from "./groupThreads";

vi.mock("@dnd-kit/react/sortable", () => ({
  useSortable: () => ({ ref: vi.fn<(node: HTMLElement | null) => void>() }),
}));

vi.mock("@/renderer/dnd", () => ({
  useDragSource: () => null,
  useIsDraggingWorktreeGroup: () => false,
}));

vi.mock("@/renderer/components/common/ContextMenu", () => ({
  ContextMenu: (props: { children: React.ReactNode }) => props.children,
}));

vi.mock("@/renderer/hooks/uiSelectors", () => ({
  useIsWorktreeFilesPanelActive: () => false,
  useIsWorktreeGitPanelActive: () => false,
  useIsWorktreeTerminalActive: () => false,
  useIsWorktreeTerminalBusy: () => false,
  useIsWorktreeTerminalOpen: () => false,
}));

vi.mock("@/renderer/state/sidebarUiStore", () => ({
  useIsWorktreeCollapsed: () => true,
  useSidebarUiStore: (selector: (state: { toggleWorktreeCollapsed: () => void }) => unknown) =>
    selector({ toggleWorktreeCollapsed: vi.fn<() => void>() }),
}));

vi.mock("./useWorktreeActions", () => ({
  useWorktreeGitItems: () => [],
}));

vi.mock("./WorktreeGroupHeader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./WorktreeGroupHeader")>();
  return {
    ...actual,
    WorktreeGroupHeader: (props: { collapsedStatusTone?: string }) => (
      <div data-testid="group-status">{props.collapsedStatusTone ?? "none"}</div>
    ),
  };
});

const project = {
  id: "project-1",
  name: "Poracode",
  location: { kind: "windows", path: "C:\\repo" },
  createdAt: "2026-08-08T00:00:00.000Z",
} as Project;

function makeThread(id: string, status: Thread["status"]): Thread {
  return {
    id,
    projectId: project.id,
    title: id,
    agentKind: "codex",
    config: { model: "gpt-5.4" },
    status,
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: "2026-08-08T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:00.000Z",
    worktreePath: "C:\\repo\\worktree",
    worktreeBranch: "feature/status",
  };
}

function renderGroup(threads: Thread[], liveBackgroundThreadIds: ReadonlySet<string>) {
  const group: WorktreeThreadGroup = {
    kind: "worktree",
    threads,
    worktreePath: "C:\\repo\\worktree",
    worktreeBranch: "feature/status",
  };
  render(
    <SidebarWorktreeGroup
      group={group}
      entryIndex={0}
      project={project}
      sortableGroup="project-entries:project-1"
      liveBackgroundThreadIds={liveBackgroundThreadIds}
    />,
  );
}

describe("SidebarWorktreeGroup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows working when a settled child has live background activity", () => {
    renderGroup(
      [makeThread("live", "idle"), makeThread("inactive", "inactive")],
      new Set(["live"]),
    );

    expect(screen.getByTestId("group-status")).toHaveTextContent("working");
  });

  it("keeps finished priority over a child with live background activity", () => {
    renderGroup(
      [makeThread("live", "idle"), makeThread("finished", "finished")],
      new Set(["live"]),
    );

    expect(screen.getByTestId("group-status")).toHaveTextContent("finished");
  });
});
