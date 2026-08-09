import type { ReactNode } from "react";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { Project, Thread } from "@/shared/contracts";
import { SortableThreadItem } from "./SortableThreadItem";

type MockContextMenuItem = {
  id: string;
  isDisabled?: boolean;
  disabledReason?: string;
};

const {
  sortableRefMock,
  sortableOptionsMock,
  contextMenuItemsMock,
  getStatusToneMock,
  useThreadHasBackgroundActivityMock,
  useThreadHasDraftMock,
} = vi.hoisted(() => ({
  sortableRefMock: vi.fn<(element: HTMLElement | null) => void>(),
  sortableOptionsMock: vi.fn<(options: unknown) => void>(),
  contextMenuItemsMock: vi.fn<(items: MockContextMenuItem[]) => void>(),
  getStatusToneMock:
    vi.fn<(thread: Thread, opts?: { hasBackgroundActivity?: boolean }) => string>(),
  useThreadHasBackgroundActivityMock: vi.fn<(threadId: string) => boolean>(),
  useThreadHasDraftMock: vi.fn<(threadId: string) => boolean>(),
}));

vi.mock("@dnd-kit/react/sortable", () => ({
  useSortable: (options: unknown) => {
    sortableOptionsMock(options);
    return { ref: sortableRefMock };
  },
}));

vi.mock("@/renderer/dnd", () => ({
  useIsDraggingThread: () => false,
}));

vi.mock("@/renderer/components/common/ContextMenu", () => ({
  ContextMenu: (props: { children: ReactNode; items: MockContextMenuItem[] }) => {
    contextMenuItemsMock(props.items);
    return <>{props.children}</>;
  },
}));

vi.mock("@/renderer/components/common/SidebarButton", () => ({
  SidebarButton: (props: { label: ReactNode; suffix?: ReactNode }) => (
    <button type="button">
      {props.label}
      {props.suffix}
    </button>
  ),
}));

vi.mock("@/renderer/components/providers/ThreadProviderIcon", () => ({
  ThreadProviderIcon: () => null,
}));

vi.mock("@/renderer/views/MainView/parts/Sidebar/parts/GitBadge", () => ({
  GitBadge: (props: { projectName: string }) => (
    <button type="button" aria-label={`Git status for ${props.projectName}`} />
  ),
}));

vi.mock("@/renderer/components/providers/statusTone", () => ({
  getStatusTone: getStatusToneMock,
}));

vi.mock("@/renderer/hooks/uiSelectors", () => ({
  useCurrentThreadIdsCount: () => 1,
  useProjectAgentStatuses: () => [],
  useIsCurrentThread: () => false,
  useThreadHasBackgroundActivity: (threadId: string) =>
    useThreadHasBackgroundActivityMock(threadId),
  useThreadHasDraft: (threadId: string) => useThreadHasDraftMock(threadId),
  useIsProjectGitPanelActive: () => false,
  useIsWorktreeFilesPanelActive: () => false,
  useIsWorktreeGitPanelActive: () => false,
  useIsWorktreeTerminalActive: () => false,
  useIsWorktreeTerminalBusy: () => false,
  useIsWorktreeTerminalOpen: () => false,
  useRunningProjectActionIds: () => [],
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

vi.mock("@/renderer/state/gitStore", () => {
  const state = { prData: {} };
  return {
    useGitStore: Object.assign((selector: (value: typeof state) => unknown) => selector(state), {
      getState: () => state,
    }),
  };
});

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
    sortableOptionsMock.mockClear();
    contextMenuItemsMock.mockClear();
    getStatusToneMock.mockReset();
    getStatusToneMock.mockReturnValue("default");
    useThreadHasBackgroundActivityMock.mockReset();
    useThreadHasBackgroundActivityMock.mockReturnValue(false);
    useThreadHasDraftMock.mockReset();
    useThreadHasDraftMock.mockReturnValue(false);
  });

  it("keeps the row visually working while the thread has background activity", () => {
    const thread = makeThread();
    useThreadHasBackgroundActivityMock.mockReturnValue(true);

    render(
      <SortableThreadItem
        thread={thread}
        threadIndex={1}
        project={project}
        showWorktreeBadge={false}
        editingThreadId={null}
        setEditingThreadId={vi.fn<(id: string | null) => void>()}
        group="project-entries:project-1"
      />,
    );

    expect(getStatusToneMock).toHaveBeenCalledWith(thread, { hasBackgroundActivity: true });
  });

  it("shows the draft dot after the title when the thread has an unsent draft", () => {
    useThreadHasDraftMock.mockReturnValue(true);

    const { getByLabelText } = render(
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

    expect(getByLabelText("Has unsent draft")).toBeInTheDocument();
  });

  it("hides the draft dot when the thread has no draft", () => {
    const { queryByLabelText } = render(
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

    expect(queryByLabelText("Has unsent draft")).not.toBeInTheDocument();
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

  it("keeps automatic-sort rows draggable into panes while disabling sidebar reordering", () => {
    render(
      <SortableThreadItem
        thread={makeThread()}
        threadIndex={1}
        project={project}
        showWorktreeBadge={false}
        editingThreadId={null}
        setEditingThreadId={vi.fn<(id: string | null) => void>()}
        group="project-entries:project-1"
        sortDisabled
      />,
    );

    expect(sortableOptionsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "thread",
        accept: [],
        disabled: false,
      }),
    );
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

  it("shows the project git badge on a flat-list main-branch thread row", () => {
    render(
      <SortableThreadItem
        thread={makeThread()}
        threadIndex={1}
        project={project}
        showWorktreeBadge={false}
        editingThreadId={null}
        setEditingThreadId={vi.fn<(id: string | null) => void>()}
        group="flat:__flat__"
        projectTag={<span>{project.name}</span>}
      />,
    );

    expect(screen.getByRole("button", { name: "Git status for Project" })).toBeInTheDocument();
  });

  it("omits the project git badge in grouped lists, where the project header carries it", () => {
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

    expect(
      screen.queryByRole("button", { name: "Git status for Project" }),
    ).not.toBeInTheDocument();
  });
});
