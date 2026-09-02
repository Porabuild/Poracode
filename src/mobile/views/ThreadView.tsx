import { useEffect, useRef, useState, type CSSProperties } from "react";
import { toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { MessageCircle } from "lucide-react";
import {
  DEFAULT_TERMINAL_SIZE,
  type PromptSegment,
  type TerminalSize,
  type Thread,
} from "@/shared/contracts";
import { stripAnsiPreservingLayout } from "@/shared/ansi";
import { resolveProjectLocation } from "@/shared/worktree";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import type { XTermSurfaceHandle } from "@/renderer/components/terminal/XTermSurface";
import { SubAgentOpenController } from "@/renderer/components/thread/ChatPane/parts/items/SubAgentOverlay";
import { GuiThreadContent } from "@/renderer/components/thread/ThreadContent";
import { ThreadComposerSection } from "@/renderer/components/thread/ThreadComposerSection";
import {
  hasReportedContextUsage,
  resolveThreadContextUsageSummary,
} from "@/renderer/components/thread/threadContextUsage";
import { useThreadDockState } from "@/renderer/components/thread/useThreadDockState";
import type { TerminalPaneHandle } from "@/renderer/components/thread/TerminalPane";
import { useProjectAgentStatuses } from "@/renderer/hooks/uiSelectors";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useProject } from "@/renderer/state/useThread";
import { MobileTerminal } from "../MobileTerminal";
import { ComposerCompactSummary } from "../ComposerCompactSummary";
import { ComposerInfoChips } from "../ComposerInfoChips";
import { ComposerActionDocks } from "../ComposerActionDocks";
import { FloatingComposerDock } from "../FloatingComposerDock";
import { EmptyState } from "../components";
import { WorkspaceChip } from "../GitSummaryParts";
import { TerminalAccessory } from "../TerminalAccessory";
import { ThreadTitleRow } from "../ThreadTitleRow";
import { ThreadUsageIndicator } from "../ThreadUsageIndicator";
import { useGitSummaryHydration } from "../useGitSummaryHydration";
import { useKeyboardOffset } from "../useKeyboardOffset";
import { DESKTOP_POINTER_QUERY, useMediaQuery } from "../useMediaQuery";
import type { ThreadAction } from "../useRemoteDesktop";
import type { WorkspaceTab } from "./WorkspaceView";

const PWA_INITIAL_SCROLL_REVEAL_DELAY_MS = 50;

export interface ThreadViewProps {
  readonly thread: Thread | null;
  /** Terminal scrollback text from the latest remote thread snapshot. */
  readonly terminalScrollback: string | undefined;
  /** Canonical PTY size from the desktop supervisor, if the thread is live. */
  readonly terminalSize?: TerminalSize | undefined;
  /** Hide the inline title row (the narrow layout shows it in the top bar). */
  readonly hideHeader?: boolean;
  /** History for this thread is still being fetched; show a top progress bar. */
  readonly loading?: boolean;
  readonly onThreadAction: (action: ThreadAction) => void;
  readonly onSubmitInput: (prompt: string, segments?: PromptSegment[]) => Promise<void>;
  /** Open a referenced thread through the mobile route and remote session. */
  readonly onOpenThread?: ((threadId: string) => void) | undefined;
  readonly onOpenSubAgent?: ((parentItemId: string) => void) | undefined;
  /** Open the unified workspace panel (Changes/Files) for this thread. */
  readonly onOpenWorkspace?: (tab: WorkspaceTab) => void;
  /** Open a project/worktree file from a shared chat file chip. */
  readonly onOpenWorkspaceFile?: ((path: string, lineNumber?: number) => void) | undefined;
  /** Reveal a project/worktree folder from a shared chat folder chip. */
  readonly onOpenWorkspaceFolder?: ((path: string) => void) | undefined;
  /** Open a terminal scoped to this thread's project/worktree. */
  readonly onOpenTerminal?: () => void;
  /** Open project notes and to-dos for this thread. */
  readonly onOpenNotes?: () => void;
  /** Opens the new-thread composer pre-targeted at this thread's worktree. */
  readonly onNewThreadInWorktree?:
    | ((input: {
        readonly projectId: string;
        readonly worktreePath: string;
        readonly worktreeBranch: string;
      }) => void)
    | undefined;
  /** Removes this thread's worktree through the paired desktop cleanup path. */
  readonly onDeleteWorktreeGroup?:
    | ((input: {
        readonly projectId: string;
        readonly worktreePath: string;
        readonly threadIds: readonly string[];
      }) => void)
    | undefined;
  /** Moves a main-checkout thread into a fresh worktree on the paired desktop. */
  readonly onMoveThreadToWorktree?: ((thread: Thread, withChanges: boolean) => void) | undefined;
}

/** Read-only scrollback shown while the live terminal snapshot is loading. */
function TerminalScrollbackPane(props: { readonly scrollback: string }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [props.scrollback]);
  return (
    <div ref={scrollRef} className="m-terminal-scroll">
      <pre className="m-terminal">{stripAnsiPreservingLayout(props.scrollback).trimEnd()}</pre>
    </div>
  );
}

export function ThreadView(props: ThreadViewProps) {
  const { t } = useLingui();
  const thread = props.thread;
  const project = useProject(thread?.projectId);
  useGitSummaryHydration(thread, project);
  const projectAgentStatuses = useProjectAgentStatuses(project?.location);
  const terminalPaneRef = useRef<TerminalPaneHandle | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const terminalSurfaceRef = useRef<XTermSurfaceHandle | null>(null);
  const [terminalReloadKey, setTerminalReloadKey] = useState(0);
  const [terminalSize, setTerminalSize] = useState<TerminalSize | null>(null);
  const [composerInputFocused, setComposerInputFocused] = useState(false);
  const [guiScrollSettledThreadId, setGuiScrollSettledThreadId] = useState<string | null>(null);
  // The thread composer dock is controlled so a successful send collapses it
  // (drops the keyboard + scrim), while a dismissed keyboard leaves it expanded
  // like the home composer. Uncontrolled would collapse on either.
  const [composerExpanded, setComposerExpanded] = useState(false);
  const agentTerminalFontSize = useSharedSettings((state) => state.agentTerminalFontSize);
  const dockState = useThreadDockState(thread?.id ?? "");
  const reportedContextUsage = useAppStore((state) =>
    thread ? state.runtimeContextByThread[thread.id] : undefined,
  );
  // A blocking approval/question owns the surface while it is open: touch
  // layouts keep the composer collapsed under its card instead of letting a
  // stray tap open the bubble over it (see FloatingComposerDock.expansionLocked).
  const requestOpen = useAppStore((state) =>
    thread ? (state.runtimeRequestsByThread[thread.id]?.length ?? 0) > 0 : false,
  );
  // Raw keyboard band for the PTY/accessory inputs. The composer itself is
  // hosted by FloatingComposerDock, which uses the same focus-gated lift as the
  // home composer.
  const keyboardOffset = useKeyboardOffset();
  const submitOnEnter = useMediaQuery(DESKTOP_POINTER_QUERY);

  useEffect(() => {
    terminalPaneRef.current = {
      focus() {
        terminalSurfaceRef.current?.focus();
      },
    };
    return () => {
      terminalPaneRef.current = null;
    };
  }, []);

  // Cancel a pending terminal-reload restart if this reused view switches to
  // another thread — or unmounts — during the 250ms close→start gap (see
  // reloadTerminal). latestThreadIdRef tracks the currently-shown thread so the
  // delayed startThread can bail when it no longer matches.
  const reloadTimerRef = useRef(0);
  const latestThreadIdRef = useRef<string | undefined>(thread?.id);
  latestThreadIdRef.current = thread?.id;
  useEffect(() => () => window.clearTimeout(reloadTimerRef.current), []);

  // ThreadView is reused across thread switches. Touch layouts start each
  // thread compact, while desktop PWA layouts open the focused composer at its
  // full size. Resetting every thread to compact here used to race the shared
  // composer's desktop autofocus and collapse the dock immediately afterward.
  useEffect(() => {
    setComposerExpanded(submitOnEnter);
    setGuiScrollSettledThreadId(null);
    if (thread?.id && submitOnEnter) {
      // The shared composer stays mounted while the wide PWA switches thread
      // IDs, so its mount-only autofocus does not run again. Route the switch
      // through the existing focus request consumed by ThreadComposerSection.
      useAppStore.getState().requestComposerFocus(thread.id);
    }
  }, [thread?.id, submitOnEnter]);

  if (!thread) {
    return (
      <section className="m-thread">
        <EmptyState
          icon={<MessageCircle className="size-5" />}
          title={<Trans>No thread selected</Trans>}
          hint={<Trans>Pick a thread from the list to follow the agent from here.</Trans>}
        />
      </section>
    );
  }

  const agentStatus = projectAgentStatuses.find((status) => status.kind === thread.agentKind);
  const contextSummary = resolveThreadContextUsageSummary({
    thread,
    agentStatus,
    reportedUsage: reportedContextUsage,
  });
  const externalContextSummary =
    hasReportedContextUsage(reportedContextUsage) && contextSummary.maxTokens !== undefined
      ? contextSummary
      : null;
  const projectLocation = project
    ? resolveProjectLocation(project.location, thread.worktreePath)
    : undefined;
  const isTerminal = (thread.presentationMode ?? "terminal") === "terminal";

  if (!projectLocation) return null;
  // Captured into stable locals so the narrowed (non-null) types survive into
  // the reloadTerminal closure below.
  const liveThread = thread;
  const liveProjectLocation = projectLocation;

  function reloadTerminal(): void {
    setTerminalReloadKey((key) => key + 1);
    if (!isTerminal) return;

    const bridge = readBridge();
    void bridge
      .closeThread({ threadId: liveThread.id })
      .catch(() => undefined)
      .finally(() => {
        window.clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = window.setTimeout(() => {
          // The view may have been reused for a different thread (or unmounted)
          // during the gap — don't reopen a PTY the user has navigated away from.
          if (latestThreadIdRef.current !== liveThread.id) return;
          void bridge
            .startThread({
              threadId: liveThread.id,
              projectLocation: liveProjectLocation,
              agentKind: liveThread.agentKind,
              ...(liveThread.agentInstanceId
                ? { agentInstanceId: liveThread.agentInstanceId }
                : {}),
              config: liveThread.config,
              prompt: "",
              initialSize: props.terminalSize ?? terminalSize ?? DEFAULT_TERMINAL_SIZE,
              ...(liveThread.sessionRef ? { sessionRef: liveThread.sessionRef } : {}),
              presentationMode: "terminal",
            })
            .catch((error: unknown) => {
              toast.danger(friendlyError(error));
            });
        }, 250);
      });
  }

  // Collapse the floating dock (and drop the keyboard) after a message actually
  // sends. Wrapping onSubmitInput keeps this behavior mobile-local — the shared
  // renderer composer stays unaware of the dock. Only the resolved (successful)
  // path collapses; a rejected send leaves the composer expanded for retry.
  // Sending from the compact summary line is already collapsed, so this is a
  // harmless no-op there.
  const handleSubmitInput = (prompt: string, segments?: PromptSegment[]) =>
    props.onSubmitInput(prompt, segments).then(() => {
      setComposerExpanded(false);
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.closest(".m-thread-compose-dock")) {
        active.blur();
      }
    });

  const commonProps = {
    threadId: thread.id,
    fallbackThread: thread,
    agentStatus,
    projectLocation,
    paneCount: 1,
    terminalPaneRef,
    onSubmitInput: handleSubmitInput,
    ...(props.onOpenThread ? { onOpenThread: props.onOpenThread } : {}),
    ...(props.onOpenWorkspaceFile ? { onOpenProjectRelativePath: props.onOpenWorkspaceFile } : {}),
    ...(props.onOpenWorkspaceFolder
      ? { onRevealProjectFolderInTree: props.onOpenWorkspaceFolder }
      : {}),
    canShowProjectEntryInExplorer: false,
    ...(props.onOpenSubAgent
      ? { onOpenSubAgent: (parentItemId: string) => props.onOpenSubAgent?.(parentItemId) }
      : {}),
  };
  const showComposerDock = thread.status !== "launching" || !isTerminal;
  const terminalPageKeyboardOffset = isTerminal && composerInputFocused ? 0 : keyboardOffset;
  // Desktop-pointer layouts keep their always-open composer; touch layouts pin
  // it collapsed under the request card.
  const expansionLocked = requestOpen && !submitOnEnter;
  // The chips duck for an actually-open composer only — a locked dock renders
  // collapsed even while this view still holds `composerExpanded` from before
  // the request arrived.
  const composerOpen = composerExpanded && !expansionLocked;
  const composerDock = showComposerDock ? (
    <FloatingComposerDock
      dockClassName="m-thread-compose-dock"
      keyboardKey={thread.id}
      scrimLabel={t`Close composer`}
      expanded={composerExpanded}
      nonBlockingOutsidePress={submitOnEnter}
      onExpandedChange={setComposerExpanded}
      onComposerFocusChange={setComposerInputFocused}
      expansionLocked={expansionLocked}
      aboveBubble={
        // Order is the stack, bottom-up: the composer, the info chips riding
        // directly on it, then a blocking approval/question above everything.
        <>
          <ComposerActionDocks
            thread={thread}
            agentStatus={agentStatus}
            project={project}
            dockState={dockState}
            {...(props.onOpenWorkspaceFile
              ? { onOpenPlanFile: (path: string) => props.onOpenWorkspaceFile?.(path) }
              : {})}
          />
          <ComposerInfoChips
            threadId={thread.id}
            projectLocation={projectLocation}
            dockState={dockState}
            contextSummary={externalContextSummary}
            hidden={composerOpen}
          />
        </>
      }
      onDockHeightChange={(height) => {
        // The scroll-to-bottom pin (and other floating chrome) reads this to
        // stay clear of the composer as the dock grows and shrinks.
        sectionRef.current?.style.setProperty("--m-thread-bubble-height", `${height}px`);
      }}
    >
      <ThreadComposerSection
        {...commonProps}
        autoFocusComposer={submitOnEnter}
        composerPlaceholder={t`Follow up...`}
        submitOnEnter={submitOnEnter}
        hideInfoDocks
        hideActionDocks
        todoDockCollapsed={dockState.todoDockCollapsed}
        docksPlacement={dockState.docksPlacement}
        todoDockState={dockState.todoDockState}
        goalDockState={dockState.goalDockState}
        errorDockStates={dockState.errorDockStates}
        onGoalDockDismiss={dockState.onGoalDockDismiss}
        onDismissError={dockState.onDismissError}
        onTodoDockCollapsedChange={dockState.onTodoDockCollapsedChange}
        onTodoDockRetire={dockState.onTodoDockRetire}
      />
      <ComposerCompactSummary thread={thread} agentStatus={agentStatus} />
    </FloatingComposerDock>
  ) : null;

  return (
    <section
      ref={sectionRef}
      className={isTerminal ? "m-thread m-thread--terminal" : "m-thread"}
      style={
        {
          "--m-keyboard-offset": `${terminalPageKeyboardOffset}px`,
          // The dock shadows --m-keyboard-offset with its own composer-focus
          // lift, so request forms above the bubble (which never focus the
          // composer) need the raw band under a name the dock does not own.
          "--m-thread-keyboard-band": `${keyboardOffset}px`,
        } as CSSProperties
      }
    >
      {props.loading ? (
        <span className="m-loading-bar" role="progressbar" aria-label={t`Loading thread`} />
      ) : null}
      {props.hideHeader ? null : (
        <header className="mx-auto flex w-full max-w-[920px] items-center gap-2 px-3 py-1">
          <ThreadTitleRow
            thread={thread}
            onAction={props.onThreadAction}
            onNewThreadInWorktree={props.onNewThreadInWorktree}
            onDeleteWorktreeGroup={props.onDeleteWorktreeGroup}
            onMoveThreadToWorktree={props.onMoveThreadToWorktree}
            onOpenNotes={props.onOpenNotes}
            onOpenTerminal={props.onOpenTerminal}
          />
          <ThreadUsageIndicator thread={thread} />
        </header>
      )}
      {/* The terminal entry lives in the title row's actions menu. */}
      {props.onOpenWorkspace ? (
        <div className="m-thread-bar">
          <WorkspaceChip
            threadId={thread.id}
            projectLabel={project?.name ?? ""}
            onOpen={props.onOpenWorkspace}
          />
        </div>
      ) : null}
      {/* Same shell classes as the desktop ThreadView pane. */}
      <div
        className={`m-thread-content relative mx-auto flex min-h-0 w-full max-w-[1040px] flex-1 flex-col px-3 pb-2 ${
          !isTerminal && guiScrollSettledThreadId !== thread.id ? "invisible" : ""
        }`}
      >
        <div className="mx-auto flex min-h-0 w-full max-w-[920px] flex-1 flex-col pt-2">
          {isTerminal ? (
            <>
              {/* Live, interactive terminal once the snapshot (its scrollback)
                  is in hand; a read-only pane covers the brief load. */}
              {props.loading ? (
                <TerminalScrollbackPane scrollback={props.terminalScrollback ?? ""} />
              ) : (
                <div className="m-terminal-stack">
                  <div className="m-terminal-live m-terminal-live--shared">
                    <MobileTerminal
                      ref={terminalSurfaceRef}
                      key={`${thread.id}:${terminalReloadKey}:${props.terminalSize?.cols ?? "auto"}x${props.terminalSize?.rows ?? "auto"}`}
                      terminalId={thread.id}
                      initialScrollback={props.terminalScrollback ?? ""}
                      baseFontSize={agentTerminalFontSize}
                      resizeTerminalOnFit={false}
                      onTerminalResize={setTerminalSize}
                      {...(props.terminalSize ? { fixedTerminalSize: props.terminalSize } : {})}
                    />
                  </div>
                  <TerminalAccessory terminalId={thread.id} onReload={reloadTerminal} />
                </div>
              )}
              {props.onOpenSubAgent ? (
                <SubAgentOpenController
                  threadId={thread.id}
                  projectLocation={projectLocation}
                  onOpen={(parentItemId) => props.onOpenSubAgent?.(parentItemId)}
                />
              ) : null}
            </>
          ) : props.loading ? null : (
            // PWA history arrives after the routed thread shell mounts. Wait
            // for that snapshot before mounting the shared virtualized chat so
            // its one-time initial tail settle measures the real transcript.
            // Desktop already has history at mount and never takes this path.
            <GuiThreadContent
              {...commonProps}
              dockState={dockState}
              runtimeDebugOpen={false}
              hideComposer
              initialScrollRevealDelayMs={PWA_INITIAL_SCROLL_REVEAL_DELAY_MS}
              onInitialScrollSettled={() => setGuiScrollSettledThreadId(thread.id)}
            />
          )}
        </div>
      </div>
      {composerDock}
    </section>
  );
}
