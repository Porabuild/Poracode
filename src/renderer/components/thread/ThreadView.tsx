import { memo, useEffect, useRef, useState } from "react";
import { Tooltip } from "@heroui/react";
import { ArrowRightLeft, Bug, CircleCheck, X } from "lucide-react";
import type {
  AgentStatus,
  ProjectLocation,
  PromptSegment,
  TerminalSize,
  Thread,
  ThreadConfig,
  ThreadPresentationMode,
  ThreadServerRequestId,
} from "@/shared/contracts";
import { isHomeProjectId } from "@/shared/homeScope";
import { isOpenCodeBrowserMcpEnabled } from "@/shared/opencodeSettings";
import { buildPromptContentBlocks } from "@/shared/promptContent";

import { useAppStore } from "@/renderer/state/appStore";
import { captureFileCheckpoint } from "@/renderer/state/fileCheckpointActions";
import { TuxIcon } from "@/renderer/components/common";
import { BrowserChip } from "@/renderer/components/composer";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { readBridge } from "@/renderer/bridge";
import { captureThreadStarted } from "@/renderer/analytics/posthog";
import { setRendererRuntimeDiagnosticContext } from "@/renderer/diagnostics/sentry";
import { macosTrafficLightPadClass } from "@/renderer/components/layout/sidebarChrome";
import type { TerminalPaneHandle } from "./TerminalPane";
import { ContinueInProviderDialog } from "./ContinueInProviderDialog";
import { GuiThreadContent } from "./ThreadContent";
import { TerminalThreadContent } from "./TerminalThreadContent";
import { ThreadHeaderStatusButton } from "./ThreadHeaderStatus";

const DEFAULT_HIDDEN_TERMINAL_SIZE: TerminalSize = { cols: 120, rows: 30 };

/**
 * Strip Electron's `Error invoking remote method '<channel>': Error: ` prefix
 * from IPC rejections so users see the supervisor's actual message verbatim.
 */
function stripIpcInvokeFraming(message: string): string {
  return message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, "");
}

function formatLaunchError(error: unknown): string {
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
  return "Thread failed to start.";
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
    prev.thread.config.browserMcp === next.thread.config.browserMcp &&
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
  onConfigChange: (config: ThreadConfig) => void;
  onLaunchConsumed?: (() => void) | undefined;
  onLaunchFailed?: ((message: string) => void) | undefined;
  onResolveServerRequest: (input: {
    requestId: ThreadServerRequestId;
    method: string;
    response: unknown;
  }) => Promise<void>;
  onSubmitInput: (prompt: string, segments?: PromptSegment[]) => Promise<void>;
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
    onConfigChange,
    onLaunchConsumed,
    onLaunchFailed,
    onResolveServerRequest,
    onSubmitInput,
  } = props;
  const terminalPaneRef = useRef<TerminalPaneHandle>(null);
  const [terminalSize, setTerminalSize] = useState<TerminalSize | null>(null);
  const [continueDialogOpen, setContinueDialogOpen] = useState(false);
  const [runtimeDebugOpen, setRuntimeDebugOpen] = useState(false);
  const launchRequestRef = useRef<string | null>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const [isTitleTooltipOpen, setIsTitleTooltipOpen] = useState(false);
  const opencodeBrowserMcpEnabled = useSharedSettings((s) =>
    isOpenCodeBrowserMcpEnabled(s.agentSettings.opencode),
  );

  // Thread-level mode wins over the adapter-declared default. Existing rows
  // load from DB with `presentationMode: "terminal"` thanks to the schema
  // default, so behaviour is preserved for everything that already shipped.
  const usesTerminalPresentation =
    (thread.presentationMode ?? agentStatus?.capabilities.presentationMode ?? "terminal") ===
    "terminal";
  const launchTerminalSize = usesTerminalPresentation ? terminalSize : DEFAULT_HIDDEN_TERMINAL_SIZE;
  // Browser MCP is bound at session-create time for every provider (Claude SDK
  // `mcpServers` baked into `query()`, Codex `-c` overrides, ACP `newSession`).
  // Toggling mid-thread can't re-attach the server, so the indicator in the
  // active-thread header is informational only — disabling it would mislead
  // the user into thinking the tool is no longer in scope. The toggle lives
  // exclusively in the draft composer's ComposerAddMenu.
  const showBrowserChip =
    thread.config.browserMcp === true ||
    (thread.agentKind === "opencode" && opencodeBrowserMcpEnabled);

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

  useEffect(() => {
    setRuntimeDebugOpen(false);
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

    // Optimistic user_message for the FIRST prompt in a fresh GUI thread.
    // Without this the chat sits empty for the duration of the supervisor's
    // structured-session bringup (process spawn + ACP handshake +
    // newSession), which can be a noticeable delay. The supervisor reuses
    // this id when it emits its own canonical user_message events so the
    // renderer's per-id dedupe drops the duplicate.
    const presentation = thread.presentationMode ?? "terminal";
    if (thread.config.model) {
      useSharedSettings
        .getState()
        .pushRecentModel(thread.agentKind, thread.config.model, presentation);
    }

    let optimisticUserMessageItemId: string | undefined;
    if (
      presentation === "gui" &&
      pendingLaunchPrompt.length > 0 &&
      thread.sessionRef === undefined
    ) {
      optimisticUserMessageItemId = `user-${crypto.randomUUID()}`;
      useAppStore.getState().applyRuntimeEvent(thread.id, {
        type: "item.started",
        threadId: thread.id,
        itemId: optimisticUserMessageItemId,
        itemType: "user_message",
        payload: { content: buildPromptContentBlocks(pendingLaunchPrompt, pendingLaunchSegments) },
      });
      useAppStore.getState().applyRuntimeEvent(thread.id, {
        type: "item.completed",
        threadId: thread.id,
        itemId: optimisticUserMessageItemId,
      });
      useAppStore.getState().updateThreadRuntime(thread.id, {
        status: "working",
        attention: "working",
        canResumeWithConfig: thread.canResumeWithConfig,
        ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
      });
    }

    void (async () => {
      if (optimisticUserMessageItemId && !isHomeProjectId(thread.projectId)) {
        await captureFileCheckpoint({
          threadId: thread.id,
          checkpointItemId: optimisticUserMessageItemId,
          projectLocation,
        });
      }
      await readBridge().startThread({
        threadId: thread.id,
        projectLocation,
        agentKind: thread.agentKind,
        ...(thread.agentInstanceId ? { agentInstanceId: thread.agentInstanceId } : {}),
        config: thread.config,
        prompt: pendingLaunchPrompt,
        ...(pendingLaunchSegments ? { segments: pendingLaunchSegments } : {}),
        initialSize: launchTerminalSize,
        ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
        ...(thread.presentationMode ? { presentationMode: thread.presentationMode } : {}),
        ...(optimisticUserMessageItemId ? { userMessageItemId: optimisticUserMessageItemId } : {}),
      });
      captureThreadStarted(
        {
          agentKind: thread.agentKind,
          config: thread.config,
          ...(thread.presentationMode ? { presentationMode: thread.presentationMode } : {}),
          ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
          ...(thread.worktreePath ? { worktreePath: thread.worktreePath } : {}),
        },
        pendingLaunchSegments,
      );
    })().catch((error) => {
      launchRequestRef.current = null;
      onLaunchFailed?.(formatLaunchError(error));
    });
  }, [
    onLaunchConsumed,
    onLaunchFailed,
    pendingLaunchPrompt,
    pendingLaunchSegments,
    projectLocation,
    launchTerminalSize,
    thread.agentKind,
    thread.agentInstanceId,
    thread.canResumeWithConfig,
    thread.config,
    thread.id,
    thread.presentationMode,
    thread.projectId,
    thread.sessionRef,
    thread.worktreePath,
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
        className={`relative flex h-full min-h-0 flex-col ${isDragging ? "opacity-50" : ""}`}
      >
        {/* Header bar — provider icon outside pane drag handle; status tooltip uses HeroUI tooltip (anchored bottom start). */}
        <div className={`px-2 ${headerNeedsTrafficLightPad ? macosTrafficLightPadClass : ""}`}>
          <div
            className={`${dragHandleRef ? "lightcode-content-over-drag-region" : "lightcode-content-over-drag-region--drag"} @container ${alignClass} flex w-full max-w-[920px] items-center gap-2 py-1`}
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
              {showBrowserChip ? (
                <BrowserChip
                  variant="header"
                  {...(thread.agentKind === "opencode"
                    ? { title: "Browser MCP enabled for OpenCode" }
                    : {})}
                />
              ) : null}
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
                        aria-label="Continue in another provider"
                        className="lightcode-overlay-header__controls shrink-0 rounded p-1 text-muted/60 transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          setContinueDialogOpen(true);
                        }}
                      >
                        <ArrowRightLeft className="size-3.5" />
                      </button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>Continue in another provider</Tooltip.Content>
                  </Tooltip>
                ) : null}
                {!usesTerminalPresentation ? (
                  <Tooltip delay={0}>
                    <Tooltip.Trigger>
                      <button
                        type="button"
                        aria-label={
                          runtimeDebugOpen ? "Hide runtime debug panel" : "Show runtime debug panel"
                        }
                        aria-pressed={runtimeDebugOpen}
                        className={`lightcode-overlay-header__controls shrink-0 rounded p-1 transition-colors hover:bg-[var(--row-hover)] ${runtimeDebugOpen ? "text-foreground" : "text-muted/60 hover:text-foreground"}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setRuntimeDebugOpen((o) => !o);
                        }}
                      >
                        <Bug className="size-3.5" />
                      </button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                      {runtimeDebugOpen
                        ? "Hide canonical runtime item inspector"
                        : "Inspect canonical runtime items"}
                    </Tooltip.Content>
                  </Tooltip>
                ) : null}
                {onMarkDone ? (
                  <button
                    type="button"
                    aria-label={thread.done ? "Unmark done" : "Mark done"}
                    className={`lightcode-overlay-header__controls shrink-0 rounded p-1 transition-colors hover:bg-[var(--row-hover)] ${thread.done ? "text-[oklch(0.78_0.1_180)]" : "text-muted/60 hover:text-foreground"}`}
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
                    aria-label="Close pane"
                    className="lightcode-overlay-header__controls shrink-0 rounded p-1 text-muted/60 transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
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
                onConfigChange={onConfigChange}
                onResolveServerRequest={onResolveServerRequest}
                onSubmitInput={onSubmitInput}
              />
            ) : (
              <GuiThreadContent
                threadId={thread.id}
                fallbackThread={thread}
                agentStatus={agentStatus}
                projectLocation={projectLocation}
                paneCount={paneCount}
                terminalPaneRef={terminalPaneRef}
                runtimeDebugOpen={runtimeDebugOpen}
                onConfigChange={onConfigChange}
                onResolveServerRequest={onResolveServerRequest}
                onSubmitInput={onSubmitInput}
              />
            )}
          </div>
        </div>
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
