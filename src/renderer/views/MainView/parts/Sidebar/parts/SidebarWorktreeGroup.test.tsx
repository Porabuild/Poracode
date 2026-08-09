import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { Project, Thread } from "@/shared/contracts";
import { resetDevTerminalStore, useDevTerminalStore } from "@/renderer/state/devTerminalStore";
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
  useWorktreeGitItems: () => [],
}));

vi.mock("./WorktreeGroupHeader", () => ({
  WorktreeGroupHeader: (props: { onContextMenu?: React.MouseEventHandler<HTMLButtonElement> }) => (
    <button type="button" onContextMenu={props.onContextMenu}>
      worktree
    </button>
  ),
}));

const worktreePath = "C:\\repo\\wt";
const project = {
  id: "p1",
  name: "Poracode",
  location: { kind: "windows", path: "C:\\repo" },
  createdAt: "2026-08-08T00:00:00.000Z",
  scripts: { actions: [{ id: "build", name: "Build", command: "pnpm build" }] },
} satisfies Project;

const thread = {
  id: "t1",
  projectId: project.id,
  title: "Thread",
  status: "inactive",
  done: false,
  starred: false,
  archived: false,
  createdAt: "2026-08-08T00:00:00.000Z",
  updatedAt: "2026-08-08T00:00:00.000Z",
  agentKind: "claude",
  worktreePath,
  worktreeBranch: "feature",
} as unknown as Thread;

describe("SidebarWorktreeGroup Run menu", () => {
  beforeEach(() => {
    resetDevTerminalStore();
    terminalActions.stopProjectAction.mockReset();
    const terminal = useDevTerminalStore.getState();
    const tab = terminal.addTab(project.id, "Build", worktreePath, "build");
    terminal.markShellRunning(tab.id);
  });

  it("offers a scoped Stop action for a running worktree command", async () => {
    render(
      <SidebarWorktreeGroup
        group={{
          kind: "worktree",
          threads: [thread],
          worktreePath,
          worktreeBranch: "feature",
        }}
        entryIndex={0}
        project={project}
        sortableGroup="project:p1"
      />,
    );

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
