import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { SortableThreadItem } from "./SortableThreadItem";

type MockContextMenuItem = {
  id: string;
  isDisabled?: boolean;
  disabledReason?: string;
};

const { sortableRefMock, contextMenuItemsMock } = vi.hoisted(() => ({
  sortableRefMock: vi.fn<(element: HTMLElement | null) => void>(),
  contextMenuItemsMock: vi.fn<(items: MockContextMenuItem[]) => void>(),
}));

vi.mock("@dnd-kit/react/sortable", () => ({
  useSortable: () => ({ ref: sortableRefMock }),
}));

vi.mock("@/renderer/dnd", () => ({
  useIsDraggingThread: () => false,
}));

vi.mock("@/renderer/components/common", () => ({
  ContextMenu: (props: { children: ReactNode; items: MockContextMenuItem[] }) => {
    contextMenuItemsMock(props.items);
    return <>{props.children}</>;
  },
  SidebarButton: (props: { label: ReactNode }) => <button type="button">{props.label}</button>,
}));

vi.mock("@/renderer/components/providers", () => ({
  ProviderIcon: () => null,
  getStatusTone: () => "default",
}));

vi.mock("@/renderer/hooks/uiSelectors", () => ({
  useCurrentThreadIdsCount: () => 1,
  useProjectAgentStatuses: () => [],
  useIsCurrentThread: () => false,
}));

vi.mock("@/renderer/views/MainView/parts/Sidebar/parts/useWorktreeActions", () => ({
  useWorktreeGitItems: () => [],
}));

vi.mock("@/renderer/actions/gitActions", () => ({
  gitPull: vi.fn<() => void>(),
  gitPush: vi.fn<() => void>(),
  gitSync: vi.fn<() => void>(),
  gitPullFromSource: vi.fn<() => void>(),
  gitMergeToSource: vi.fn<() => void>(),
  gitMergeAndRemove: vi.fn<() => void>(),
}));

vi.mock("@/renderer/actions/panelActions", () => ({
  openGitReview: vi.fn<() => void>(),
}));

vi.mock("@/renderer/actions/threadActions", () => ({
  openThread: vi.fn<() => void>(),
  archiveThread: vi.fn<() => void>(),
  unloadThread: vi.fn<() => void>(),
  toggleMarkThreadDone: vi.fn<() => void>(),
  toggleStarThread: vi.fn<() => void>(),
  deleteThread: vi.fn<() => void>(),
  renameThread: vi.fn<() => void>(),
  continueInProvider: vi.fn<() => void>(),
}));

vi.mock("@/renderer/actions/terminalActions", () => ({
  runProjectAction: vi.fn<() => void>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ openExternal: vi.fn<(url: string) => void>() }),
}));

vi.mock("@/renderer/state/gitStore", () => ({
  useGitStore: { getState: () => ({ prData: {} }) },
}));

function makeThread(): Thread {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Thread 1",
    agentKind: "codex",
    config: { model: "gpt-5.4" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
  };
}

const project: Project = {
  id: "project-1",
  name: "Project",
  location: { kind: "windows", path: "C:\\repo" },
  createdAt: "2026-03-21T10:00:00.000Z",
};

describe("SortableThreadItem", () => {
  beforeEach(() => {
    sortableRefMock.mockClear();
    contextMenuItemsMock.mockClear();
  });

  it("registers the row element as the sortable element", () => {
    const { container } = render(
      <SortableThreadItem
        thread={makeThread()}
        threadIndex={1}
        project={project}
        showWorktreeBadge={false}
        editingThreadId={null}
        setEditingThreadId={vi.fn<(id: string | null) => void>()}
        group="project-entries:project-1"
      />,
    );

    const row = container.firstElementChild;

    expect(row).toBeInstanceOf(HTMLElement);
    expect(sortableRefMock).toHaveBeenCalledWith(row);
  });

  it("enables unload for a loaded thread without a session ref", () => {
    render(
      <SortableThreadItem
        thread={makeThread()}
        threadIndex={1}
        project={project}
        showWorktreeBadge={false}
        editingThreadId={null}
        setEditingThreadId={vi.fn<(id: string | null) => void>()}
        group="project-entries:project-1"
      />,
    );

    const unloadItem = contextMenuItemsMock.mock.calls
      .at(-1)?.[0]
      .find((item) => item.id === "unload");

    expect(unloadItem).toMatchObject({ id: "unload" });
    expect(unloadItem?.isDisabled).toBe(false);
    expect(unloadItem?.disabledReason).toBeUndefined();
  });

  it("keeps unload disabled for already unloaded threads", () => {
    render(
      <SortableThreadItem
        thread={{ ...makeThread(), status: "inactive" }}
        threadIndex={1}
        project={project}
        showWorktreeBadge={false}
        editingThreadId={null}
        setEditingThreadId={vi.fn<(id: string | null) => void>()}
        group="project-entries:project-1"
      />,
    );

    const unloadItem = contextMenuItemsMock.mock.calls
      .at(-1)?.[0]
      .find((item) => item.id === "unload");

    expect(unloadItem).toMatchObject({
      id: "unload",
      isDisabled: true,
      disabledReason: "Thread is already unloaded.",
    });
  });
});
