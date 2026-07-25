import { useLayoutEffect, useRef, useState } from "react";
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
import { floatingChromeSurfaceClass } from "@/renderer/components/layout/sidebarChrome";
import { useThreadToolRailDrag } from "./useThreadToolRailDrag";

/**
 * Closed handle and open rail share both the surface (with the changes bubble
 * and scroll-to-bottom) and the pill geometry, so opening shifts nothing.
 */
const railPillClass = "flex flex-col items-center gap-0.5 rounded-full p-1";

/**
 * Pane width from which an always-open rail clears the chat column instead of
 * covering it: the column is centered and capped at 920px (inside a 1040px
 * shell with 12px side padding), and the rail needs 36px plus an 8px gap on
 * each side — 920 + 2 × 44.
 */
const ALWAYS_OPEN_MIN_PANE_WIDTH = 1008;

interface RailTool {
  id: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  activate: () => void;
}

/**
 * Per-pane launcher for the thread-scoped right-panel tools (git, files,
 * terminal, notes) pointed at *this* thread's project + worktree. Panel-wide
 * tools that are not tied to a thread (usage, browser) stay in the right panel
 * header only.
 *
 * Interaction mirrors the mobile PWA:
 * - Hidden entirely while the right panel is docked — the panel already exposes
 *   every tool in its header, and the rail would sit right against it.
 * - Single pane wide enough that the rail lands beside the centered chat column
 *   instead of over it: permanently open and visible.
 * - Anything narrower (or split panes): only a handle, revealed on pane
 *   hover/focus, expanding into the rail on hover/focus of the rail itself. The
 *   hover target is deliberately larger than the handle so approaching the edge
 *   counts as intent to open, but stays short vertically so it does not swallow
 *   text selection or scrollbar drags down the whole right edge.
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
  const { rightPanelOpen, gitPanelOpen } = usePanelVisibility();
  // Only the right-edge aside counts: with the terminal docked at the bottom,
  // `rightPanelOpen` tracks that bottom dock and must not hide the rail.
  const sidePanelOpen = gitPanelOpen || (terminalOnRight && rightPanelOpen);

  const railRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const [paneWidth, setPaneWidth] = useState<number | null>(null);
  const [paneHeight, setPaneHeight] = useState<number | null>(null);
  const [railHeight, setRailHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (sidePanelOpen) return;
    // The rail is absolutely positioned inside the thread pane, so its
    // offsetParent *is* that pane. Its width decides whether an always-open rail
    // lands beside the centered chat column or on top of it; its height, plus
    // the pill's own, bounds how far the rail can be dragged.
    const pane = railRef.current?.offsetParent;
    if (!(pane instanceof HTMLElement)) return;
    // `invisible` keeps layout, so the closed rail still reports its real height.
    const pill = pillRef.current;

    const skipIfClose = (prev: number | null, next: number) =>
      prev !== null && Math.abs(prev - next) < 0.5 ? prev : next;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === pane) {
          const rect = entry.contentRect;
          setPaneWidth((prev) => skipIfClose(prev, rect.width));
          setPaneHeight((prev) => skipIfClose(prev, rect.height));
        } else if (entry.target === pill) {
          setRailHeight((prev) => skipIfClose(prev, entry.contentRect.height));
        }
      }
    });
    observer.observe(pane);
    if (pill) observer.observe(pill);
    return () => observer.disconnect();
  }, [sidePanelOpen]);

  const { offset, isDragging, dragHandlers } = useThreadToolRailDrag({ paneHeight, railHeight });

  const alwaysOpen =
    paneCount === 1 && paneWidth !== null && paneWidth >= ALWAYS_OPEN_MIN_PANE_WIDTH;
  // A drag can travel outside the hover box, which would otherwise drop the
  // CSS-driven open state mid-gesture.
  const forceOpen = alwaysOpen || isDragging;

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
  // The docked panel already exposes every tool in its header. Re-measuring is
  // handled by the layout effect above, which re-attaches once this clears.
  if (sidePanelOpen) return null;

  // Top-anchored with a draggable offset rather than vertically centered, so the
  // rail sits over the conversation body wherever the user parked it.
  return (
    <div
      ref={railRef}
      className="pointer-events-none absolute inset-y-0 right-0 z-20 flex items-start"
    >
      {/* When the rail has to overlap the chat column, padding — not size —
          makes the open/intent area larger than the handle, while staying short
          enough that it does not swallow scrollbar drags down the right edge.
          Positioned with a transform, not layout: the pill carries a
          `backdrop-blur` layer, and re-laying it out every drag frame makes the
          compositor flash a stale copy of that backdrop. */}
      <div
        className={`group/rail pointer-events-auto flex items-start py-3 pr-1.5 ${
          alwaysOpen ? "pl-1.5" : "pl-10"
        }`}
        style={{ transform: `translateY(${offset}px)` }}
      >
        <div className="relative flex items-start">
          {/* Same pill geometry as the open rail, so opening shifts nothing.
              Fades in with the pane, then out as the rail opens over it — the
              open surface is translucent, so leaving it underneath would show
              its glyph through. */}
          {forceOpen ? null : (
            <div className="opacity-0 transition-opacity duration-150 group-hover/pane:opacity-80">
              <div className="transition-opacity duration-150 group-hover/rail:opacity-0 group-focus-within/rail:opacity-0">
                <div className={`${floatingChromeSurfaceClass} ${railPillClass}`}>
                  <button
                    type="button"
                    title={t`Show thread tools`}
                    aria-label={t`Show thread tools`}
                    className="flex size-7 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground"
                    onClick={primaryTool.activate}
                  >
                    <PanelRightOpen className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* `invisible` (not just opacity) keeps the closed rail out of the tab
              order; focus-within on the handle reveals it before Tab moves in.
              It grows downward from the handle instead of expanding around it,
              which would push the rail up over the pane header. */}
          <div
            ref={pillRef}
            data-poracode-thread-tool-rail=""
            className={`${floatingChromeSurfaceClass} ${railPillClass} cursor-grab touch-none select-none transition-opacity duration-150 active:cursor-grabbing ${
              alwaysOpen ? "" : "absolute right-0 top-0"
            } ${
              forceOpen
                ? ""
                : "invisible opacity-0 group-hover/rail:visible group-hover/rail:opacity-100 group-focus-within/rail:visible group-focus-within/rail:opacity-100"
            }`}
            {...dragHandlers}
          >
            {tools.map((tool) => {
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
                  onClick={tool.activate}
                >
                  <Icon className="size-3.5" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
