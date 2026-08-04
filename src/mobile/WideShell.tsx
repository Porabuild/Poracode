import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@heroui/react";
import { FolderKanban, Gauge, Globe2, Plus, Server, Settings2, Waypoints } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";
import { Outlet, useNavigate } from "@tanstack/react-router";
import { DeferredFileEditorPanel } from "@/renderer/deferredFeatures";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { ConnectionBanner } from "./components";
import { Brand, ConnectionControl } from "./NarrowShell";
import { openWorktreeDraft, threadIdFromPath } from "./navHelpers";
import { desktopTitle } from "@/shared/remote/desktopLabel";
import { MobileSetupEmptyState } from "./setupEmptyState";
import type { RemoteDesktopSession } from "./useRemoteDesktop";
import { ThreadsView } from "./views/ThreadsView";
import { useDesktopPanelStore } from "./desktopPanelStore";
import { DESKTOP_RIGHT_PANEL_QUERY, useMediaQuery } from "./useMediaQuery";

const DesktopWorkspacePanel = lazy(() =>
  import("./views/DesktopWorkspacePanel").then((module) => ({
    default: module.DesktopWorkspacePanel,
  })),
);

const SIDEBAR_WIDTH_KEY = "poracode-mobile.sidebar-width";
const SIDEBAR_MIN_WIDTH = 240;
const SIDEBAR_MAX_WIDTH = 500;
const SIDEBAR_MIN_CONTENT_WIDTH = 320;
const SIDEBAR_RESIZE_STEP = 24;

function getSidebarMaxWidth(): number {
  return Math.min(
    SIDEBAR_MAX_WIDTH,
    Math.max(SIDEBAR_MIN_WIDTH, window.innerWidth - SIDEBAR_MIN_CONTENT_WIDTH),
  );
}

function clampSidebarWidth(width: number): number {
  return Math.min(getSidebarMaxWidth(), Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

function readSidebarWidth(): number {
  const responsiveDefault = Math.min(304, Math.max(248, window.innerWidth * 0.2));
  try {
    const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    return clampSidebarWidth(Number.isFinite(stored) && stored > 0 ? stored : responsiveDefault);
  } catch {
    return clampSidebarWidth(responsiveDefault);
  }
}

function persistSidebarWidth(width: number): void {
  try {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
  } catch {
    // Resizing still works when storage is unavailable.
  }
}

function SidebarDestination(props: {
  readonly active: boolean;
  readonly disabled?: boolean;
  readonly icon: ReactNode;
  readonly label: ReactNode;
  readonly onPress: () => void;
}) {
  return (
    <button
      type="button"
      className="m-sidebar__destination"
      data-active={props.active || undefined}
      disabled={props.disabled}
      onClick={props.onPress}
    >
      {props.icon}
      <span>{props.label}</span>
    </button>
  );
}

/** Tablet/desktop chrome: a persistent thread sidebar + the routed detail pane. */
export function WideShell(props: {
  readonly remote: RemoteDesktopSession;
  readonly pathname: string;
  readonly projectFilter: string | null;
  readonly setProjectFilter: (next: string | null) => void;
}) {
  const { remote, pathname, projectFilter, setProjectFilter } = props;
  const navigate = useNavigate();
  const { t } = useLingui();
  const selectedThreadId = threadIdFromPath(pathname);
  const hasActiveDesktop = remote.activeDesktop !== null;
  const showDesktopTools = useMediaQuery(DESKTOP_RIGHT_PANEL_QUERY);
  const fileEditorOpen = useFileEditorStore((state) => state.overlayMode === "modal");
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth);
  const sidebarWidthRef = useRef(sidebarWidth);
  const shellRef = useRef<HTMLDivElement>(null);
  const teardownResizeRef = useRef<(() => void) | null>(null);

  useEffect(() => () => teardownResizeRef.current?.(), []);

  useEffect(() => {
    if (showDesktopTools && selectedThreadId) {
      useDesktopPanelStore.getState().setThreadId(selectedThreadId);
    }
  }, [selectedThreadId, showDesktopTools]);

  function applySidebarWidth(next: number): number {
    const width = clampSidebarWidth(next);
    sidebarWidthRef.current = width;
    // Write the grid column directly instead of updating --m-sidebar-width:
    // changing a custom property on the shell root invalidates style recalc
    // for the entire subtree on every drag frame, which makes the drag lag.
    shellRef.current?.style.setProperty("grid-template-columns", `${width}px minmax(0, 1fr)`);
    return width;
  }

  function commitSidebarWidth(next: number): void {
    const width = applySidebarWidth(next);
    setSidebarWidth(width);
    persistSidebarWidth(width);
  }

  function startSidebarResize(event: ReactMouseEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    event.preventDefault();
    teardownResizeRef.current?.();

    const startX = event.clientX;
    const startWidth = sidebarWidthRef.current;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    // Coalesce mousemove bursts into one style write per frame — mousemove can
    // fire faster than the display refresh, and each unbatched write forces an
    // extra style/layout pass.
    let rafId: number | null = null;
    let pendingX = startX;

    function flush(): void {
      rafId = null;
      applySidebarWidth(startWidth + pendingX - startX);
    }

    function onMouseMove(moveEvent: MouseEvent): void {
      pendingX = moveEvent.clientX;
      if (rafId === null) rafId = requestAnimationFrame(flush);
    }

    function teardown(): void {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      teardownResizeRef.current = null;
    }

    function onMouseUp(upEvent: MouseEvent): void {
      const width = applySidebarWidth(startWidth + upEvent.clientX - startX);
      teardown();
      setSidebarWidth(width);
      persistSidebarWidth(width);
    }

    teardownResizeRef.current = teardown;
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  function resizeSidebarWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      commitSidebarWidth(sidebarWidthRef.current - SIDEBAR_RESIZE_STEP);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      commitSidebarWidth(sidebarWidthRef.current + SIDEBAR_RESIZE_STEP);
    }
  }

  return (
    <div
      ref={shellRef}
      className="m-shell m-shell--wide"
      style={{ "--m-sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <aside className="m-sidebar">
        <header className="m-sidebar__head">
          <Brand onPress={() => void navigate({ to: "/threads" })} />
          <ConnectionControl
            remote={remote}
            showDesktopName
            onPair={() => void navigate({ to: "/desktops" })}
          />
          <Button
            size="sm"
            variant="ghost"
            className="m-sidebar__new"
            data-active={pathname === "/new" || undefined}
            isDisabled={!hasActiveDesktop}
            onPress={() => void navigate({ to: "/new" })}
          >
            <Plus className="size-4" />
            <Trans>New thread</Trans>
          </Button>
        </header>
        <div className="m-sidebar__scroll">
          <ThreadsView
            projects={remote.projects}
            threads={remote.activeThreads}
            selectedThreadId={selectedThreadId}
            projectFilter={projectFilter}
            loading={!remote.booted}
            onProjectFilterChange={setProjectFilter}
            onOpenThread={(thread) => {
              void remote.openThread(thread);
              void navigate({ to: "/thread/$threadId", params: { threadId: thread.id } });
            }}
            onThreadAction={(thread, action) => {
              void remote.applyThreadAction(thread, action);
            }}
            onDeleteWorktreeGroup={(input) => {
              void remote.deleteWorktreeGroup(input);
            }}
            onNew={() => void navigate({ to: "/new" })}
            onNewThreadInWorktree={(input) => {
              void openWorktreeDraft(input, () => navigate({ to: "/new" }));
            }}
            onOpenTerminal={(input) => {
              if (showDesktopTools && input.sourceThreadId) {
                useDesktopPanelStore.getState().show("terminal", input.sourceThreadId);
                return;
              }
              void navigate({
                to: "/terminal/$projectId",
                params: { projectId: input.projectId },
                search: {
                  ...(input.sourceThreadId ? { fromThread: input.sourceThreadId } : {}),
                  ...(input.worktreePath ? { worktree: input.worktreePath } : {}),
                },
              });
            }}
            onRunProjectAction={(input) =>
              void navigate({
                to: "/terminal/$projectId",
                params: { projectId: input.projectId },
                search: {
                  action: input.actionId,
                  ...(input.sourceThreadId ? { fromThread: input.sourceThreadId } : {}),
                  ...(input.worktreePath ? { worktree: input.worktreePath } : {}),
                },
              })
            }
            {...(!hasActiveDesktop
              ? {
                  emptyStateOverride: (
                    <MobileSetupEmptyState
                      kind="desktop"
                      onAction={() => void navigate({ to: "/desktops" })}
                    />
                  ),
                }
              : {})}
          />
        </div>
        <footer className="m-sidebar__foot">
          <nav className="m-sidebar__nav">
            {!showDesktopTools ? (
              <SidebarDestination
                active={pathname === "/usage"}
                disabled={!hasActiveDesktop}
                icon={<Gauge className="size-4" />}
                label={<Trans>Usage</Trans>}
                onPress={() => void navigate({ to: "/usage" })}
              />
            ) : null}
            <SidebarDestination
              active={pathname === "/projects"}
              disabled={!hasActiveDesktop}
              icon={<FolderKanban className="size-4" />}
              label={<Trans>Projects</Trans>}
              onPress={() => void navigate({ to: "/projects" })}
            />
            <SidebarDestination
              active={pathname === "/browser"}
              disabled={!hasActiveDesktop}
              icon={<Globe2 className="size-4" />}
              label={<Trans>Browser</Trans>}
              onPress={() => void navigate({ to: "/browser" })}
            />
            {!showDesktopTools ? (
              <SidebarDestination
                active={pathname === "/ports"}
                disabled={!hasActiveDesktop}
                icon={<Waypoints className="size-4" />}
                label={<Trans>Ports</Trans>}
                onPress={() => void navigate({ to: "/ports" })}
              />
            ) : null}
            <SidebarDestination
              active={pathname.startsWith("/settings")}
              icon={<Settings2 className="size-4" />}
              label={<Trans>Settings</Trans>}
              onPress={() => void navigate({ to: "/settings" })}
            />
          </nav>
          <button
            type="button"
            className="m-sidebar__desktops"
            data-active={pathname === "/desktops"}
            onClick={() => void navigate({ to: "/desktops" })}
          >
            <Server className="size-4" />
            <span>
              <strong>
                {remote.activeDesktop
                  ? desktopTitle(remote.activeDesktop.label)
                  : t`No connection paired`}
              </strong>
              <span>
                <Plural
                  value={remote.desktops.length}
                  one="# paired desktop"
                  other="# paired desktops"
                />
              </span>
            </span>
          </button>
        </footer>
        <div
          className="m-sidebar__resize-handle"
          onMouseDown={startSidebarResize}
          onKeyDown={resizeSidebarWithKeyboard}
          role="separator"
          tabIndex={0}
          aria-label={t`Resize sidebar`}
          aria-orientation="vertical"
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={getSidebarMaxWidth()}
          aria-valuenow={sidebarWidth}
        />
      </aside>
      <div className="m-wide-content">
        <main className="m-detail">
          {hasActiveDesktop ? (
            <ConnectionBanner
              state={remote.connection}
              message={remote.message}
              onReconnect={remote.reconnect}
              onPair={() => void navigate({ to: "/desktops" })}
            />
          ) : null}
          <Outlet />
          {showDesktopTools && fileEditorOpen ? (
            <Suspense fallback={null}>
              <DeferredFileEditorPanel />
            </Suspense>
          ) : null}
        </main>
        {showDesktopTools ? (
          <Suspense fallback={null}>
            <DesktopWorkspacePanel remote={remote} currentThreadId={selectedThreadId} />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
}
