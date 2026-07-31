import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import { FileDiff, FolderOpen, NotebookPen, PanelRightOpen, TerminalSquare } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { isHomeProjectId } from "@/shared/homeScope";
import {
  closeAllPanels,
  openFilesPanel,
  openNotesPanel,
  showGitReviewPanel,
} from "@/renderer/actions/panelActions";
import { openTerminal, openWorktreeTerminal } from "@/renderer/actions/terminalActions";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { usePanelVisibility } from "@/renderer/views/MainView/parts/AppShell/parts/usePanelVisibility";
import { floatingGlassSurfaceClass } from "@/renderer/components/layout/floatingGlass";
import { useThreadToolRailDrag } from "./useThreadToolRailDrag";

const railPillClass = "flex flex-col items-center gap-0.5 rounded-full p-1";

/**
 * Pane width from which an always-open rail clears the chat column instead of
 * covering it: the column is centered and capped at 920px (inside a 1040px
 * shell with 12px side padding), and the rail needs 36px plus an 8px gap on
 * each side — 920 + 2 × 44.
 */
const ALWAYS_OPEN_MIN_PANE_WIDTH = 1008;
const HEADER_MENU_CLOSE_DELAY_MS = 250;

interface RailTool {
  id: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  activate: () => void;
}

type HeaderMenuPhase = "ready" | "suppressed" | "awaiting-reentry";

/**
 * Per-pane launcher for the thread-scoped right-panel tools (git, files,
 * terminal, notes) pointed at *this* thread's project + worktree. Panel-wide
 * tools that are not tied to a thread (usage, browser) stay in the right panel
 * header only.
 *
 * Interaction mirrors the mobile PWA:
 * - The header launcher is omitted while the side rail is rendered, leaving no
 *   duplicate icon or empty header space.
 * - Single pane wide enough that the rail lands beside the centered chat column
 *   instead of over it: permanently open and visible.
 * - Anything narrower (or split panes): a header icon that expands downward
 *   into the tool menu on hover/focus, keeping the conversation unobstructed.
 */
export function ThreadToolRail(props: {
  projectId: string;
  worktreePath?: string | undefined;
  paneCount: number;
}) {
  const { t } = useLingui();
  const { projectId, worktreePath, paneCount } = props;

  const rightPanelTab = usePanelStore((s) => s.rightPanelTab);
  const gitScoped = usePanelStore(
    (s) =>
      s.gitReviewAsPanel &&
      s.gitReviewContext?.projectId === projectId &&
      s.gitReviewContext?.worktreePath === worktreePath,
  );
  const filesScoped = usePanelStore(
    (s) =>
      s.filesPanelContext?.projectId === projectId &&
      s.filesPanelContext?.worktreePath === worktreePath,
  );
  const notesPanelOpen = usePanelStore((s) => s.notesPanelOpen);
  const terminalScoped = useDevTerminalStore(
    (s) =>
      s.isOpen &&
      s.activeProjectId === projectId &&
      (s.activeWorktreePath ?? undefined) === worktreePath,
  );
  const terminalOnRight = useSharedSettings((s) => s.terminalPosition === "right");
  const { sidePanelOpen } = usePanelVisibility();

  const paneAnchorRef = useRef<HTMLSpanElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const headerMenuCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [paneElement, setPaneElement] = useState<HTMLElement | null>(null);
  const [paneWidth, setPaneWidth] = useState<number | null>(null);
  const [paneHeight, setPaneHeight] = useState<number | null>(null);
  const [railHeight, setRailHeight] = useState<number | null>(null);
  const [headerMenuPhase, setHeaderMenuPhase] = useState<HeaderMenuPhase>("ready");
  const [headerMenuPointerOpen, setHeaderMenuPointerOpen] = useState(false);
  const [headerMenuFocusOpen, setHeaderMenuFocusOpen] = useState(false);
  const alwaysOpen =
    paneCount === 1 && paneWidth !== null && paneWidth >= ALWAYS_OPEN_MIN_PANE_WIDTH;
  const sideRailVisible = alwaysOpen && paneElement !== null && !sidePanelOpen;
  const headerMenuOpen =
    headerMenuPhase === "ready" && (headerMenuPointerOpen || headerMenuFocusOpen);

  const cancelHeaderMenuClose = () => {
    if (headerMenuCloseTimerRef.current === null) return;
    clearTimeout(headerMenuCloseTimerRef.current);
    headerMenuCloseTimerRef.current = null;
  };

  useEffect(
    () => () => {
      cancelHeaderMenuClose();
    },
    [],
  );

  useLayoutEffect(() => {
    if (paneCount !== 1 || sidePanelOpen) return;
    // The pane width decides whether the rail clears the centered chat column;
    // its height and the pill height bound rail dragging.
    const pane = paneAnchorRef.current?.closest("[data-poracode-thread-pane]");
    if (!(pane instanceof HTMLElement)) return;
    setPaneElement(pane);
    const pill = pillRef.current;

    const skipIfClose = (prev: number | null, next: number) =>
      prev !== null && Math.abs(prev - next) < 0.5 ? prev : next;

    const paneRect = pane.getBoundingClientRect();
    setPaneWidth((prev) => skipIfClose(prev, paneRect.width));
    if (alwaysOpen) {
      setPaneHeight((prev) => skipIfClose(prev, paneRect.height));
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === pane) {
          const rect = entry.contentRect;
          setPaneWidth((prev) => skipIfClose(prev, rect.width));
          if (alwaysOpen) {
            setPaneHeight((prev) => skipIfClose(prev, rect.height));
          }
        } else if (entry.target === pill) {
          setRailHeight((prev) => skipIfClose(prev, entry.contentRect.height));
        }
      }
    });
    observer.observe(pane);
    if (alwaysOpen && pill) observer.observe(pill);
    return () => observer.disconnect();
  }, [alwaysOpen, paneCount, sidePanelOpen]);

  const { offset, isDragging, dragHandlers } = useThreadToolRailDrag({ paneHeight, railHeight });

  // Home-scope "projects" have no repository or file root, matching the tabs
  // the right panel itself hides for that scope.
  const isHomeScope = isHomeProjectId(projectId);
  const gitActive = gitScoped && rightPanelTab === "git";
  const terminalActive = terminalScoped && (!terminalOnRight || rightPanelTab === "terminal");

  const tools: RailTool[] = [
    ...(isHomeScope
      ? []
      : [
          {
            id: "git",
            label: t`Git`,
            icon: FileDiff,
            active: gitActive,
            activate: () => {
              if (gitActive) {
                closeAllPanels();
                return;
              }
              showGitReviewPanel(projectId, worktreePath);
            },
          },
          {
            id: "files",
            label: t`Files`,
            icon: FolderOpen,
            active: filesScoped && rightPanelTab === "files",
            activate: () => openFilesPanel(projectId, worktreePath),
          },
        ]),
    {
      id: "terminal",
      label: t`Terminal`,
      icon: TerminalSquare,
      active: terminalActive,
      activate: () => {
        if (worktreePath) {
          openWorktreeTerminal(projectId, worktreePath);
          return;
        }
        openTerminal(projectId);
      },
    },
    {
      id: "notes",
      label: t`Notes`,
      icon: NotebookPen,
      active: notesPanelOpen && rightPanelTab === "notes",
      activate: openNotesPanel,
    },
  ];

  const primaryTool = tools[0];
  if (!primaryTool) return null;

  const suppressHeaderMenu = () => {
    cancelHeaderMenuClose();
    setHeaderMenuPointerOpen(false);
    setHeaderMenuFocusOpen(false);
    setHeaderMenuPhase("suppressed");
  };

  const toolButtons = tools.map((tool) => {
    const Icon = tool.icon;
    return (
      <button
        key={tool.id}
        type="button"
        title={tool.label}
        aria-label={tool.label}
        aria-pressed={tool.active}
        className={`flex size-7 items-center justify-center rounded-full transition-colors ${
          tool.active
            ? "bg-accent/15 text-accent"
            : "text-muted hover:bg-[var(--row-hover)] hover:text-foreground"
        }`}
        onClick={() => {
          suppressHeaderMenu();
          tool.activate();
        }}
      >
        <Icon className="size-3.5" />
      </button>
    );
  });

  return (
    <>
      {sideRailVisible && paneElement
        ? createPortal(
            <div className="poracode-overlay-header__controls pointer-events-none absolute inset-y-0 right-0 z-20 flex items-start">
              {/* Positioned with a transform, not layout: the pill carries a
                `backdrop-blur` layer, and re-laying it out every drag frame
                makes the compositor flash a stale copy of that backdrop. */}
              <div
                className="pointer-events-auto flex items-start py-3 pl-1.5 pr-1.5"
                style={{ transform: `translateY(${offset}px)` }}
              >
                <div
                  ref={pillRef}
                  data-poracode-thread-tool-rail=""
                  data-placement="side"
                  className={`${floatingGlassSurfaceClass} ${railPillClass} ${
                    isDragging ? "cursor-grabbing" : "cursor-default"
                  } touch-none select-none`}
                  {...dragHandlers}
                >
                  {toolButtons}
                </div>
              </div>
            </div>,
            paneElement,
          )
        : null}
      {sideRailVisible ? null : (
        <div
          data-poracode-thread-tool-rail=""
          data-placement="header"
          className="poracode-overlay-header__controls relative shrink-0"
          onPointerLeave={() => {
            if (headerMenuPhase === "suppressed") {
              setHeaderMenuPhase("awaiting-reentry");
              return;
            }
            cancelHeaderMenuClose();
            headerMenuCloseTimerRef.current = setTimeout(() => {
              headerMenuCloseTimerRef.current = null;
              setHeaderMenuPointerOpen(false);
            }, HEADER_MENU_CLOSE_DELAY_MS);
          }}
          onPointerEnter={() => {
            cancelHeaderMenuClose();
            if (headerMenuPhase === "suppressed") return;
            setHeaderMenuPointerOpen(true);
            if (headerMenuPhase === "awaiting-reentry") setHeaderMenuPhase("ready");
          }}
          onFocusCapture={() => {
            cancelHeaderMenuClose();
            setHeaderMenuPhase("ready");
            setHeaderMenuFocusOpen(true);
          }}
          onBlurCapture={(event) => {
            if (
              event.relatedTarget instanceof Node &&
              event.currentTarget.contains(event.relatedTarget)
            ) {
              return;
            }
            setHeaderMenuFocusOpen(false);
          }}
        >
          <button
            type="button"
            title={t`Show thread tools`}
            aria-label={t`Show thread tools`}
            className="flex size-6 items-center justify-center rounded text-muted/60 transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
            onClick={() => {
              suppressHeaderMenu();
              primaryTool.activate();
            }}
          >
            <PanelRightOpen className="size-3.5" />
          </button>
          <div
            data-poracode-thread-tool-menu=""
            className={`absolute left-1/2 top-full z-30 w-9 -translate-x-1/2 transition-opacity duration-150 ${
              headerMenuOpen
                ? "pointer-events-auto visible opacity-100"
                : "pointer-events-none invisible opacity-0"
            }`}
          >
            <div className="pt-1">
              <div className={`${floatingGlassSurfaceClass} ${railPillClass}`}>{toolButtons}</div>
            </div>
          </div>
        </div>
      )}
      <span
        ref={paneAnchorRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 size-0"
      />
    </>
  );
}
