import { useEffect, useRef } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { MessageCircle } from "lucide-react";
import type {
  PromptSegment,
  Thread,
  ThreadConfig,
  ThreadServerRequestId,
} from "@/shared/contracts";
import { stripAnsiPreservingLayout } from "@/shared/ansi";
import { buildWorktreeLocation } from "@/shared/worktree";
import { GuiThreadContent } from "@/renderer/components/thread/ThreadContent";
import { ThreadComposerSection } from "@/renderer/components/thread/ThreadComposerSection";
import type { TerminalPaneHandle } from "@/renderer/components/thread/TerminalPane";
import { useProjectAgentStatuses } from "@/renderer/hooks/uiSelectors";
import { useAppStore } from "@/renderer/state/appStore";
import { useProject } from "@/renderer/state/useThread";
import { MobileTerminal } from "../MobileTerminal";
import { EmptyState } from "../components";
import { ThreadGitBar } from "../GitSummaryParts";
import { ThreadTitleRow } from "../ThreadTitleRow";
import type { ThreadAction } from "../useRemoteDesktop";

export interface ThreadViewProps {
  readonly thread: Thread | null;
  /** Terminal scrollback text from the latest remote thread snapshot. */
  readonly terminalScrollback: string | undefined;
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
  /** Open the fullscreen git panel for this thread. */
  readonly onOpenGit?: () => void;
}

const emptyTodoComposerProps = {
  todoDockCollapsed: false,
  todoDockPlacement: "composer" as const,
  todoDockState: null,
  goalDockState: null,
  errorDockStates: [],
  onGoalDockDismiss: () => undefined,
  onTodoDockCollapsedChange: () => undefined,
  onTodoDockPlacementChange: () => undefined,
  onDismissError: () => undefined,
};

/** Read-only scrollback for terminal sessions (no remote PTY stream yet). */
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
  };

  return (
    <section className="m-thread">
      {props.loading ? (
        <span className="m-loading-bar" role="progressbar" aria-label={t`Loading thread`} />
      ) : null}
      {props.hideHeader ? null : (
        <header className="mx-auto flex w-full max-w-[920px] items-center gap-2 px-3 py-1">
          <ThreadTitleRow thread={thread} onAction={props.onThreadAction} />
        </header>
      )}
      <ThreadGitBar threadId={thread.id} onOpen={props.onOpenGit} />
      {/* Same shell classes as the desktop ThreadView pane. */}
      <div className="relative mx-auto flex min-h-0 w-full max-w-[1040px] flex-1 flex-col px-3 pb-2">
        <div className="mx-auto flex min-h-0 w-full max-w-[920px] flex-1 flex-col pt-2">
          {isTerminal ? (
            <>
              {/* Live, interactive terminal once the snapshot (its scrollback)
                  is in hand; a read-only snapshot pane covers the brief load. */}
              {props.loading ? (
                <TerminalScrollbackPane scrollback={props.terminalScrollback ?? ""} />
              ) : (
                <div className="m-terminal-live">
                  <MobileTerminal
                    key={thread.id}
                    terminalId={thread.id}
                    initialScrollback={props.terminalScrollback ?? ""}
                  />
                </div>
              )}
              <ThreadComposerSection {...commonProps} {...emptyTodoComposerProps} />
            </>
          ) : (
            <GuiThreadContent {...commonProps} runtimeDebugOpen={false} />
          )}
        </div>
      </div>
    </section>
  );
}
