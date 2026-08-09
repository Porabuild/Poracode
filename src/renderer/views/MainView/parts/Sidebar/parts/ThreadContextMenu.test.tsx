import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { Project, Thread } from "@/shared/contracts";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { resetDevTerminalStore, useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { ThreadContextMenu } from "./ThreadContextMenu";

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({}),
}));

const project: Project = {
  id: "p1",
  name: "Poracode",
  location: { kind: "windows", path: "C:\\repo" },
  createdAt: "2026-07-01T00:00:00.000Z",
  scripts: { actions: [{ id: "build", name: "Build" }] },
} as Project;

const homeProject: Project = {
  id: HOME_PROJECT_ID,
  name: "Home",
  location: { kind: "windows", path: "C:\\Users\\me" },
  createdAt: "2026-07-01T00:00:00.000Z",
} as Project;

function thread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "t1",
    projectId: project.id,
    title: "Thread",
    status: "inactive",
    done: false,
    starred: false,
    archived: false,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    agentKind: "claude",
    ...overrides,
  } as unknown as Thread;
}

function renderMenu(
  target: Thread,
  owner: Project = project,
  options: { showProjectActions?: boolean } = {},
) {
  render(
    <ThreadContextMenu thread={target} project={owner} {...options}>
      <button type="button">row</button>
    </ThreadContextMenu>,
  );
  fireEvent.contextMenu(screen.getByRole("button", { name: "row" }));
  return screen.findByRole("menu");
}

describe("ThreadContextMenu project actions", () => {
  beforeEach(() => {
    resetDevTerminalStore();
    usePanelStore.setState({ githubActionsContext: null });
  });

  it("offers project Git and Run submenus on flat main-branch rows", async () => {
    await renderMenu(thread(), project, { showProjectActions: true });

    expect(screen.getByRole("menuitem", { name: "Move to Worktree" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Git" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Run" })).toBeInTheDocument();
  });

  it("omits project actions without the flat-row flag (grouped layout)", async () => {
    await renderMenu(thread(), project);

    expect(screen.getByRole("menuitem", { name: "Move to Worktree" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Git" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Run" })).not.toBeInTheDocument();
  });

  it("omits project actions for the Home project", async () => {
    await renderMenu(thread({ projectId: HOME_PROJECT_ID }), homeProject, {
      showProjectActions: true,
    });

    expect(screen.queryByRole("menuitem", { name: "Git" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Run" })).not.toBeInTheDocument();
  });

  it("keeps a single Git submenu for worktree threads", async () => {
    await renderMenu(thread({ worktreePath: "C:\\repo\\wt" }), project, {
      showProjectActions: true,
    });

    expect(screen.getAllByRole("menuitem", { name: "Git" })).toHaveLength(1);
    expect(screen.getByRole("menuitem", { name: "Run" })).toBeInTheDocument();
  });

  it("opens GitHub Actions from a worktree Git submenu", async () => {
    await renderMenu(thread({ worktreePath: "C:\\repo\\wt" }), project);

    fireEvent.pointerEnter(screen.getByRole("menuitem", { name: "Git" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "GitHub Actions" }));

    expect(usePanelStore.getState().githubActionsContext).toEqual({ projectId: project.id });
  });

  it("omits the Run submenu when the project defines no scripts", async () => {
    const scriptless = { ...project, scripts: undefined } as unknown as Project;
    await renderMenu(thread(), scriptless, { showProjectActions: true });

    expect(screen.getByRole("menuitem", { name: "Git" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Run" })).not.toBeInTheDocument();
  });

  it("shows a running indicator for the action-owned terminal", async () => {
    const terminal = useDevTerminalStore.getState();
    const tab = terminal.addTab(project.id, "Build", undefined, "build");
    terminal.markShellRunning(tab.id);
    await renderMenu(thread(), project, { showProjectActions: true });

    fireEvent.pointerEnter(screen.getByRole("menuitem", { name: "Run" }));
    const action = await screen.findByRole("menuitem", { name: "Build" });

    expect(action.querySelector(".animate-spin")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Stop Build" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Stop Build" })).not.toBeInTheDocument();
  });
});
