import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { Project, Thread } from "@/shared/contracts";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
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

  it("omits the Run submenu when the project defines no scripts", async () => {
    const scriptless = { ...project, scripts: undefined } as unknown as Project;
    await renderMenu(thread(), scriptless, { showProjectActions: true });

    expect(screen.getByRole("menuitem", { name: "Git" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Run" })).not.toBeInTheDocument();
  });
});
