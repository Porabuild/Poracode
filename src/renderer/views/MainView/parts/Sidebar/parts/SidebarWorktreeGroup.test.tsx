import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDevTerminalStore, useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { Project, Thread } from "@/shared/contracts";
import { usePanelStore } from "@/renderer/state/panelStore";
import type { WorktreeThreadGroup } from "./groupThreads";
import { SidebarWorktreeGroup } from "./SidebarWorktreeGroup";

const terminalActions = vi.hoisted(() => ({
  openWorktreeTerminal: vi.fn<(projectId: string, worktreePath: string) => void>(),
  runProjectAction: vi.fn<(projectId: string, actionId: string, worktreePath?: string) => void>(),
  stopProjectAction: vi.fn<(projectId: string, actionId: string, worktreePath?: string) => void>(),
}));

vi.mock("@dnd-kit/react/sortable", () => ({
  useSortable: () => ({ ref: vi.fn<(node: HTMLElement | null) => void>() }),
}));

vi.mock("@/renderer/dnd", () => ({
  useDragSource: () => null,
  useIsDraggingWorktreeGroup: () => false,
}));

vi.mock("@/renderer/actions/terminalActions", () => terminalActions);

vi.mock("./useWorktreeActions", () => ({
  useWorktreeGitItems: () => [{ id: "github-actions", label: "GitHub Actions", icon: null }],
}));

vi.mock("./WorktreeGroupHeader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./WorktreeGroupHeader")>();
  return {
    ...actual,
    WorktreeGroupHeader: (props: {
      collapsedStatusTone?: string;
      onContextMenu?: React.MouseEventHandler<HTMLButtonElement>;
    }) => (
      <button type="button" aria-label="worktree" onContextMenu={props.onContextMenu}>
        <span data-testid="group-status">{props.collapsedStatusTone ?? "none"}</span>
      </button>
    ),
  };
});

const worktreePath = "C:\\repo\\wt";
const project = {
  id: "p1",
  name: "Poracode",
  location: { kind: "windows", path: "C:\\repo" },
  createdAt: "2026-08-08T00:00:00.000Z",
  scripts: { actions: [{ id: "build", name: "Build", command: "pnpm build" }] },
} satisfies Project;

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
    worktreePath,
    worktreeBranch: "feature",
  };
}

function renderGroup(threads: Thread[], liveBackgroundThreadIds: ReadonlySet<string>) {
  const group: WorktreeThreadGroup = {
    kind: "worktree",
    threads,
    worktreePath,
    worktreeBranch: "feature",
  };
  render(
    <SidebarWorktreeGroup
      group={group}
      entryIndex={0}
      project={project}
      sortableGroup="project:p1"
      liveBackgroundThreadIds={liveBackgroundThreadIds}
    />,
  );
}

describe("SidebarWorktreeGroup status tone", () => {
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

describe("SidebarWorktreeGroup Run menu", () => {
  beforeEach(() => {
    resetDevTerminalStore();
    terminalActions.stopProjectAction.mockReset();
    const terminal = useDevTerminalStore.getState();
    const tab = terminal.addTab(project.id, "Build", worktreePath, "build");
    terminal.markShellRunning(tab.id);
  });

  it("offers a scoped Stop action for a running worktree command", async () => {
    renderGroup([makeThread("t1", "inactive")], new Set());

    fireEvent.contextMenu(screen.getByRole("button", { name: "worktree" }));
    fireEvent.pointerEnter(screen.getByRole("menuitem", { name: "Run" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop Build" }));

    expect(terminalActions.stopProjectAction).toHaveBeenCalledWith(
      project.id,
      "build",
      worktreePath,
    );
  });
});

describe("SidebarWorktreeGroup Git menu", () => {
  it("opens GitHub Actions for the project", async () => {
    usePanelStore.setState({ githubActionsContext: null });
    renderGroup([makeThread("t1", "inactive")], new Set());

    fireEvent.contextMenu(screen.getByRole("button", { name: "worktree" }));
    fireEvent.pointerEnter(screen.getByRole("menuitem", { name: "Git" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "GitHub Actions" }));

    expect(usePanelStore.getState().githubActionsContext).toEqual({ projectId: project.id });
  });
});
