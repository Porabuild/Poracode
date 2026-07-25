import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Tooltip } from "@heroui/react";
import { ArrowRightLeft, Bug, CircleCheck, X } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type {
  AgentStatus,
  ProjectLocation,
  PromptSegment,
  TerminalSize,
  Thread,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { DEFAULT_TERMINAL_SIZE as DEFAULT_HIDDEN_TERMINAL_SIZE } from "@/shared/contracts";

import { useAppStore } from "@/renderer/state/appStore";
import { TuxIcon } from "@/renderer/components/common/TuxIcon";
import { performInitialThreadLaunch } from "@/renderer/actions/threadLaunchActions";
import { setRendererRuntimeDiagnosticContext } from "@/renderer/diagnostics/sentry";
import { macosTrafficLightPadClass } from "@/renderer/components/layout/sidebarChrome";
import type { TerminalPaneHandle } from "./TerminalPane";
import { ContinueInProviderDialog } from "./ContinueInProviderDialog";
import { GuiThreadContent } from "./ThreadContent";
import { TerminalThreadContent } from "./TerminalThreadContent";
import { ThreadHeaderStatusButton } from "./ThreadHeaderStatus";
import { ThreadToolRail } from "./ThreadToolRail";

/**
 * Strip Electron's `Error invoking remote method '<channel>': Error: ` prefix
 * from IPC rejections so users see the supervisor's actual message verbatim.
 */
function stripIpcInvokeFraming(message: string): string {
  return message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, "");
}

function formatLaunchError(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return stripIpcInvokeFraming(error.message);
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return stripIpcInvokeFraming(error);
  }
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim().length > 0
  ) {
    return stripIpcInvokeFraming(error.message);
  }
  return fallbackMessage;
}

function areThreadViewPropsEqual(prev: ThreadViewProps, next: ThreadViewProps): boolean {
  const configAffectsLaunch =
    prev.pendingLaunchPrompt !== undefined || next.pendingLaunchPrompt !== undefined;
  return (
    prev.thread.id === next.thread.id &&
    prev.thread.projectId === next.thread.projectId &&
    prev.thread.title === next.thread.title &&
    prev.thread.agentKind === next.thread.agentKind &&
    prev.thread.agentInstanceId === next.thread.agentInstanceId &&
    prev.thread.worktreePath === next.thread.worktreePath &&
    prev.thread.presentationMode === next.thread.presentationMode &&
    prev.thread.done === next.thread.done &&
    prev.thread.canResumeWithConfig === next.thread.canResumeWithConfig &&
    prev.thread.sessionRef?.providerSessionId === next.thread.sessionRef?.providerSessionId &&
    (!configAffectsLaunch || prev.thread.config === next.thread.config) &&
    prev.agentStatus === next.agentStatus &&
    prev.projectLocation === next.projectLocation &&
    prev.projectName === next.projectName &&
    prev.pendingLaunchPrompt === next.pendingLaunchPrompt &&
    prev.pendingLaunchSegments === next.pendingLaunchSegments &&
    prev.isWsl === next.isWsl &&
    prev.showCloseButton === next.showCloseButton &&
    prev.paneAlign === next.paneAlign &&
    prev.isDragging === next.isDragging &&
    prev.dropIndicator === next.dropIndicator &&
    prev.paneCount === next.paneCount &&
    prev.headerNeedsTrafficLightPad === next.headerNeedsTrafficLightPad &&
    prev.dragHandleRef === next.dragHandleRef &&
    prev.droppableRef === next.droppableRef &&
    prev.installedAgents === next.installedAgents &&
    prev.onContinueInProvider === next.onContinueInProvider
  );
}

export type ThreadViewProps = {
  thread: Thread;
  agentStatus: AgentStatus | undefined;
  projectLocation: ProjectLocation;
  projectName?: string;
  pendingLaunchPrompt?: string;
  pendingLaunchSegments?: PromptSegment[];
  isWsl?: boolean;
  showCloseButton?: boolean;
  paneAlign?: "left" | "center" | "right";
  isDragging?: boolean;
  dropIndicator?:
    | false
    | "replace"
    | "insert-left"
    | "insert-right"
    | "insert-top"
    | "insert-bottom";
  paneIndex?: number;
  paneCount?: number;
  /**
   * True when this pane sits in the top-left and there is no group header above
   * it — i.e., the pane's own header is the topmost row in the content area and
   * needs to clear the macOS traffic lights when the sidebar is collapsed. Pure
   * layout fact: stable across sidebar collapse/expand so the memo holds.
   */
  headerNeedsTrafficLightPad?: boolean | undefined;
  dragHandleRef?: (element: Element | null) => void;
  droppableRef?: React.RefObject<HTMLDivElement | null>;
  onClose?: (() => void) | undefined;
  onMarkDone?: (() => void) | undefined;
  installedAgents?: AgentStatus[];
  onContinueInProvider?:
    | ((
        targetKind: string,
        targetConfig: ThreadConfig,
        targetPresentationMode: ThreadPresentationMode,
        prompt: string,
        segments: PromptSegment[] | undefined,
        closeOriginal: boolean,
        extractedContext: import("../../../shared/contracts").ExtractContextResult | null,
      ) => void)
    | undefined;
  onLaunchConsumed?: (() => void) | undefined;
  onLaunchFailed?: ((message: string) => void) | undefined;
};

export const ThreadView = memo(function ThreadView(props: ThreadViewProps) {
  const {
    thread,
    agentStatus,
    projectLocation,
    projectName,
    pendingLaunchPrompt,
    pendingLaunchSegments,
    isWsl,
    showCloseButton,
    paneAlign = "center",
    isDragging,
    dropIndicator,
    paneIndex: _paneIndex,
    paneCount = 1,
    headerNeedsTrafficLightPad = false,
    dragHandleRef,
    droppableRef,
    onClose,
    onMarkDone,
    installedAgents,
    onContinueInProvider,
    onLaunchConsumed,
    onLaunchFailed,
  } = props;
  const { t } = useLingui();
  const terminalPaneRef = useRef<TerminalPaneHandle>(null);
  const [terminalSize, setTerminalSize] = useState<TerminalSize | null>(null);
  const [continueDialogOpen, setContinueDialogOpen] = useState(false);
  const [runtimeDebugOpen, setRuntimeDebugOpen] = useState(false);
  const launchRequestRef = useRef<string | null>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const [isTitleTooltipOpen, setIsTitleTooltipOpen] = useState(false);

  // Thread-level mode wins over the adapter-declared default. Existing rows
  // load from DB with `presentationMode: "terminal"` thanks to the schema
  // default, so behaviour is preserved for everything that already shipped.
  const usesTerminalPresentation =
    (thread.presentationMode ?? agentStatus?.capabilities.presentationMode ?? "terminal") ===
    "terminal";
  const launchTerminalSize = usesTerminalPresentation ? terminalSize : DEFAULT_HIDDEN_TERMINAL_SIZE;

  useEffect(() => {
    const presentation =
      thread.presentationMode ?? agentStatus?.capabilities.presentationMode ?? "terminal";
    setRendererRuntimeDiagnosticContext({
      provider: thread.agentKind,
      presentation,
      runtimeKind: presentation === "terminal" ? "pty" : "structured",
      featureArea: "thread",
    });
  }, [agentStatus?.capabilities.presentationMode, thread.agentKind, thread.presentationMode]);

  useLayoutEffect(() => {
    setContinueDialogOpen(false);
    setRuntimeDebugOpen(false);
    setIsTitleTooltipOpen(false);
  }, [thread.id]);

  useEffect(() => {
    if (pendingLaunchPrompt === undefined) {
      launchRequestRef.current = null;
    }
  }, [pendingLaunchPrompt, thread.id]);

  useEffect(() => {
    if (pendingLaunchPrompt === undefined || launchTerminalSize === null) {
      return;
    }

    const launchKey = [
      thread.id,
      thread.sessionRef?.providerSessionId ?? "new",
      pendingLaunchPrompt,
      launchTerminalSize.cols,
      launchTerminalSize.rows,
    ].join(":");
    if (launchRequestRef.current === launchKey) {
      return;
    }

    launchRequestRef.current = launchKey;
    onLaunchConsumed?.();

    void (async () => {
      await performInitialThreadLaunch({
        thread,
        projectLocation,
        prompt: pendingLaunchPrompt,
        ...(pendingLaunchSegments ? { segments: pendingLaunchSegments } : {}),
        initialSize: launchTerminalSize,
      });
    })().catch((error) => {
      launchRequestRef.current = null;
      onLaunchFailed?.(formatLaunchError(error, t`Thread failed to start.`));
    });
  }, [
    t,
    onLaunchConsumed,
    onLaunchFailed,
    pendingLaunchPrompt,
    pendingLaunchSegments,
    projectLocation,
    launchTerminalSize,
    thread,
  ]);

  const alignClass =
    paneAlign === "right" ? "ml-auto" : paneAlign === "left" ? "mr-auto" : "mx-auto";
  const paddingClass = "px-2";
  const contentShellClass = `${alignClass} relative flex min-h-0 w-full max-w-[1040px] flex-1 flex-col ${paddingClass} px-3 pb-2`;
  const contentBodyClass = `${alignClass} flex min-h-0 w-full max-w-[920px] flex-1 flex-col pt-2`;

  return (
    <>
      <div
        ref={droppableRef}
        className={`group/pane relative flex h-full min-h-0 flex-col ${isDragging ? "opacity-50" : ""}`}
      >
        {/* Header bar — provider icon outside pane drag handle; status tooltip uses HeroUI tooltip (anchored bottom start). */}
        <div className={`px-2 ${headerNeedsTrafficLightPad ? macosTrafficLightPadClass : ""}`}>
          <div
            className={`${dragHandleRef ? "poracode-content-over-drag-region" : "poracode-content-over-drag-region--drag"} @container ${alignClass} flex w-full max-w-[920px] items-center gap-2 py-1`}
          >
            <ThreadHeaderStatusButton
              threadId={thread.id}
              fallbackThread={thread}
              fallbackAgentKind={thread.agentKind}
              agentLabel={agentStatus?.label}
              agentIcon={agentStatus?.icon}
            />
            <div
              ref={dragHandleRef}
              className={`flex min-w-0 flex-1 items-center gap-2 ${dragHandleRef ? "cursor-grab active:cursor-grabbing" : ""}`}
            >
              <Tooltip
                delay={500}
                isOpen={isTitleTooltipOpen}
                onOpenChange={(open) => {
                  if (open) {
                    const el = titleRef.current;
                    if (el && el.scrollWidth > el.clientWidth) {
                      setIsTitleTooltipOpen(true);
                    }
                  } else {
                    setIsTitleTooltipOpen(false);
                  }
                }}
              >
                <Tooltip.Trigger className="min-w-0 flex-1" tabIndex={-1} role="none">
                  <span
                    ref={titleRef}
                    className="block truncate text-sm font-medium leading-tight text-foreground @max-[560px]:text-xs @max-[360px]:text-[11px]"
                  >
                    {thread.title}
                  </span>
                </Tooltip.Trigger>
                <Tooltip.Content placement="bottom" className="max-w-[28rem] break-words text-xs">
                  {thread.title}
                </Tooltip.Content>
              </Tooltip>
              <div className="flex shrink-0 items-center">
                {projectName ? (
                  <span className="px-1 text-sm leading-tight text-muted/60 @max-[560px]:text-xs @max-[360px]:text-[11px]">
                    {projectName}
                  </span>
                ) : null}
                {isWsl ? <TuxIcon className="h-3 w-auto shrink-0 px-1 text-muted/60" /> : null}
                {onContinueInProvider &&
                installedAgents &&
                installedAgents.filter((a) => a.kind !== thread.agentKind).length > 0 &&
                thread.sessionRef ? (
                  <Tooltip delay={0}>
                    <Tooltip.Trigger>
                      <button
                        type="button"
                        aria-label={t`Continue in another provider`}
                        className="poracode-overlay-header__controls shrink-0 rounded p-1 text-muted/60 transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          setContinueDialogOpen(true);
                        }}
                      >
                        <ArrowRightLeft className="size-3.5" />
                      </button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                      <Trans>Continue in another provider</Trans>
                    </Tooltip.Content>
                  </Tooltip>
                ) : null}
                {import.meta.env.DEV && !usesTerminalPresentation ? (
                  <Tooltip delay={0}>
                    <Tooltip.Trigger>
                      <button
                        type="button"
                        aria-label={
                          runtimeDebugOpen
                            ? t`Hide runtime debug panel`
                            : t`Show runtime debug panel`
                        }
                        aria-pressed={runtimeDebugOpen}
                        className={`poracode-overlay-header__controls shrink-0 rounded p-1 transition-colors hover:bg-[var(--row-hover)] ${runtimeDebugOpen ? "text-foreground" : "text-muted/60 hover:text-foreground"}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setRuntimeDebugOpen((o) => !o);
                        }}
                      >
                        <Bug className="size-3.5" />
                      </button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                      {runtimeDebugOpen ? (
                        <Trans>Hide canonical runtime item inspector</Trans>
                      ) : (
                        <Trans>Inspect canonical runtime items</Trans>
                      )}
                    </Tooltip.Content>
                  </Tooltip>
                ) : null}
                {onMarkDone ? (
                  <button
                    type="button"
                    aria-label={thread.done ? t`Unmark done` : t`Mark done`}
                    className={`poracode-overlay-header__controls shrink-0 rounded p-1 transition-colors hover:bg-[var(--row-hover)] ${thread.done ? "text-[oklch(0.78_0.1_180)]" : "text-muted/60 hover:text-foreground"}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMarkDone();
                    }}
                  >
                    <CircleCheck className="size-3.5" />
                  </button>
                ) : null}
                {showCloseButton ? (
                  <button
                    type="button"
                    aria-label={t`Close pane`}
                    className="poracode-overlay-header__controls shrink-0 rounded p-1 text-muted/60 transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose?.();
                    }}
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className={contentShellClass}>
          {dropIndicator === "replace" && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-20 rounded-2xl bg-accent/10 ring-1 ring-inset ring-accent/30"
            />
          )}
          {dropIndicator === "insert-left" && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 bottom-0 left-0 z-20 w-0.5 rounded-full bg-accent"
            />
          )}
          {dropIndicator === "insert-right" && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 right-0 bottom-0 z-20 w-0.5 rounded-full bg-accent"
            />
          )}
          {dropIndicator === "insert-top" && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 right-0 left-0 z-20 h-0.5 rounded-full bg-accent"
            />
          )}
          {dropIndicator === "insert-bottom" && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute right-0 bottom-0 left-0 z-20 h-0.5 rounded-full bg-accent"
            />
          )}

          <div className={contentBodyClass}>
            {usesTerminalPresentation ? (
              <TerminalThreadContent
                threadId={thread.id}
                fallbackThread={thread}
                agentStatus={agentStatus}
                projectLocation={projectLocation}
                paneCount={paneCount}
                terminalPaneRef={terminalPaneRef}
                onTerminalResize={setTerminalSize}
              />
            ) : (
              <GuiThreadContent
                threadId={thread.id}
                fallbackThread={thread}
                agentStatus={agentStatus}
                projectLocation={projectLocation}
                paneCount={paneCount}
                terminalPaneRef={terminalPaneRef}
                runtimeDebugOpen={import.meta.env.DEV && runtimeDebugOpen}
              />
            )}
          </div>
        </div>

        <ThreadToolRail
          projectId={thread.projectId}
          paneCount={paneCount}
          {...(thread.worktreePath ? { worktreePath: thread.worktreePath } : {})}
        />
      </div>
      {onContinueInProvider && installedAgents && continueDialogOpen ? (
        <ContinueInProviderDialog
          isOpen
          thread={thread}
          projectLocation={projectLocation}
          installedAgents={installedAgents}
          {...(() => {
            const cfg = useAppStore
              .getState()
              .projects.find((p) => p.id === thread.projectId)?.lastDraftConfig;
            return cfg ? { lastDraftConfig: cfg } : {};
          })()}
          onClose={() => setContinueDialogOpen(false)}
          onContinue={(
            targetKind,
            targetConfig,
            targetPresentationMode,
            prompt,
            segments,
            closeOrig,
            ctx,
          ) => {
            setContinueDialogOpen(false);
            onContinueInProvider(
              targetKind,
              targetConfig,
              targetPresentationMode,
              prompt,
              segments,
              closeOrig,
              ctx,
            );
          }}
        />
      ) : null}
    </>
  );
}, areThreadViewPropsEqual);
