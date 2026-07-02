import { useEffect, useRef, useState, type CSSProperties } from "react";
import { toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { MessageCircle } from "lucide-react";
import {
  DEFAULT_TERMINAL_SIZE,
  type PromptSegment,
  type TerminalSize,
  type Thread,
  type ThreadConfig,
  type ThreadServerRequestId,
} from "@/shared/contracts";
import { stripAnsiPreservingLayout } from "@/shared/ansi";
import { buildWorktreeLocation } from "@/shared/worktree";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import type { XTermSurfaceHandle } from "@/renderer/components/terminal/XTermSurface";
import { SubAgentOverlay } from "@/renderer/components/thread/ChatPane/parts/items/SubAgentOverlay";
import { GuiThreadContent } from "@/renderer/components/thread/ThreadContent";
import { ThreadComposerSection } from "@/renderer/components/thread/ThreadComposerSection";
import { useThreadDockState } from "@/renderer/components/thread/useThreadDockState";
import type { TerminalPaneHandle } from "@/renderer/components/thread/TerminalPane";
import { useProjectAgentStatuses } from "@/renderer/hooks/uiSelectors";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useProject } from "@/renderer/state/useThread";
import { MobileTerminal } from "../MobileTerminal";
import { FloatingComposerDock } from "../FloatingComposerDock";
import { EmptyState } from "../components";
import { WorkspaceChip } from "../GitSummaryParts";
import { TerminalAccessory } from "../TerminalAccessory";
import { ThreadTitleRow } from "../ThreadTitleRow";
import { ThreadUsageIndicator } from "../ThreadUsageIndicator";
import { useKeyboardOffset } from "../useKeyboardOffset";
import type { ThreadAction } from "../useRemoteDesktop";
import type { WorkspaceTab } from "./WorkspaceView";

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
  readonly onResolveServerRequest: (input: {
    requestId: ThreadServerRequestId;
    method: string;
    response: unknown;
  }) => Promise<void>;
  /** Open the unified workspace panel (Changes/Files) for this thread. */
  readonly onOpenWorkspace?: (tab: WorkspaceTab) => void;
  /** Open a project/worktree file from a shared chat file chip. */
  readonly onOpenWorkspaceFile?: ((path: string, lineNumber?: number) => void) | undefined;
  /** Reveal a project/worktree folder from a shared chat folder chip. */
  readonly onOpenWorkspaceFolder?: ((path: string) => void) | undefined;
  /** Open a terminal scoped to this thread's project/worktree. */
  readonly onOpenTerminal?: () => void;
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
  const projectAgentStatuses = useProjectAgentStatuses(project?.location);
  const terminalPaneRef = useRef<TerminalPaneHandle | null>(null);
  const terminalSurfaceRef = useRef<XTermSurfaceHandle | null>(null);
  const [terminalReloadKey, setTerminalReloadKey] = useState(0);
  const [terminalSize, setTerminalSize] = useState<TerminalSize | null>(null);
  const [composerInputFocused, setComposerInputFocused] = useState(false);
  const agentTerminalFontSize = useSharedSettings((state) => state.agentTerminalFontSize);
  const dockState = useThreadDockState(thread?.id ?? "");
  // Raw keyboard band for the PTY/accessory inputs. The composer itself is
  // hosted by FloatingComposerDock, which uses the same focus-gated lift as the
  // home composer.
  const keyboardOffset = useKeyboardOffset();

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
  const projectLocation =
    project && thread.worktreePath
      ? buildWorktreeLocation(project.location, thread.worktreePath)
      : project?.location;
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
        window.setTimeout(() => {
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

  const handleConfigChange = (config: ThreadConfig) => {
    const store = useAppStore.getState();
    store.updateThreadConfig(thread.id, config);
    // Mirrors the desktop pane: switching models after a failure clears the
    // error chrome since the user has acted on it.
    if (thread.status === "error") {
      store.updateThreadRuntime(thread.id, {
        status: "idle",
        attention: "none",
        canResumeWithConfig: thread.canResumeWithConfig,
        ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
      });
    }
  };

  const commonProps = {
    threadId: thread.id,
    fallbackThread: thread,
    agentStatus,
    projectLocation,
    paneCount: 1,
    terminalPaneRef,
    onConfigChange: handleConfigChange,
    onResolveServerRequest: props.onResolveServerRequest,
    onSubmitInput: props.onSubmitInput,
    ...(props.onOpenWorkspaceFile ? { onOpenProjectRelativePath: props.onOpenWorkspaceFile } : {}),
    ...(props.onOpenWorkspaceFolder
      ? { onRevealProjectFolderInTree: props.onOpenWorkspaceFolder }
      : {}),
    canShowProjectEntryInExplorer: false,
  };
  const showComposerDock = thread.status !== "launching" || !isTerminal;
  const terminalPageKeyboardOffset = isTerminal && composerInputFocused ? 0 : keyboardOffset;
  const composerDock = showComposerDock ? (
    <FloatingComposerDock
      dockClassName="m-thread-compose-dock"
      keyboardKey={thread.id}
      scrimLabel={t`Close composer`}
      onComposerFocusChange={setComposerInputFocused}
    >
      <ThreadComposerSection
        {...commonProps}
        todoDockCollapsed={dockState.todoDockCollapsed}
        todoDockPlacement={dockState.todoDockPlacement}
        todoDockState={dockState.todoDockState}
        goalDockState={dockState.goalDockState}
        errorDockStates={dockState.errorDockStates}
        onGoalDockDismiss={dockState.onGoalDockDismiss}
        onDismissError={dockState.onDismissError}
        onTodoDockCollapsedChange={dockState.onTodoDockCollapsedChange}
        onTodoDockPlacementChange={dockState.onTodoDockPlacementChange}
        onTodoDockRetire={dockState.onTodoDockRetire}
      />
    </FloatingComposerDock>
  ) : null;

  return (
    <section
      className={isTerminal ? "m-thread m-thread--terminal" : "m-thread"}
      style={{ "--m-keyboard-offset": `${terminalPageKeyboardOffset}px` } as CSSProperties}
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
      <div className="m-thread-content relative mx-auto flex min-h-0 w-full max-w-[1040px] flex-1 flex-col px-3 pb-2">
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
              <SubAgentOverlay threadId={thread.id} projectLocation={projectLocation} />
            </>
          ) : (
            <GuiThreadContent
              {...commonProps}
              dockState={dockState}
              runtimeDebugOpen={false}
              hideComposer
            />
          )}
        </div>
      </div>
      {composerDock}
    </section>
  );
}
