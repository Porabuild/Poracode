import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { FolderKanban, Gauge, Globe2, Plus, Server, Settings2, Waypoints } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";
import { Outlet, useNavigate } from "@tanstack/react-router";
import { ConnectionBanner } from "./components";
import { Brand, ConnectionControl } from "./NarrowShell";
import { preselectWorktreeDraft, threadIdFromPath } from "./navHelpers";
import { MobileSetupEmptyState } from "./setupEmptyState";
import type { RemoteDesktopSession } from "./useRemoteDesktop";
import { ThreadsView } from "./views/ThreadsView";

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
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth);
  const sidebarWidthRef = useRef(sidebarWidth);
  const shellRef = useRef<HTMLDivElement>(null);
  const teardownResizeRef = useRef<(() => void) | null>(null);

  useEffect(() => () => teardownResizeRef.current?.(), []);

  function applySidebarWidth(next: number): number {
    const width = clampSidebarWidth(next);
    sidebarWidthRef.current = width;
    shellRef.current?.style.setProperty("--m-sidebar-width", `${width}px`);
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

    function onMouseMove(moveEvent: MouseEvent): void {
      applySidebarWidth(startWidth + moveEvent.clientX - startX);
    }

    function teardown(): void {
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
          <ConnectionControl remote={remote} onPair={() => void navigate({ to: "/desktops" })} />
        </header>
        <div className="m-sidebar__primary">
          <SidebarDestination
            active={pathname === "/new"}
            disabled={!hasActiveDesktop}
            icon={<Plus className="size-4" />}
            label={<Trans>New thread</Trans>}
            onPress={() => void navigate({ to: "/new" })}
          />
        </div>
        <div className="m-sidebar__scroll">
          <ThreadsView
            projects={remote.projects}
            threads={remote.threads}
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
              preselectWorktreeDraft(input);
              void navigate({ to: "/new" });
            }}
            onOpenTerminal={(input) =>
              void navigate({
                to: "/terminal/$projectId",
                params: { projectId: input.projectId },
                search: {
                  ...(input.sourceThreadId ? { fromThread: input.sourceThreadId } : {}),
                  ...(input.worktreePath ? { worktree: input.worktreePath } : {}),
                },
              })
            }
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
            <SidebarDestination
              active={pathname === "/usage"}
              disabled={!hasActiveDesktop}
              icon={<Gauge className="size-4" />}
              label={<Trans>Usage</Trans>}
              onPress={() => void navigate({ to: "/usage" })}
            />
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
            <SidebarDestination
              active={pathname === "/ports"}
              disabled={!hasActiveDesktop}
              icon={<Waypoints className="size-4" />}
              label={<Trans>Ports</Trans>}
              onPress={() => void navigate({ to: "/ports" })}
            />
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
              <strong>{remote.activeDesktop?.label ?? t`No connection paired`}</strong>
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
      </main>
    </div>
  );
}
