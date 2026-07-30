import { useEffect, useMemo, useRef, useState } from "react";
import { Surface } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useShallow } from "zustand/react/shallow";
import { isThreadTurnActive, type ProjectLocation, type Thread } from "@/shared/contracts";
import { resolveGrokSessionDir } from "@/shared/grokSessionMedia";
import { isHomeProjectId } from "@/shared/homeScope";
import { chatMessageSurfaceClass } from "./parts/items/chatMessageSurface";
import { readBridge } from "@/renderer/bridge";
import { useShimmerRef } from "@/renderer/thinkingAnimator";
import { useScrollFade } from "@/renderer/hooks/useScrollFade";
import { useThreadHasBackgroundActivity } from "@/renderer/hooks/uiSelectors";
import { useAppStore } from "@/renderer/state/appStore";
import {
  hydrateThreadRuntimeItems,
  loadOlderThreadRuntimeItems,
  releaseThreadRuntimeItems,
  retainThreadRuntimeItems,
} from "@/renderer/state/chatRuntimePersister";
import {
  finalizeFileCheckpoint,
  hydrateFileCheckpoints,
} from "@/renderer/state/fileCheckpointActions";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { useProjectRootNames } from "@/renderer/state/projectRootNamesStore";
import { useProjectTreeStore } from "@/renderer/state/projectTreeStore";
import { formatElapsed } from "@/renderer/utils/formatTime";
import {
  buildFileEditorContext,
  openFileInEditor,
  resolveWorktreeBranch,
} from "@/renderer/utils/gitHelpers";
import { showSubAgentPanel } from "@/renderer/actions/panelActions";
import { ChatFindBar, type ScrollToIndex } from "@/renderer/components/find/ChatFindBar";
import { ChatPaneActionsContext, type ChatPaneActions } from "./chatPaneActionsContext";
import { ChatScrollControls, type ChatScrollControlsHandle } from "./ChatScrollControls";
import { selectVisibleThreadTimelineEntries, type ChatTimelineEntry } from "./chatPaneSelectors";
import { shouldMarkUserScrollIntentFromPointerTarget } from "./chatScrollGeometry";
import { normalizeChatProjectPath } from "./chatPathUtils";
import { MessageList, type CheckpointRevertActions } from "./parts/MessageList";
import { SubAgentOpenController } from "./parts/items/SubAgentOverlay";

interface ChatPaneProps {
  thread: Thread;
  hiddenRuntimeItemId?: string | undefined;
  hasSupplementaryContent?: boolean;
  layoutChangeToken?: string | null;
  onOpenProjectRelativePath?: ((path: string, lineNumber?: number) => void) | undefined;
  onRevealProjectFolderInTree?: ((path: string) => void) | undefined;
  onOpenSubAgent?:
    | ((parentItemId: string, projectLocation: ProjectLocation | undefined) => void)
    | undefined;
  canShowProjectEntryInExplorer?: boolean | undefined;
  paneActionsOverride?: ChatPaneActions | undefined;
  checkpointActions?: CheckpointRevertActions | undefined;
  checkpointProjectLocation?: ProjectLocation | undefined;
  initialScrollRevealDelayMs?: number | undefined;
  onInitialScrollSettled?: (() => void) | undefined;
}

const EMPTY_COMPLETED_TURNS: NonNullable<
  ReturnType<typeof useAppStore.getState>["runtimeCompletedTurnsByThread"][string]
> = [];
const EMPTY_ITEM_IDS: readonly string[] = [];
const EMPTY_FILE_CHECKPOINT_TURNS: NonNullable<
  ReturnType<typeof useAppStore.getState>["fileCheckpointTurnsByThread"][string]
> = {};
const EMPTY_FILE_CHECKPOINTS: NonNullable<
  ReturnType<typeof useAppStore.getState>["fileCheckpointsByThread"][string]
> = {};

/**
 * Renderer-native chat surface for `presentationMode === "gui"` threads.
 *
 * Pulls canonical chat items from the Zustand `runtimeEventSlice` (populated
 * by IPC `thread-runtime-event` notifications) and renders them as a dense
 * vertical list. Pending approval / user-input requests are surfaced in the
 * composer (see `ThreadRuntimeRequestPanel`), not in the chat list.
 */
export function ChatPane(props: ChatPaneProps) {
  const {
    thread,
    hiddenRuntimeItemId,
    hasSupplementaryContent = false,
    layoutChangeToken,
    onOpenProjectRelativePath,
    onRevealProjectFolderInTree,
    onOpenSubAgent,
    canShowProjectEntryInExplorer,
    paneActionsOverride,
    checkpointActions,
    checkpointProjectLocation,
  } = props;
  const { id: threadId, projectId, status, worktreePath, worktreeBranch } = thread;
  const isRemoteThread = thread.remoteServerId !== undefined;
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollToIndexRef = useRef<ScrollToIndex | null>(null);
  const registerScrollToIndex = (handler: ScrollToIndex | null) => {
    scrollToIndexRef.current = handler;
  };
  // `scrollEl` mirrors the LegendList-owned scroll node as React state for the
  // find controller and the shared scroll controls.
  const { setScrollContainer, scrollRef, scrollEl, scrollFadeStyle } =
    useScrollFade<HTMLDivElement>({ contentRef });
  const [initialScrollSettledThreadId, setInitialScrollSettledThreadId] = useState<string | null>(
    null,
  );
  const isInitialScrollSettled = initialScrollSettledThreadId === threadId;

  const scrollControlsRef = useRef<ChatScrollControlsHandle>(null);
  const virtualScrollToBottomRef = useRef<(() => void) | null>(null);
  const timelineEntries = useAppStore(
    useShallow((s) => selectVisibleThreadTimelineEntries(s, threadId, hiddenRuntimeItemId)),
  );
  const project = useAppStore((s) => s.projects.find((p) => p.id === projectId));
  const branch = resolveWorktreeBranch(projectId, worktreePath ?? "", worktreeBranch);
  const isHomeScope = isHomeProjectId(projectId);
  const targetContext = useMemo(
    () => (project ? buildFileEditorContext(project, worktreePath, branch) : null),
    [project, worktreePath, branch],
  );
  const projectRootNames = useProjectRootNames(
    isHomeScope ? undefined : targetContext?.projectLocation,
  );

  // Grok image_gen → session `images/N.jpg`; pass the session dir so markdown
  // can resolve those relative paths via poracode-local://.
  const markdownImageRoots = useMemo(() => {
    if (thread.agentKind !== "grok" || isRemoteThread) return undefined;
    const sessionId = thread.sessionRef?.providerSessionId;
    const projectLocation = targetContext?.projectLocation;
    const homeDir = readBridge().homeDir;
    if (!sessionId || !projectLocation || !homeDir) return undefined;
    const sessionDir = resolveGrokSessionDir({ projectLocation, sessionId, homeDir });
    return sessionDir ? [sessionDir] : undefined;
  }, [
    isRemoteThread,
    thread.agentKind,
    thread.sessionRef?.providerSessionId,
    targetContext?.projectLocation,
  ]);

  const paneActions: ChatPaneActions | null = useMemo(() => {
    if (!project || !targetContext || isHomeScope) return null;
    return {
      openProjectRelativePath: async (path, lineNumber) => {
        const normalized = normalizeChatProjectPath(path, targetContext.projectLocation);
        const resolvedPath = await resolveBareBasename(
          normalized,
          targetContext.projectLocation,
          projectRootNames,
        );
        if (onOpenProjectRelativePath) {
          onOpenProjectRelativePath(resolvedPath, lineNumber);
          return;
        }
        await openFileInEditor(project, worktreePath, branch, resolvedPath, lineNumber);
      },
      revealProjectFolderInTree: (path) => {
        const normalized = normalizeChatProjectPath(path, targetContext.projectLocation);
        if (onRevealProjectFolderInTree) {
          onRevealProjectFolderInTree(normalized);
          return;
        }
        const fileEditor = useFileEditorStore.getState();
        const currentRoot = fileEditor.rootContext;
        const isSameContext =
          currentRoot?.projectId === targetContext.projectId &&
          currentRoot?.worktreePath === targetContext.worktreePath;
        if (!isSameContext) {
          fileEditor.setRootContext(targetContext);
        }
        if (fileEditor.overlayMode !== "fullscreen") {
          fileEditor.setOverlayMode("modal");
        }
        const ancestors = collectPathAncestors(normalized);
        useProjectTreeStore.getState().expandMany(ancestors);
      },
      ...(canShowProjectEntryInExplorer === false
        ? {}
        : {
            showProjectEntryInExplorer: (path: string) => {
              const normalized = normalizeChatProjectPath(path, targetContext.projectLocation);
              void readBridge().revealProjectEntry({
                projectLocation: targetContext.projectLocation,
                path: normalized,
              });
            },
          }),
      onContentHeightChange: () => scrollControlsRef.current?.onContentHeightChange(),
      isStickToBottom: () => scrollControlsRef.current?.isStickToBottom() ?? false,
      hasRecentUserScrollIntent: () =>
        scrollControlsRef.current?.hasRecentUserScrollIntent() ?? false,
      noteProgrammaticScroll: (scrollTop) =>
        scrollControlsRef.current?.noteProgrammaticScroll(scrollTop),
      isThreadOpenSettling: () => scrollControlsRef.current?.isThreadOpenSettling() ?? false,
      registerVirtualScrollToBottom: (handler) => {
        virtualScrollToBottomRef.current = handler;
      },
      projectLocation: targetContext.projectLocation,
      projectRootNames,
      ...(markdownImageRoots ? { markdownImageRoots } : {}),
    };
  }, [
    project,
    targetContext,
    isHomeScope,
    branch,
    worktreePath,
    projectRootNames,
    markdownImageRoots,
    onOpenProjectRelativePath,
    onRevealProjectFolderInTree,
    canShowProjectEntryInExplorer,
  ]);

  useEffect(() => {
    retainThreadRuntimeItems(threadId);
    if (!isRemoteThread) void hydrateThreadRuntimeItems(threadId);
    return () => releaseThreadRuntimeItems(threadId);
  }, [isRemoteThread, threadId]);

  useEffect(() => {
    if (!targetContext || isHomeScope) return;
    void hydrateFileCheckpoints({
      threadId,
      projectLocation: targetContext.projectLocation,
    });
  }, [isHomeScope, targetContext, threadId]);

  const completedTurns = useAppStore(
    (s) => s.runtimeCompletedTurnsByThread[threadId] ?? EMPTY_COMPLETED_TURNS,
  );
  const fileCheckpointTurns = useAppStore(
    (s) => s.fileCheckpointTurnsByThread[threadId] ?? EMPTY_FILE_CHECKPOINT_TURNS,
  );
  const fileCheckpoints = useAppStore(
    (s) => s.fileCheckpointsByThread[threadId] ?? EMPTY_FILE_CHECKPOINTS,
  );
  const finalizingFileCheckpointIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!targetContext || isHomeScope || completedTurns.length === 0) return;
    for (const turn of completedTurns) {
      const checkpointItemId = turn.anchorItemId;
      if (!checkpointItemId) continue;
      if (fileCheckpointTurns[checkpointItemId]) continue;
      if (finalizingFileCheckpointIdsRef.current.has(checkpointItemId)) continue;
      const state = useAppStore.getState();
      const runtimeItemIds = state.runtimeItemIdsByThread[threadId] ?? EMPTY_ITEM_IDS;
      const runtimeItemsById = state.runtimeItemsByIdByThread[threadId];
      const baseCheckpointItemId = findBaseCheckpointItemId(
        runtimeItemIds,
        runtimeItemsById,
        checkpointItemId,
      );
      if (!baseCheckpointItemId) continue;
      if (!fileCheckpoints[baseCheckpointItemId]) continue;
      finalizingFileCheckpointIdsRef.current.add(checkpointItemId);
      void finalizeFileCheckpoint({
        threadId,
        checkpointItemId,
        baseCheckpointItemId,
        projectLocation: targetContext.projectLocation,
      }).finally(() => {
        finalizingFileCheckpointIdsRef.current.delete(checkpointItemId);
      });
    }
  }, [completedTurns, fileCheckpoints, fileCheckpointTurns, isHomeScope, targetContext, threadId]);

  const isEmpty = timelineEntries.length === 0 && !hasSupplementaryContent;
  const isLive = isThreadTurnActive(status);
  // Detached background work keeps the thread doing real work after the
  // foreground turn settles. Treat that as "still working" for the tail-loader
  // timer (so it keeps ticking "Working for ...") without touching `status` -
  // composer interrupt/steer and notifications stay on the raw status.
  const hasBackgroundActivity = useThreadHasBackgroundActivity(threadId);
  const showWorkingTimer = isLive || hasBackgroundActivity;
  const hasOpenRuntimeRequest = useAppStore(
    (s) => (s.runtimeRequestsByThread[threadId]?.length ?? 0) > 0,
  );
  // Anchor on thread.status alone — gating on item state caused the loader to
  // disappear in the gap between an item flipping to `completed` and the next
  // `item.started` arriving, even though the runtime was still working the
  // turn.
  const turn = resolveTurnTiming(thread, showWorkingTimer);
  const mostRecentDisplayableCompletedTurn = useAppStore((s) =>
    selectMostRecentDisplayableCompletedTurn(s.runtimeCompletedTurnsByThread[threadId]),
  );
  const mostRecentCompletedTurnAnchor = mostRecentDisplayableCompletedTurn?.anchorItemId ?? null;
  const completedTurnAnchorAtTail = isCompletedTurnAnchorAtTimelineTail(
    mostRecentCompletedTurnAnchor,
    timelineEntries,
  );
  const completedTurnCanRenderInTail =
    !showWorkingTimer &&
    (turn?.endedAt != null || mostRecentDisplayableCompletedTurn !== null) &&
    completedTurnAnchorAtTail;
  const tailTurn =
    completedTurnCanRenderInTail && mostRecentDisplayableCompletedTurn
      ? mostRecentDisplayableCompletedTurn
      : turn;
  const showTailLoader = showWorkingTimer || completedTurnCanRenderInTail;
  // The agent is not actually working while it waits for a user answer, so the
  // tail loader keeps rendering but its elapsed-time counter freezes for the
  // duration of the wait and resumes once the user submits a response. Anchor
  // on `hasOpenRuntimeRequest` (cleared optimistically by the request panel)
  // rather than `thread.status`, which only flips back to `working` after the
  // supervisor's round-trip — for plan approvals the agent often opens a new
  // request before that round-trip completes, leaving status stuck at
  // `needs_approval` even though the user has already answered.
  const isTurnPaused = hasOpenRuntimeRequest;
  const showEmptyHint = isEmpty && !isLive;
  // The tail loader displays the most recent completed turn's frozen elapsed
  // time when the thread is idle and no newer timeline row exists. Once an
  // optimistic next prompt is appended, keep the completed indicator inline at
  // its anchor so the prompt does not briefly occupy the old footer position.
  // When detached background work keeps the timer live after the foreground
  // turn settles, the ticking "Working for" reseeds from that turn's start —
  // its window subsumes the frozen "Worked for" record, so render only the
  // live timer, never both at once.
  const liveTimerContinuesCompletedTurn =
    turn !== null &&
    turn.endedAt === null &&
    mostRecentDisplayableCompletedTurn !== null &&
    turn.startedAt <= mostRecentDisplayableCompletedTurn.startedAt;
  const suppressInlineTurnAnchorId =
    completedTurnCanRenderInTail || liveTimerContinuesCompletedTurn
      ? mostRecentCompletedTurnAnchor
      : null;
  const checkpointGuard = useAppStore(
    useShallow((s) =>
      resolveCheckpointGuard({
        threads: s.threads,
        threadId,
        projectId,
        worktreePath,
      }),
    ),
  );

  return (
    <ChatPaneActionsContext.Provider value={paneActionsOverride ?? paneActions}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="relative min-h-0 flex-1">
          <MessageList
            key={threadId}
            threadId={threadId}
            threadConfig={thread.config}
            entries={timelineEntries}
            isTurnActive={isLive}
            setScrollContainer={setScrollContainer}
            scrollContentRef={contentRef}
            onContentHeightChange={() => scrollControlsRef.current?.onContentHeightChange()}
            onVirtualizerLayoutChange={() =>
              scrollControlsRef.current?.beginVirtualizerLayoutChange()
            }
            onLiveVirtualizerLayoutChange={() =>
              scrollControlsRef.current?.beginLiveVirtualizerLayoutChange()
            }
            registerVirtualScrollToBottom={(handler) => {
              virtualScrollToBottomRef.current = handler;
            }}
            scrollClassName="min-h-0 h-full overflow-y-auto [overflow-anchor:none] [scrollbar-gutter:stable]"
            scrollStyle={scrollFadeStyle}
            contentClassName={`min-h-full pb-2 ${isInitialScrollSettled ? "" : "pointer-events-none opacity-0"}`}
            emptyContent={
              isEmpty && !showTailLoader && showEmptyHint ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-foreground-muted">
                  <span>
                    <Trans>No messages yet</Trans>
                  </span>
                </div>
              ) : null
            }
            footer={
              showTailLoader && tailTurn ? (
                <ChatTailLoader turn={tailTurn} isPaused={isTurnPaused} />
              ) : null
            }
            onWheelCapture={(event) => {
              if (event.deltaY < 0) {
                scrollControlsRef.current?.markUserScrollIntent();
                scrollControlsRef.current?.disableStickToBottom();
              }
            }}
            onPointerDownCapture={(event) => {
              // Only arm scroll-intent for real scroll gestures (scrollbar /
              // empty-canvas drags). Tool expand/collapse clicks must not —
              // sticky row-height compensation then looks like a user
              // scroll-away and strands the transcript above the bottom.
              if (!shouldMarkUserScrollIntentFromPointerTarget(event.target)) {
                // The control can commit a taller virtual row before its
                // post-layout measurement callback runs. Guard that earlier
                // LegendList anchor adjustment directly from pointerdown.
                scrollControlsRef.current?.beginVirtualizerLayoutChange();
                return;
              }
              scrollControlsRef.current?.markUserScrollIntent();
              // Unpin immediately — same as wheel-up. Native scrollbar thumbs
              // are not DOM nodes and often overlay the content box (Windows
              // overlay scrollbars), so gutter hit-testing is unreliable.
              // Waiting for the first scroll event leaves sticky on long enough
              // for row-measure ResizeObservers to re-pin and yank the thumb
              // back to the bottom while the user is still dragging.
              scrollControlsRef.current?.disableStickToBottom();
            }}
            onKeyDownCapture={(event) => {
              if (isScrollNavigationKey(event.key)) {
                scrollControlsRef.current?.markUserScrollIntent();
              }
            }}
            onStartReached={() => {
              void loadOlderThreadRuntimeItems(threadId);
            }}
            registerScrollToIndex={registerScrollToIndex}
            suppressInlineTurnAnchorId={suppressInlineTurnAnchorId}
            canRevertCheckpoints={!isLive && !isHomeScope}
            checkpointGuard={checkpointGuard}
            checkpointActions={checkpointActions}
            projectLocation={
              checkpointProjectLocation ??
              (isHomeScope ? undefined : targetContext?.projectLocation)
            }
          />
          <ChatScrollControls
            key={`scroll:${threadId}`}
            ref={scrollControlsRef}
            scrollRef={scrollRef}
            contentRef={contentRef}
            layoutChangeToken={layoutChangeToken}
            tailEntryId={timelineEntries.at(-1)?.id ?? null}
            threadId={threadId}
            tailLoaderVisible={showTailLoader}
            initialScrollSettled={isInitialScrollSettled}
            initialScrollRevealDelayMs={props.initialScrollRevealDelayMs ?? 0}
            virtualScrollToBottomRef={virtualScrollToBottomRef}
            onInitialScrollSettled={() => {
              setInitialScrollSettledThreadId(threadId);
              props.onInitialScrollSettled?.();
            }}
          />
          <SubAgentOpenController
            key={`subagent:${threadId}`}
            threadId={threadId}
            {...(targetContext ? { projectLocation: targetContext.projectLocation } : {})}
            onOpen={(parentItemId, projectLocation) => {
              if (onOpenSubAgent) {
                onOpenSubAgent(parentItemId, projectLocation);
                return;
              }
              showSubAgentPanel(threadId, parentItemId, projectLocation);
            }}
          />
          <ChatFindBar
            threadId={threadId}
            scrollToIndexRef={scrollToIndexRef}
            scrollElement={scrollEl}
          />
        </div>
      </div>
    </ChatPaneActionsContext.Provider>
  );
}

interface TurnTiming {
  startedAt: number;
  endedAt: number | null;
}

interface CompletedTurnTiming extends TurnTiming {
  anchorItemId: string | null;
  endedAt: number;
}

function parseTurnTimestamp(iso: string | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Derives the current or last completed run window from persisted thread timing
 * so reopening a thread doesn't reseed the footer timer from mount time.
 */
function resolveTurnTiming(thread: Thread, forceLive = false): TurnTiming | null {
  const isLive = forceLive || isThreadTurnActive(thread.status);

  if (isLive) {
    // When only background work keeps the thread live, the foreground
    // turn has ended and `activeTurnStartedAt` is cleared - fall back to the
    // just-completed turn's start so the timer continues from there instead of
    // reseeding at mount time.
    const startedAt = parseTurnTimestamp(
      thread.activeTurnStartedAt ?? thread.lastTurnStartedAt ?? thread.createdAt,
    );
    return startedAt === null ? null : { startedAt, endedAt: null };
  }

  const startedAt = parseTurnTimestamp(thread.lastTurnStartedAt);
  const endedAt = parseTurnTimestamp(thread.lastTurnEndedAt);
  if (startedAt === null || endedAt === null) {
    return null;
  }

  return {
    startedAt,
    endedAt: Math.max(startedAt, endedAt),
  };
}

function selectMostRecentDisplayableCompletedTurn(
  records: readonly CompletedTurnTiming[] | undefined,
): CompletedTurnTiming | null {
  if (!records) return null;
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index]!;
    if (record.endedAt - record.startedAt >= 1000) return record;
  }
  return null;
}

function ChatTailLoader({ turn, isPaused }: { turn: TurnTiming; isPaused: boolean }) {
  return (
    <div className="mx-auto w-full max-w-[920px]">
      <Surface variant="transparent" className={chatMessageSurfaceClass}>
        <div className="inline-flex items-center gap-1.5 text-[length:var(--lc-chat-font-size-meta)] text-foreground-muted">
          <WorkingFor turn={turn} isPaused={isPaused} />
        </div>
      </Surface>
    </div>
  );
}

/**
 * Self-ticking elapsed-time label. While `turn.endedAt` is null, ticks every
 * second as "Working for N"; once set, freezes as "Worked for N". When
 * `isPaused` is true (e.g. the runtime is blocked on a user-input prompt) the
 * counter freezes at its current value and the paused interval is excluded
 * from the elapsed total once it resumes. Mutates `textContent` directly via
 * a ref instead of calling `setState` so the per-second tick produces zero
 * React commits — important while the rest of the chat is potentially
 * streaming.
 */
function WorkingFor({ turn, isPaused }: { turn: TurnTiming; isPaused: boolean }) {
  const { t } = useLingui();
  const textRef = useRef<HTMLSpanElement>(null);
  const pauseStateRef = useRef<{ accumulatedPauseMs: number; pausedSinceMs: number | null }>({
    accumulatedPauseMs: 0,
    pausedSinceMs: null,
  });

  useEffect(() => {
    pauseStateRef.current = { accumulatedPauseMs: 0, pausedSinceMs: null };
  }, [turn.startedAt, turn.endedAt]);

  useEffect(() => {
    const update = () => {
      const node = textRef.current;
      if (!node) return;
      if (turn.endedAt !== null) {
        const elapsedSeconds = Math.max(0, Math.floor((turn.endedAt - turn.startedAt) / 1000));
        const elapsed = formatElapsed(elapsedSeconds);
        const text = elapsedSeconds < 1 ? "" : t`Worked for ${elapsed}`;
        node.textContent = text;
        node.dataset.poracodeShimmerText = text;
        return;
      }
      const pauseState = pauseStateRef.current;
      const now = Date.now();
      const currentPauseMs =
        pauseState.pausedSinceMs !== null ? Math.max(0, now - pauseState.pausedSinceMs) : 0;
      const elapsedMs = now - turn.startedAt - pauseState.accumulatedPauseMs - currentPauseMs;
      const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
      const elapsed = formatElapsed(elapsedSeconds);
      const text = elapsedSeconds < 1 ? "" : t`Working for ${elapsed}`;
      node.textContent = text;
      node.dataset.poracodeShimmerText = text;
    };

    if (isPaused) {
      if (pauseStateRef.current.pausedSinceMs === null) {
        pauseStateRef.current.pausedSinceMs = Date.now();
      }
      update();
      return;
    }

    if (pauseStateRef.current.pausedSinceMs !== null) {
      pauseStateRef.current.accumulatedPauseMs += Math.max(
        0,
        Date.now() - pauseStateRef.current.pausedSinceMs,
      );
      pauseStateRef.current.pausedSinceMs = null;
    }
    update();
    if (turn.endedAt !== null) return;
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [turn.startedAt, turn.endedAt, isPaused, t]);

  const isThinking = !isPaused && turn.endedAt === null;
  useShimmerRef(textRef, isThinking);
  const className = isThinking ? "poracode-thinking-text" : "text-muted";
  return <span ref={textRef} className={className} aria-live="polite" />;
}

function isScrollNavigationKey(key: string): boolean {
  return (
    key === "ArrowUp" ||
    key === "ArrowDown" ||
    key === "PageUp" ||
    key === "PageDown" ||
    key === "Home" ||
    key === "End" ||
    key === " "
  );
}

/** ["", "src", "src/foo", "src/foo/bar"] for "src/foo/bar". Empty string is the tree root. */
function collectPathAncestors(path: string): string[] {
  const segments = path.split("/").filter(Boolean);
  const ancestors: string[] = [""];
  for (let i = 0; i < segments.length; i++) {
    ancestors.push(segments.slice(0, i + 1).join("/"));
  }
  return ancestors;
}

function isCompletedTurnAnchorAtTimelineTail(
  anchorItemId: string | null,
  entries: readonly ChatTimelineEntry[],
): boolean {
  if (anchorItemId === null || entries.length === 0) return true;
  const lastEntry = entries[entries.length - 1]!;
  return lastEntry.kind === "item"
    ? lastEntry.id === anchorItemId
    : lastEntry.itemIds.includes(anchorItemId);
}

type CheckpointGuard = {
  scopeLabel: string;
  hasSharedTree: boolean;
  sharedThreadCount: number;
};

function resolveCheckpointGuard(input: {
  threads: readonly Thread[];
  threadId: string;
  projectId: string;
  worktreePath?: string | undefined;
}): CheckpointGuard {
  const treeKey = checkpointTreeKey(input.projectId, input.worktreePath);
  const sharedThreadCount = input.threads.filter(
    (thread) =>
      thread.id !== input.threadId &&
      !thread.archived &&
      checkpointTreeKey(thread.projectId, thread.worktreePath) === treeKey,
  ).length;
  return {
    scopeLabel: input.worktreePath ? "this worktree" : "the main project tree",
    hasSharedTree: sharedThreadCount > 0,
    sharedThreadCount,
  };
}

function checkpointTreeKey(projectId: string, worktreePath: string | undefined): string {
  return `${projectId}\0${worktreePath ?? ""}`;
}

function findBaseCheckpointItemId(
  itemIds: readonly string[],
  itemsById:
    | ReturnType<typeof useAppStore.getState>["runtimeItemsByIdByThread"][string]
    | undefined,
  checkpointItemId: string,
): string | null {
  const checkpointIndex = itemIds.indexOf(checkpointItemId);
  if (checkpointIndex < 0) return null;
  for (let idx = checkpointIndex; idx >= 0; idx -= 1) {
    const itemId = itemIds[idx]!;
    if (itemsById?.[itemId]?.type === "user_message") return itemId;
  }
  return null;
}

/**
 * When a chat chip carries a bare basename (no directory separator, not
 * absolute) that is NOT a top-level project entry, attempt to resolve it to a
 * real project-relative path via the file search index. Returns the original
 * path unchanged when it already contains a separator, is absolute, or is a
 * known root entry (those resolve directly). Throws when the basename cannot
 * be found so the chip can switch to an inert visual.
 */
async function resolveBareBasename(
  path: string,
  projectLocation: ProjectLocation,
  rootNames: ReadonlySet<string> | undefined,
): Promise<string> {
  const hasSeparator = path.includes("/") || path.includes("\\");
  const isAbsolute = path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path);
  if (hasSeparator || isAbsolute) return path;
  if (rootNames?.has(path)) return path;

  const result = await readBridge().searchProjectFiles({
    projectLocation,
    query: path,
    limit: 5,
  });
  const exact = result.entries.find(
    (e) => e.type === "file" && e.name.toLowerCase() === path.toLowerCase(),
  );
  if (exact) return exact.path;
  throw new Error(`File not found: ${path}`);
}
