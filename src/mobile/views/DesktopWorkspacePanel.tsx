import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useLingui } from "@lingui/react/macro";
import { Button } from "@heroui/react";
import {
  FileDiff,
  FolderOpen,
  Gauge,
  NotebookPen,
  PanelRightOpen,
  TerminalSquare,
  Waypoints,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import {
  UnifiedRightPanel,
  type RightPanelTab,
} from "@/renderer/components/layout/UnifiedRightPanel";
import { showTerminalPanel } from "@/renderer/actions/terminalActions";
import { useProjectTreeStore } from "@/renderer/state/projectTreeStore";
import { buildFileEditorContext, openFileInEditor } from "@/renderer/utils/gitHelpers";
import { ProjectFilesPanel } from "@/renderer/views/FileEditorOverlay/parts/ProjectFilesPanel";
import {
  SubAgentContent,
  SubAgentHeaderText,
} from "@/renderer/components/thread/ChatPane/parts/items/SubAgentOverlay";
import { useAppStore } from "@/renderer/state/appStore";
import { GitReviewPanelContent } from "@/renderer/views/MainView/parts/RightPanel/parts/GitReviewPanelContent";
import { DevTerminalPanel } from "@/renderer/views/MainView/parts/RightPanel/parts/DevTerminalPanel/DevTerminalPanel";
import { NotesPanel } from "@/renderer/views/MainView/parts/RightPanel/parts/NotesPanel/NotesPanel";
import { UsagePanel } from "@/renderer/views/MainView/parts/RightPanel/parts/UsagePanel/UsagePanel";
import { type DesktopPanelTab, useDesktopPanelStore } from "../desktopPanelStore";
import { buildFilesTarget, buildGitTarget } from "../navHelpers";
import type { RemoteDesktopSession } from "../useRemoteDesktop";
import { useGitSummaryHydration } from "../useGitSummaryHydration";
import { useGitSummariesStore } from "../gitSummaries";
import { watchTerminal } from "../terminalFeed";
import { PortsView } from "./PortsView";

const PANEL_WIDTH_KEY = "poracode-mobile.workspace-panel-width";
const PANEL_DEFAULT_WIDTH = 420;
const PANEL_MIN_WIDTH = 320;
const PANEL_MAX_WIDTH = 720;
const MAIN_MIN_WIDTH = 480;
const PANEL_RESIZE_STEP = 24;
const PANEL_EXIT_MS = 220;

function readPanelWidth(): number {
  try {
    const stored = Number(localStorage.getItem(PANEL_WIDTH_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : PANEL_DEFAULT_WIDTH;
  } catch {
    return PANEL_DEFAULT_WIDTH;
  }
}

function isDesktopPanelTab(tab: RightPanelTab): tab is DesktopPanelTab {
  return (
    tab === "git" ||
    tab === "files" ||
    tab === "terminal" ||
    tab === "usage" ||
    tab === "notes" ||
    tab === "ports" ||
    tab === "subagent"
  );
}

const RAIL_TABS = [
  { id: "git", icon: FileDiff },
  { id: "files", icon: FolderOpen },
  { id: "terminal", icon: TerminalSquare },
  { id: "usage", icon: Gauge },
  { id: "notes", icon: NotebookPen },
  { id: "ports", icon: Waypoints },
] as const satisfies ReadonlyArray<{
  readonly id: DesktopPanelTab;
  readonly icon: typeof FileDiff;
}>;

export function DesktopWorkspacePanel(props: {
  readonly remote: RemoteDesktopSession;
  readonly currentThreadId: string | null;
}) {
  const { remote, currentThreadId } = props;
  const { t } = useLingui();
  const navigate = useNavigate();
  const open = useDesktopPanelStore((state) => state.open);
  const activeTab = useDesktopPanelStore((state) => state.activeTab);
  const storedThreadId = useDesktopPanelStore((state) => state.threadId);
  const initialFilePath = useDesktopPanelStore((state) => state.initialFilePath);
  const initialFolderPath = useDesktopPanelStore((state) => state.initialFolderPath);
  const initialLineNumber = useDesktopPanelStore((state) => state.initialLineNumber);
  const openRequestKey = useDesktopPanelStore((state) => state.openRequestKey);
  const subAgentThreadId = useDesktopPanelStore((state) => state.subAgentThreadId);
  const subAgentParentItemId = useDesktopPanelStore((state) => state.subAgentParentItemId);
  const threadId = storedThreadId ?? currentThreadId;
  const thread = remote.threads.find((entry) => entry.id === threadId) ?? null;
  const project = thread
    ? (remote.projects.find((entry) => entry.id === thread.projectId) ?? null)
    : null;
  useGitSummaryHydration(thread, project);

  const isRepo = useGitSummariesStore((state) =>
    threadId ? state.byThread[threadId]?.isRepo === true : false,
  );
  const filesTarget = threadId ? buildFilesTarget(remote, threadId) : null;
  const subAgentItemExists = useAppStore((state) =>
    subAgentThreadId && subAgentParentItemId
      ? state.runtimeItemsByIdByThread[subAgentThreadId]?.[subAgentParentItemId] !== undefined
      : false,
  );
  const subAgentInCurrentThread =
    subAgentThreadId !== null &&
    subAgentParentItemId !== null &&
    subAgentThreadId === currentThreadId &&
    subAgentItemExists;
  const subAgentTarget = subAgentInCurrentThread
    ? buildFilesTarget(remote, subAgentThreadId)
    : null;
  const gitTarget = threadId && isRepo ? buildGitTarget(remote, threadId) : null;
  const filesRootContext = filesTarget
    ? buildFileEditorContext(filesTarget.project, filesTarget.worktreePath, thread?.worktreeBranch)
    : null;
  const gitPanelContext =
    gitTarget && filesTarget
      ? {
          projectId: filesTarget.project.id,
          ...(filesTarget.worktreePath ? { worktreePath: filesTarget.worktreePath } : {}),
        }
      : null;
  const visibleTab =
    activeTab === "git" && !gitTarget
      ? "files"
      : activeTab === "subagent" && !subAgentInCurrentThread
        ? "files"
        : activeTab;
  const projectId = filesTarget?.project.id ?? null;
  const worktreePath = filesTarget?.worktreePath;
  const worktreeBranch = thread?.worktreeBranch;
  const [panelWidth, setPanelWidth] = useState(readPanelWidth);
  const [panelRendered, setPanelRendered] = useState(open);
  const [panelVisible, setPanelVisible] = useState(false);
  const [openedTabs, setOpenedTabs] = useState<ReadonlySet<DesktopPanelTab>>(() => new Set());
  const toolsRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const panelWidthRef = useRef(panelWidth);
  const teardownResizeRef = useRef<(() => void) | null>(null);
  const handledOpenRequestRef = useRef(0);

  useEffect(() => () => teardownResizeRef.current?.(), []);

  useEffect(() => {
    let firstFrame: number | null = null;
    let secondFrame: number | null = null;
    let exitTimer: number | null = null;

    if (open) {
      setPanelRendered(true);
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => setPanelVisible(true));
      });
    } else {
      setPanelVisible(false);
      exitTimer = window.setTimeout(() => {
        setPanelRendered(false);
        setOpenedTabs(new Set());
      }, PANEL_EXIT_MS);
    }

    return () => {
      if (firstFrame !== null) cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) cancelAnimationFrame(secondFrame);
      if (exitTimer !== null) window.clearTimeout(exitTimer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setOpenedTabs((current) =>
      current.has(visibleTab) ? current : new Set([...current, visibleTab]),
    );
  }, [open, visibleTab]);

  useEffect(() => {
    if (!open || visibleTab !== "terminal" || !projectId) return;
    showTerminalPanel(projectId, worktreePath);
  }, [open, projectId, visibleTab, worktreePath]);

  useEffect(() => {
    if (!open || visibleTab !== "files" || openRequestKey === 0 || !project) {
      return;
    }
    if (handledOpenRequestRef.current === openRequestKey) return;
    handledOpenRequestRef.current = openRequestKey;

    if (initialFilePath) {
      void openFileInEditor(
        project,
        worktreePath,
        worktreeBranch,
        initialFilePath,
        initialLineNumber ?? undefined,
      );
      return;
    }
    if (initialFolderPath) {
      const parts = initialFolderPath.split(/[\\/]/).filter(Boolean);
      useProjectTreeStore
        .getState()
        .expandMany(parts.map((_, index) => parts.slice(0, index + 1).join("/")));
    }
  }, [
    initialFilePath,
    initialFolderPath,
    initialLineNumber,
    open,
    openRequestKey,
    project,
    visibleTab,
    worktreeBranch,
    worktreePath,
  ]);

  useEffect(() => {
    function clampToContainer() {
      commitPanelWidth(panelWidthRef.current);
    }
    clampToContainer();
    window.addEventListener("resize", clampToContainer);
    return () => window.removeEventListener("resize", clampToContainer);
  }, []);

  function clampPanelWidth(width: number): number {
    const containerWidth =
      toolsRef.current?.parentElement?.getBoundingClientRect().width ?? window.innerWidth;
    const dynamicMax = Math.max(PANEL_MIN_WIDTH, containerWidth - MAIN_MIN_WIDTH);
    return Math.min(PANEL_MAX_WIDTH, dynamicMax, Math.max(PANEL_MIN_WIDTH, Math.round(width)));
  }

  function applyPanelWidth(width: number): number {
    const next = clampPanelWidth(width);
    panelWidthRef.current = next;
    panelRef.current?.style.setProperty("--m-desktop-panel-width", `${next}px`);
    return next;
  }

  function persistPanelWidth(width: number): void {
    try {
      localStorage.setItem(PANEL_WIDTH_KEY, String(width));
    } catch {
      // Resizing remains available when storage is blocked.
    }
  }

  function commitPanelWidth(width: number): void {
    const next = applyPanelWidth(width);
    setPanelWidth(next);
    persistPanelWidth(next);
  }

  function startPanelResize(event: ReactMouseEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    event.preventDefault();
    teardownResizeRef.current?.();

    const startX = event.clientX;
    const startWidth = panelWidthRef.current;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    if (panelRef.current) panelRef.current.style.transitionDuration = "0ms";
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    let rafId: number | null = null;
    let pendingX = startX;

    function flush() {
      rafId = null;
      applyPanelWidth(startWidth + startX - pendingX);
    }

    function onMouseMove(moveEvent: MouseEvent) {
      pendingX = moveEvent.clientX;
      if (rafId === null) rafId = requestAnimationFrame(flush);
    }

    function teardown() {
      if (rafId !== null) cancelAnimationFrame(rafId);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      if (panelRef.current) panelRef.current.style.removeProperty("transition-duration");
      teardownResizeRef.current = null;
    }

    function onMouseUp(upEvent: MouseEvent) {
      const next = applyPanelWidth(startWidth + startX - upEvent.clientX);
      teardown();
      setPanelWidth(next);
      persistPanelWidth(next);
    }

    teardownResizeRef.current = teardown;
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  function resizePanelWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      commitPanelWidth(panelWidthRef.current + PANEL_RESIZE_STEP);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      commitPanelWidth(panelWidthRef.current - PANEL_RESIZE_STEP);
    }
  }

  function tabLabel(tab: DesktopPanelTab): string {
    switch (tab) {
      case "git":
        return t`Git`;
      case "files":
        return t`Files`;
      case "terminal":
        return t`Terminal`;
      case "usage":
        return t`Usage`;
      case "notes":
        return t`Notes`;
      case "ports":
        return t`Ports`;
      case "subagent":
        return t`Subagent`;
    }
  }

  const projectName =
    visibleTab === "usage"
      ? t`Usage`
      : visibleTab === "ports"
        ? t`Ports`
        : visibleTab === "subagent"
          ? undefined
          : (filesTarget?.rootLabel ?? undefined);

  return (
    <div ref={toolsRef} className="m-desktop-tools">
      {panelRendered ? (
        <>
          {panelVisible ? (
            <div
              className="m-desktop-workspace__resize"
              role="separator"
              tabIndex={0}
              aria-label={t`Resize right panel`}
              aria-orientation="vertical"
              aria-valuemin={PANEL_MIN_WIDTH}
              aria-valuemax={PANEL_MAX_WIDTH}
              aria-valuenow={panelWidth}
              onMouseDown={startPanelResize}
              onKeyDown={resizePanelWithKeyboard}
            />
          ) : null}
          <aside
            ref={panelRef}
            className="m-desktop-workspace__panel"
            data-open={panelVisible || undefined}
            style={{ "--m-desktop-panel-width": `${panelWidth}px` } as CSSProperties}
          >
            <div className="m-desktop-workspace__panel-inner">
              <UnifiedRightPanel
                activeTab={visibleTab}
                onTabChange={(tab) => {
                  if (
                    isDesktopPanelTab(tab) &&
                    (tab !== "git" || gitTarget) &&
                    (tab !== "subagent" || subAgentInCurrentThread)
                  ) {
                    useDesktopPanelStore.getState().setActiveTab(tab);
                  }
                }}
                terminalContent={
                  openedTabs.has("terminal") && filesTarget ? (
                    <DevTerminalPanel
                      key={threadId}
                      hideHeader
                      positionOverride="right"
                      watchTerminal={watchTerminal}
                      onEmpty={() => useDesktopPanelStore.getState().close()}
                    />
                  ) : null
                }
                gitContent={
                  openedTabs.has("git") && gitPanelContext ? (
                    <GitReviewPanelContent
                      key={threadId}
                      gitPanelContext={gitPanelContext}
                      onClose={() => useDesktopPanelStore.getState().close()}
                      onExpandToOverlay={() => undefined}
                    />
                  ) : null
                }
                filesContent={
                  openedTabs.has("files") && filesRootContext ? (
                    <ProjectFilesPanel key={threadId} rootContext={filesRootContext} />
                  ) : null
                }
                browserContent={null}
                usageContent={
                  openedTabs.has("usage") && remote.activeDesktop ? (
                    <UsagePanel
                      onOpenUsageSettings={() =>
                        void navigate({
                          to: "/settings/$section",
                          params: { section: "usage" },
                        })
                      }
                    />
                  ) : null
                }
                notesContent={
                  openedTabs.has("notes") && filesTarget ? (
                    <NotesPanel key={filesTarget.project.id} projectId={filesTarget.project.id} />
                  ) : null
                }
                portsContent={openedTabs.has("ports") ? <PortsView /> : null}
                subagentContent={
                  openedTabs.has("subagent") && subAgentInCurrentThread ? (
                    <SubAgentContent
                      key={`${subAgentThreadId}:${subAgentParentItemId}`}
                      threadId={subAgentThreadId}
                      parentItemId={subAgentParentItemId}
                      hideHeader
                      {...(subAgentTarget
                        ? { projectLocation: subAgentTarget.projectLocation }
                        : {})}
                    />
                  ) : null
                }
                showTerminalTab={filesTarget !== null}
                showGitTab={gitTarget !== null}
                showFilesTab={filesTarget !== null}
                showNotesTab={filesTarget !== null}
                showUsageTab={remote.activeDesktop !== null}
                showBrowserTab={false}
                showPortsTab={remote.activeDesktop !== null}
                showSubagentTab={subAgentInCurrentThread}
                {...(subAgentInCurrentThread
                  ? {
                      subagentModel: (
                        <SubAgentHeaderText
                          threadId={subAgentThreadId}
                          parentItemId={subAgentParentItemId}
                          compact
                          part="description"
                        />
                      ),
                      subagentTitle: (
                        <SubAgentHeaderText
                          threadId={subAgentThreadId}
                          parentItemId={subAgentParentItemId}
                          compact
                          part="title"
                        />
                      ),
                      onCloseSubagent: () => useDesktopPanelStore.getState().closeSubAgent(),
                    }
                  : {})}
                projectName={projectName}
                onClose={() => useDesktopPanelStore.getState().close()}
              />
            </div>
          </aside>
        </>
      ) : null}
      <nav
        className="m-desktop-tool-rail"
        data-hidden={open || panelRendered || undefined}
        aria-label={t`Tools`}
      >
        <span className="m-desktop-tool-rail__collapsed" aria-hidden="true">
          <PanelRightOpen className="size-[18px]" />
        </span>
        <div className="m-desktop-tool-rail__actions">
          {RAIL_TABS.map(({ id, icon: Icon }) => {
            const scoped = id === "git" || id === "files" || id === "terminal" || id === "notes";
            const requiresDesktop = id === "usage" || id === "ports";
            const disabled =
              (scoped && !filesTarget) || (requiresDesktop && remote.activeDesktop === null);
            const label = tabLabel(id);
            return (
              <Button
                key={id}
                isIconOnly
                size="sm"
                variant="ghost"
                className="m-desktop-tool-rail__button"
                data-active={(open && visibleTab === id) || undefined}
                isDisabled={disabled || (id === "git" && !gitTarget)}
                aria-label={label}
                onPress={() =>
                  useDesktopPanelStore.getState().toggle(id, currentThreadId ?? storedThreadId)
                }
              >
                <Icon className="size-[18px]" />
              </Button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
