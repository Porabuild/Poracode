import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Dropdown, Label } from "@heroui/react";
import type { LucideIcon } from "lucide-react";
import {
  FileDiff,
  FolderOpen,
  Info,
  NotebookPen,
  PanelRightOpen,
  Smartphone,
  TerminalSquare,
} from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { isHomeProjectId } from "@/shared/homeScope";
import {
  closeAllPanels,
  dismissRightOverlay,
  openFilesPanel,
  openNotesPanel,
  showGitReviewPanel,
} from "@/renderer/actions/panelActions";
import { openTerminal, openWorktreeTerminal } from "@/renderer/actions/terminalActions";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { usePanelVisibility } from "@/renderer/views/MainView/parts/AppShell/parts/usePanelVisibility";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { useThreadToolRailDrag } from "./useThreadToolRailDrag";

/** Floating side rail: translucent blurred surface, soft hairline edge, rounded. */
const railClass =
  "flex flex-col items-center gap-0.5 rounded-2xl border border-[var(--hairline)] bg-[color-mix(in_oklab,var(--overlay)_60%,transparent)] p-1 shadow-xl backdrop-blur-md";
const toolActiveClass = "bg-[var(--row-active)] text-foreground";
const toolIdleClass = "text-muted hover:bg-[var(--row-hover)] hover:text-foreground";

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

function RailToolButton(props: { tool: RailTool; id: string | undefined }) {
  const { tool, id } = props;
  const Icon = tool.icon;
  return (
    <button
      type="button"
      id={id}
      title={tool.label}
      aria-label={tool.label}
      aria-pressed={tool.active}
      className={`flex size-7 items-center justify-center rounded-xl transition-colors ${
        tool.active ? toolActiveClass : toolIdleClass
      }`}
      onClick={() => tool.activate()}
    >
      <Icon className="size-3.5" />
    </button>
  );
}

/**
 * Header launcher: a standard dropdown of the tools. While one of this thread's
 * tools holds the right panel (`hidesPanel`) the same icon is a hide toggle
 * instead, so it never opens the menu then. The open state is local on purpose:
 * it resets when the side rail takes over and this component unmounts.
 */
function HeaderToolMenu(props: {
  threadId: string;
  tools: RailTool[];
  hidesPanel: boolean;
  onHidePanel: () => void;
}) {
  const { t } = useLingui();
  const { threadId, tools, hidesPanel, onHidePanel } = props;
  const [open, setOpen] = useState(false);
  // A tool taking the panel while the menu is open must not leave `open` set, or
  // the menu would resurface when the panel is released.
  if (hidesPanel && open) setOpen(false);
  return (
    <Dropdown isOpen={open && !hidesPanel} onOpenChange={(next) => setOpen(next && !hidesPanel)}>
      <Button
        isIconOnly
        id={`thread-tools-${threadId}`}
        aria-label={t`Show thread tools`}
        {...(hidesPanel ? { "aria-expanded": true } : {})}
        size="sm"
        variant="ghost"
        className="size-6 min-w-0 text-muted/60 hover:text-foreground"
        onPress={() => {
          if (hidesPanel) onHidePanel();
        }}
      >
        <PanelRightOpen className="size-3.5" />
      </Button>
      <Dropdown.Popover placement="bottom end" className="min-w-36">
        <Dropdown.Menu
          aria-label={t`Show thread tools`}
          onAction={(key) => tools.find((tool) => tool.id === key)?.activate()}
        >
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <Dropdown.Item key={tool.id} id={tool.id} textValue={tool.label}>
                <Icon className="size-4 shrink-0 text-muted" />
                <Label>
                  {tool.label}
                  {tool.active ? (
                    <>
                      {" "}
                      <span className="sr-only">{t`Active`}</span>
                    </>
                  ) : null}
                </Label>
                {tool.active ? (
                  <span
                    aria-hidden="true"
                    data-tool-active=""
                    className="ml-auto size-1.5 shrink-0 rounded-full bg-accent"
                  />
                ) : null}
              </Dropdown.Item>
            );
          })}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

/**
 * Per-pane launcher for the thread-scoped right-panel tools (git, files,
 * terminal, notes, devices) pointed at *this* thread's project + worktree. Panel-wide
 * tools that are not tied to a thread (usage, browser) stay in the right panel
 * header only.
 *
 * - The header launcher is omitted while the side rail is rendered, leaving no
 *   duplicate icon or empty header space.
 * - Single pane wide enough that the rail lands beside the centered chat column
 *   instead of over it: permanently open and visible.
 * - Anything narrower (or split panes): a header icon that opens a standard
 *   dropdown of the tools. While one of this thread's tools holds the right
 *   panel, the icon hides the panel instead of opening the menu.
 */
export function ThreadToolRail(props: {
  threadId: string;
  projectId: string;
  worktreePath?: string | undefined;
  paneCount: number;
}) {
  const { t } = useLingui();
  const { threadId, projectId, worktreePath, paneCount } = props;
  const compactLayout = useCompactLayout();

  const rightPanelTab = usePanelStore((s) => s.rightPanelTab);
  const deviceWorkspaceThreadId = usePanelStore((s) => s.deviceWorkspaceThreadId);
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
  const threadInfoOpen = usePanelStore((s) => s.threadDocksPanelOpen);
  const terminalScoped = useDevTerminalStore(
    (s) =>
      s.isOpen &&
      s.activeProjectId === projectId &&
      (s.activeWorktreePath ?? undefined) === worktreePath,
  );
  const terminalOnRight = useSharedSettings((s) => s.terminalPosition === "right");
  const { sidePanelOpen } = usePanelVisibility();

  const paneAnchorRef = useRef<HTMLSpanElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const [paneElement, setPaneElement] = useState<HTMLElement | null>(null);
  const [paneWidth, setPaneWidth] = useState<number | null>(null);
  const [paneHeight, setPaneHeight] = useState<number | null>(null);
  const [railHeight, setRailHeight] = useState<number | null>(null);
  const alwaysOpen =
    paneCount === 1 && paneWidth !== null && paneWidth >= ALWAYS_OPEN_MIN_PANE_WIDTH;
  const sideRailVisible = alwaysOpen && paneElement !== null && !sidePanelOpen;

  useLayoutEffect(() => {
    if (paneCount !== 1 || sidePanelOpen) return;
    // The pane width decides whether the rail clears the centered chat column;
    // its height and the rail height bound rail dragging.
    const pane = paneAnchorRef.current?.closest("[data-poracode-thread-pane]");
    if (!(pane instanceof HTMLElement)) return;
    setPaneElement(pane);
    const rail = railRef.current;

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
        } else if (entry.target === rail) {
          setRailHeight((prev) => skipIfClose(prev, entry.contentRect.height));
        }
      }
    });
    observer.observe(pane);
    if (alwaysOpen && rail) observer.observe(rail);
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
    {
      id: "devices",
      label: t`Devices`,
      icon: Smartphone,
      active: deviceWorkspaceThreadId === threadId && rightPanelTab === "devices",
      activate: () => usePanelStore.getState().setDeviceWorkspaceThreadId(threadId),
    },
    {
      id: "thread-info",
      label: t`Thread info`,
      icon: Info,
      active: sidePanelOpen && threadInfoOpen && rightPanelTab === "docks",
      activate: () => {
        if (sidePanelOpen && threadInfoOpen && rightPanelTab === "docks") {
          closeAllPanels();
          return;
        }
        usePanelStore.setState({
          threadDocksPanelOpen: true,
          rightPanelTab: "docks",
          threadDocksFocus: null,
          threadDocksReturnThreadId: null,
        });
      },
    },
  ];

  // The header icon hides the right panel while a tool holds it. Notes and Thread
  // info are panel-wide, so any pane's launcher hides them. A bottom-docked
  // terminal does not use the right panel, so it never counts. Compact layout
  // keeps tap-to-open: its panels are full-screen pages, not a side panel.
  const hidesPanel =
    !compactLayout &&
    sidePanelOpen &&
    tools.some((tool) => tool.active && (tool.id !== "terminal" || terminalOnRight));
  // A right-docked terminal keeps the panel open on its own; a bottom one is not
  // part of the right panel and must survive.
  const hideRightPanel = () => (terminalOnRight ? dismissRightOverlay() : closeAllPanels());
  const railButtons = tools.map((tool) => (
    <RailToolButton
      key={tool.id}
      tool={tool}
      id={tool.id === "devices" ? `thread-tool-devices-${threadId}` : undefined}
    />
  ));

  return (
    <>
      {sideRailVisible && paneElement
        ? createPortal(
            <div className="poracode-overlay-header__controls pointer-events-none absolute inset-y-0 right-0 z-20 flex items-start">
              {/* Positioned with a transform, not layout: the rail carries a
                `backdrop-blur` layer, and re-laying it out every drag frame
                makes the compositor flash a stale copy of that backdrop. */}
              <div
                className="pointer-events-auto flex items-start py-3 pl-1.5 pr-1.5"
                style={{ transform: `translateY(${offset}px)` }}
              >
                <div
                  ref={railRef}
                  data-poracode-thread-tool-rail=""
                  data-placement="side"
                  className={`${railClass} ${
                    isDragging ? "cursor-grabbing" : "cursor-default"
                  } touch-none select-none`}
                  {...dragHandlers}
                >
                  {railButtons}
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
        >
          <HeaderToolMenu
            threadId={threadId}
            tools={tools}
            hidesPanel={hidesPanel}
            onHidePanel={hideRightPanel}
          />
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
