import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const { discardExperimentMock } = vi.hoisted(() => ({
  discardExperimentMock: vi.fn<(experimentId: string) => Promise<boolean>>(async () => true),
}));
const layoutMock = vi.hoisted(() => ({ compact: false }));

vi.mock("@/renderer/adaptiveLayout", () => ({
  useCompactLayout: () => layoutMock.compact,
}));

vi.mock("@/renderer/actions/experimentActions", () => ({
  discardExperiment: discardExperimentMock,
}));
vi.mock("@/renderer/actions/threadActions", () => ({
  archiveThread: vi.fn<(id: string) => void>(),
  toggleMarkThreadDone: vi.fn<(id: string) => void>(),
}));
vi.mock("@/renderer/utils/shellUtils", () => ({
  closeThreads: vi.fn<(ids: string[]) => Promise<void>>(async () => undefined),
}));
vi.mock("@/renderer/analytics/productAnalytics", () => ({
  captureProductEvent: vi.fn<(name: string) => void>(),
}));
vi.mock("./SyncBadge", () => ({
  SyncBadge: (props: { projectId: string }) => (
    <span data-testid="project-sync-badge">{props.projectId}</span>
  ),
}));

import { useAppStore } from "@/renderer/state/appStore";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { useSidebarUiStore } from "@/renderer/state/sidebarUiStore";
import { SidebarThreadGroup } from "./SidebarThreadGroup";

const NOW = "2026-07-15T00:00:00.000Z";

function makeThread(id: string): Thread {
  return {
    id,
    projectId: "project-1",
    title: id,
    agentKind: "claude",
    config: { model: "opus" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    groupId: "exp-1",
    groupName: "refine docs",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const project: Project = {
  id: "project-1",
  name: "Poracode",
  location: { kind: "windows", path: "C:\\repo" },
  createdAt: NOW,
};

describe("SidebarThreadGroup — experiment header", () => {
  beforeEach(() => {
    layoutMock.compact = false;
    discardExperimentMock.mockClear();
    const threads = [makeThread("t-1"), makeThread("t-2")];
    useAppStore.setState({ threads });
    useExperimentStore.setState({
      experiments: {
        "exp-1": {
          id: "exp-1",
          projectId: "project-1",
          title: "refine docs",
          prompt: "refine docs",
          baseBranch: "master",
          baseCommit: "a".repeat(40),
          status: "running",
          createdAt: NOW,
          updatedAt: NOW,
          candidates: threads.map((thread, index) => ({
            threadId: thread.id,
            agentKind: "claude",
            worktreeBranch: `poracode/experiment-${index}`,
            worktreeOwnerToken: `exp-1:${thread.id}`,
            worktreeState: "owned" as const,
          })),
        },
      },
    });
  });

  function renderGroup() {
    return render(
      <SidebarThreadGroup
        entry={{
          kind: "thread-group",
          group: {
            kind: "default",
            groupId: "exp-1",
            groupName: "refine docs",
            threads: useAppStore.getState().threads,
          },
        }}
        project={project}
        editingThreadId={null}
        setEditingThreadId={() => undefined}
      />,
    );
  }

  it("discard control opens the confirm dialog and confirming discards the experiment", async () => {
    renderGroup();

    fireEvent.click(screen.getByRole("button", { name: "Discard refine docs" }));
    expect(await screen.findByText("Discard experiment?")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Discard experiment" }));
    });
    expect(discardExperimentMock).toHaveBeenCalledWith("exp-1");
  });

  it("row click toggles collapse instead of opening the board", () => {
    renderGroup();
    expect(useSidebarUiStore.getState().collapsedWorktrees["group:exp-1"]).toBeUndefined();
    fireEvent.click(screen.getByText("refine docs"));
    expect(useSidebarUiStore.getState().collapsedWorktrees["group:exp-1"]).toBe(true);
  });

  it("shows project sync state on a flat-list group header", () => {
    useExperimentStore.setState({ experiments: {} });

    render(
      <SidebarThreadGroup
        entry={{
          kind: "thread-group",
          group: {
            kind: "default",
            groupId: "group-1",
            groupName: "Continue in Other Provider",
            threads: useAppStore.getState().threads,
          },
        }}
        project={project}
        editingThreadId={null}
        setEditingThreadId={() => undefined}
        projectTag={<span>{project.name}</span>}
      />,
    );

    expect(screen.getByTestId("project-sync-badge")).toHaveTextContent(project.id);
  });

  it("hides desktop group actions in compact layouts", () => {
    layoutMock.compact = true;
    useExperimentStore.setState({ experiments: {} });

    render(
      <SidebarThreadGroup
        entry={{
          kind: "thread-group",
          group: {
            kind: "default",
            groupId: "group-1",
            groupName: "Continue in Other Provider",
            threads: useAppStore.getState().threads,
          },
        }}
        project={project}
        editingThreadId={null}
        setEditingThreadId={() => undefined}
        projectTag={<span>{project.name}</span>}
      />,
    );

    expect(screen.queryByTestId("project-sync-badge")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open all in group" })).not.toBeInTheDocument();
    expect(screen.getByText("Continue in Other Provider").closest("button")).toHaveClass(
      "poracode-sidebar-touch-row",
    );
  });
});
