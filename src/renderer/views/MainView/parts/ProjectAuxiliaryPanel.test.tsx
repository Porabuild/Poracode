import { act, render, renderHook, waitFor } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { I18nProvider } from "@lingui/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { deleteProject } from "@/renderer/actions/projectActions";
import { closeExitedShell } from "@/renderer/actions/terminalTabActions";
import { i18n } from "@/renderer/i18n/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { resetDevTerminalStore, useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { ThreadDocksPlacementToggle } from "@/renderer/components/thread/ThreadDocksPlacementToggle";
import { ProjectAuxiliaryPanel } from "./ProjectAuxiliaryPanel";
import { usePanelVisibility } from "./AppShell/parts/usePanelVisibility";

vi.mock("@/renderer/analytics/useProductViewTracking", () => ({
  productSurfaceView: vi.fn<(tab: string, mode: string) => string>(() => "git"),
  useProductViewTracking: vi.fn<() => void>(),
}));

vi.mock("@/renderer/state/gitRefresh", () => ({
  prefetchVisibleGitPanelPrData: vi.fn<(projectId: string, worktreePath?: string) => Promise<void>>(
    () => Promise.resolve(),
  ),
}));

interface CapturedRightPanelProps {
  activeTab: string;
  projectName?: string;
  docksContent?: ReactElement;
  docksHeaderActions?: ReactElement;
  notesContent?: ReactElement<{ projectId: string }>;
}

const unifiedRightPanelProps = vi.hoisted(() => ({
  current: null as CapturedRightPanelProps | null,
}));

vi.mock("@/renderer/components/layout/UnifiedRightPanel", () => ({
  UnifiedRightPanel: (props: CapturedRightPanelProps) => {
    unifiedRightPanelProps.current = props;
    return null;
  },
}));

function makeThread(id: string, projectId: string, worktreePath: string): Thread {
  const now = "2026-08-03T00:00:00.000Z";
  return {
    id,
    projectId,
    worktreePath,
    title: id,
    agentKind: "codex",
    config: { model: "gpt-5.4" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: now,
    updatedAt: now,
  };
}

const threadA = makeThread("thread-a", "project-a", "/worktree-a");
const threadB = makeThread("thread-b", "project-b", "/worktree-b");
const threadC = makeThread("thread-c", "project-c", "/worktree-c");

function makeProject(id: string): Project {
  return {
    id,
    name: `Project ${id}`,
    location: { kind: "windows", path: `C:\\${id}` },
    createdAt: "2026-08-01T00:00:00.000Z",
  };
}

function focusThread(threadId: string): void {
  useAppStore.setState({
    threads: [threadA, threadB, threadC],
    view: { kind: "thread", panes: [threadId] },
    focusedPaneId: threadId,
  });
}

function seedImageOnlyThread(): void {
  useAppStore.setState({
    runtimeItemIdsByThread: { [threadA.id]: ["user-image"] },
    runtimeItemsByIdByThread: {
      [threadA.id]: {
        "user-image": {
          id: "user-image",
          type: "user_message",
          state: "completed",
          payload: {
            content: [
              {
                kind: "image",
                source: "attachment",
                path: "/tmp/a.png",
                name: "a.png",
              },
            ],
          },
          streams: {},
        },
      },
    },
    runtimeStructuralVersionByThread: { [threadA.id]: 1 },
  });
}

describe("ProjectAuxiliaryPanel", () => {
  beforeEach(() => {
    localStorage.clear();
    unifiedRightPanelProps.current = null;
    focusThread(threadA.id);
    useAppStore.setState({
      projects: [],
      runtimeBackgroundTasksByThread: {},
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeStructuralVersionByThread: {},
    });
    useDevTerminalStore.setState({ isOpen: false, tabs: [] });
    useSharedSettings.setState({ threadDocksPlacement: "composer", terminalPosition: "right" });
    usePanelStore.setState({
      gitReviewContext: {
        projectId: threadB.projectId,
        worktreePath: threadB.worktreePath!,
        originComposerId: threadB.id,
      },
      gitReviewAsPanel: true,
      rightPanelFollowsThread: true,
      rightPanelTab: "git",
      rightPanelSplit: null,
      filesPanelContext: null,
      browserPanelOpen: false,
      usagePanelOpen: false,
      notesPanelOpen: false,
      threadDocksPanelOpen: false,
      subAgentPanelOpen: false,
      subAgentPanelContext: null,
      bottomPanelDocks: { left: null, right: null },
    });
  });

  it("preserves a git badge target when the locked panel opens", async () => {
    render(
      <I18nProvider i18n={i18n}>
        <ProjectAuxiliaryPanel includeTerminal visible />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(usePanelStore.getState().gitReviewContext).toEqual({
        projectId: threadB.projectId,
        worktreePath: threadB.worktreePath!,
        originComposerId: threadB.id,
      });
    });

    act(() => focusThread(threadC.id));

    await waitFor(() => {
      expect(usePanelStore.getState().gitReviewContext).toEqual({
        projectId: threadC.projectId,
        worktreePath: threadC.worktreePath!,
      });
    });
  });

  it("passes the focused worktree location to right-panel docks", async () => {
    useAppStore.setState({
      projects: [
        {
          id: threadA.projectId,
          name: "Project A",
          location: { kind: "posix", path: "/repo-a" },
          createdAt: "2026-08-03T00:00:00.000Z",
        },
      ],
      runtimeBackgroundTasksByThread: {
        [threadA.id]: [{ taskId: "task-1", kind: "other", description: "Watch" }],
      },
    });
    useSharedSettings.setState({ threadDocksPlacement: "right" });
    usePanelStore.setState({ threadDocksPanelOpen: true, rightPanelTab: "docks" });

    render(
      <I18nProvider i18n={i18n}>
        <ProjectAuxiliaryPanel includeTerminal visible />
      </I18nProvider>,
    );

    await waitFor(() => expect(unifiedRightPanelProps.current?.docksContent).toBeDefined());
    expect(unifiedRightPanelProps.current?.docksHeaderActions).toMatchObject({
      type: ThreadDocksPlacementToggle,
      props: { placement: "right" },
    });
    expect(
      unifiedRightPanelProps.current?.docksContent?.props as {
        projectLocation?: { kind: string; path: string };
      },
    ).toMatchObject({ projectLocation: { kind: "posix", path: "/worktree-a" } });
  });

  it("keeps an explicitly opened image-only Thread info panel visible", () => {
    seedImageOnlyThread();
    useSharedSettings.setState({ threadDocksPlacement: "right" });
    usePanelStore.setState({
      gitReviewContext: null,
      gitReviewAsPanel: false,
      threadDocksPanelOpen: true,
      rightPanelTab: "docks",
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <I18nProvider i18n={i18n}>{children}</I18nProvider>
    );
    const { result } = renderHook(() => usePanelVisibility(), { wrapper });
    expect(result.current.rightPanelOpen).toBe(true);

    act(() => usePanelStore.getState().setThreadDocksPanelOpen(false));
    expect(result.current.rightPanelOpen).toBe(false);
  });

  it("opens image-focused Thread info while informational docks stay above the composer", async () => {
    seedImageOnlyThread();
    usePanelStore.setState({
      threadDocksPanelOpen: true,
      threadDocksFocus: "images",
      rightPanelTab: "docks",
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <I18nProvider i18n={i18n}>{children}</I18nProvider>
    );
    const { result } = renderHook(() => usePanelVisibility(), { wrapper });
    expect(result.current.rightPanelOpen).toBe(true);

    render(
      <I18nProvider i18n={i18n}>
        <ProjectAuxiliaryPanel includeTerminal visible />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(unifiedRightPanelProps.current?.activeTab).toBe("docks");
    });
    expect(unifiedRightPanelProps.current?.docksContent).toBeDefined();
    expect(unifiedRightPanelProps.current?.docksHeaderActions).toMatchObject({
      type: ThreadDocksPlacementToggle,
      props: { placement: "composer" },
    });
  });

  it("leaves the browser tab when the browser panel was dismissed with it selected", async () => {
    // Closing the last browser tab clears browserPanelOpen over IPC but leaves
    // rightPanelTab on "browser"; the panel must fall back to an open panel
    // instead of rendering an empty browser layer.
    usePanelStore.setState({ rightPanelTab: "browser", browserPanelOpen: false });

    render(
      <I18nProvider i18n={i18n}>
        <ProjectAuxiliaryPanel includeTerminal visible />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(unifiedRightPanelProps.current?.activeTab).toBe("git");
    });
  });

  it("keeps the browser tab active while the browser panel is open", async () => {
    usePanelStore.setState({ rightPanelTab: "browser", browserPanelOpen: true });

    render(
      <I18nProvider i18n={i18n}>
        <ProjectAuxiliaryPanel includeTerminal visible />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(unifiedRightPanelProps.current?.activeTab).toBe("browser");
    });
  });

  describe("when the last terminal shell exits on Home", () => {
    // Notes on Home has no project of its own, so it takes the terminal's.
    function openProjectBTerminalOnHome() {
      resetDevTerminalStore();
      useAppStore.setState({
        view: { kind: "home" },
        threads: [],
        projects: [makeProject("project-a"), makeProject("project-b")],
      });
      usePanelStore.setState({ gitReviewContext: null, notesPanelOpen: true });
      const store = useDevTerminalStore.getState();
      const tab = store.addTab("project-b", "Shell");
      store.openPanel("project-b");
      return tab;
    }

    function renderPanel() {
      render(
        <I18nProvider i18n={i18n}>
          <ProjectAuxiliaryPanel includeTerminal visible />
        </I18nProvider>,
      );
    }

    function shownNotes() {
      const props = unifiedRightPanelProps.current;
      return {
        activeTab: props?.activeTab,
        projectName: props?.projectName,
        projectId: props?.notesContent?.props.projectId,
      };
    }

    const projectBNotes = {
      activeTab: "notes",
      projectName: "Project project-b",
      projectId: "project-b",
    };

    it("keeps Notes on the terminal's project when it was in front of the terminal", () => {
      const tab = openProjectBTerminalOnHome();
      usePanelStore.setState({ rightPanelTab: "notes" });
      renderPanel();
      expect(shownNotes()).toEqual(projectBNotes);

      act(() => closeExitedShell(tab.id));

      expect(shownNotes()).toEqual(projectBNotes);
    });

    it("keeps Notes on the terminal's project when it takes over from the terminal's split", () => {
      const tab = openProjectBTerminalOnHome();
      usePanelStore.setState({
        rightPanelTab: "terminal",
        rightPanelSplit: { tab: "notes", placement: "bottom" },
      });
      renderPanel();
      expect(unifiedRightPanelProps.current?.notesContent?.props.projectId).toBe("project-b");

      act(() => closeExitedShell(tab.id));

      expect(usePanelStore.getState().rightPanelSplit).toBeNull();
      expect(shownNotes()).toEqual(projectBNotes);
    });

    it("moves Notes off the terminal's project when that project is removed", async () => {
      const tab = openProjectBTerminalOnHome();
      usePanelStore.setState({ rightPanelTab: "notes" });
      renderPanel();
      act(() => closeExitedShell(tab.id));
      expect(shownNotes()).toEqual(projectBNotes);

      await act(async () => deleteProject("project-b"));

      // Notes edits are saved under the project the panel renders.
      expect(useDevTerminalStore.getState().activeProjectId).toBeNull();
      expect(shownNotes()).toEqual({
        activeTab: "notes",
        projectName: "Project project-a",
        projectId: "project-a",
      });
    });
  });
});
