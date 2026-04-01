import React, { useEffect, useRef, useState } from "react";
import { GitBranch, GitFork, X } from "lucide-react";
import type {
  AgentStatus,
  ProjectLocation,
  TerminalSize,
  Thread,
  ThreadConfig,
  ThreadServerRequestId,
} from "../../../shared/contracts";

import { ProviderIcon, getComposerControls, getStatusTone } from "../providers";
import type { PendingThreadServerRequest } from "../../state/appStore";
import { useGitStore } from "../../state/gitStore";
import { Button, TuxIcon } from "../common";
import { readBridge } from "../../bridge";
import { TerminalPane } from "./TerminalPane";
import { ThreadComposer } from "./ThreadComposer";
import { ThreadServerRequestPanel } from "./ThreadServerRequestPanel";

const DEFAULT_HIDDEN_TERMINAL_SIZE: TerminalSize = { cols: 120, rows: 30 };

function buildControls(
  thread: Thread,
  agentStatus: AgentStatus | undefined,
  onConfigChange: (config: ThreadConfig) => void,
) {
  const statusTone = getStatusTone(thread);
  const factory = getComposerControls(thread.agentKind);

  return [
    {
      kind: "static" as const,
      value: agentStatus?.label ?? thread.agentKind,
      hideLabelOnWrap: true,
      icon: <ProviderIcon kind={thread.agentKind} tone={statusTone} className="size-4 shrink-0" />,
    },
    ...(factory && agentStatus
      ? factory({
          capabilities: agentStatus.capabilities,
          config: thread.config,
          isDisabled: !thread.canResumeWithConfig,
          onConfigChange: (patch) => onConfigChange({ ...thread.config, ...patch }),
        })
      : []),
  ];
}

export function ThreadView(props: {
  thread: Thread;
  agentStatus: AgentStatus | undefined;
  projectLocation: ProjectLocation;
  pendingLaunchPrompt?: string;
  isWsl?: boolean;
  pendingServerRequests: PendingThreadServerRequest[];
  showCloseButton?: boolean;
  paneAlign?: "left" | "center" | "right";
  isDragging?: boolean | undefined;
  paneDragActive?: boolean | undefined;
  dropIndicator?: false | "replace" | "insert-left" | "insert-right";
  onClose?: (() => void) | undefined;
  onPaneDragStart?: (() => void) | undefined;
  onPaneDragEnd?: (() => void) | undefined;
  onPaneDragOver?:
    | ((zone: "left" | "center" | "right", event: React.DragEvent) => void)
    | undefined;
  onPaneDrop?: ((event: React.DragEvent) => void) | undefined;
  onConfigChange: (config: ThreadConfig) => void;
  onLaunchConsumed?: (() => void) | undefined;
  onLaunchFailed?: (() => void) | undefined;
  onResolveServerRequest: (input: {
    requestId: ThreadServerRequestId;
    method: string;
    response: unknown;
  }) => Promise<void>;
  onSubmitInput: (prompt: string) => Promise<void>;
}) {
  const {
    thread,
    agentStatus,
    projectLocation,
    pendingLaunchPrompt,
    isWsl,
    pendingServerRequests,
    showCloseButton,
    paneAlign = "center",
    isDragging,
    paneDragActive,
    dropIndicator,
    onClose,
    onPaneDragStart,
    onPaneDragEnd,
    onPaneDragOver,
    onPaneDrop,
    onConfigChange,
    onLaunchConsumed,
    onLaunchFailed,
    onResolveServerRequest,
    onSubmitInput,
  } = props;
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [terminalSize, setTerminalSize] = useState<TerminalSize | null>(null);
  const launchRequestRef = useRef<string | null>(null);
  const isServerControlled = agentStatus?.capabilities.liveInputMode === "server";
  const isTerminalInput = agentStatus?.capabilities.liveInputMode === "terminal";
  const usesTerminalPresentation =
    (agentStatus?.capabilities.presentationMode ?? "terminal") === "terminal";
  const activeServerRequest = pendingServerRequests[0];
  const canSubmitServerInput =
    isServerControlled &&
    thread.sessionRef !== undefined &&
    (thread.status === "idle" || thread.status === "needs_reply");
  const canSubmitTerminalInput =
    usesTerminalPresentation &&
    isTerminalInput &&
    thread.status !== "inactive" &&
    thread.status !== "launching";
  const showServerComposer =
    isServerControlled && thread.status !== "inactive" && thread.status !== "launching";
  const showTerminalComposer =
    usesTerminalPresentation &&
    isTerminalInput &&
    thread.status !== "inactive" &&
    thread.status !== "launching";
  const launchTerminalSize = usesTerminalPresentation ? terminalSize : DEFAULT_HIDDEN_TERMINAL_SIZE;

  const gitStatus = useGitStore((s) =>
    thread.worktreePath ? s.worktreeStatuses[thread.worktreePath] : s.statuses[thread.projectId],
  );
  const branchName = thread.worktreeBranch ?? gitStatus?.branch;

  const controls = buildControls(thread, agentStatus, onConfigChange);

  useEffect(() => {
    setPrompt("");
  }, [thread.id]);

  // Listen for "Paste in input" from terminal context menu
  useEffect(() => {
    function handlePasteToComposer(e: Event) {
      const text = (e as CustomEvent<string>).detail;
      if (text) setPrompt((prev) => prev + text);
    }
    window.addEventListener("lightcode:paste-to-composer", handlePasteToComposer);
    return () => window.removeEventListener("lightcode:paste-to-composer", handlePasteToComposer);
  }, []);

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

    void readBridge()
      .startThread({
        threadId: thread.id,
        projectLocation,
        agentKind: thread.agentKind,
        config: thread.config,
        prompt: pendingLaunchPrompt,
        initialSize: launchTerminalSize,
        ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
      })
      .catch(() => {
        launchRequestRef.current = null;
        onLaunchFailed?.();
      });
  }, [
    onLaunchConsumed,
    onLaunchFailed,
    pendingLaunchPrompt,
    projectLocation,
    launchTerminalSize,
    thread.agentKind,
    thread.config,
    thread.id,
    thread.sessionRef,
  ]);

  const alignClass =
    paneAlign === "right" ? "ml-auto" : paneAlign === "left" ? "mr-auto" : "mx-auto";
  const paddingClass =
    paneAlign === "left" ? "pl-6 pr-10" : paneAlign === "right" ? "pl-6 pr-6" : "px-6";

  return (
    <div className={`relative flex h-full min-h-0 flex-col ${isDragging ? "opacity-50" : ""}`}>
      {paneDragActive && !isDragging && (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-10"
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            const rect = e.currentTarget.getBoundingClientRect();
            const fraction = (e.clientX - rect.left) / rect.width;
            const zone = fraction < 0.25 ? "left" : fraction > 0.75 ? "right" : "center";
            onPaneDragOver?.(zone, e);
          }}
          onDrop={(e) => {
            e.preventDefault();
            onPaneDrop?.(e);
          }}
        />
      )}
      {dropIndicator === "replace" && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 rounded-2xl bg-accent/10 ring-1 ring-inset ring-accent/30"
        />
      )}
      {dropIndicator === "insert-left" && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 z-20 w-1 rounded-full bg-accent"
        />
      )}
      {dropIndicator === "insert-right" && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 z-20 w-1 rounded-full bg-accent"
        />
      )}
      <div className={`flex h-full min-h-0 flex-col ${paddingClass} pt-1 pb-4`}>
        <div className={`${alignClass} flex h-full w-full max-w-[1040px] flex-col`}>
          <div
            className={`${alignClass} flex w-full max-w-[920px] items-start justify-between gap-4 ${onPaneDragStart ? "cursor-grab active:cursor-grabbing" : ""}`}
            draggable={!!onPaneDragStart}
            onDragStart={
              onPaneDragStart
                ? (e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", thread.id);
                    onPaneDragStart();
                  }
                : undefined
            }
            onDragEnd={onPaneDragEnd}
          >
            <div className="flex min-w-0 items-center gap-2">
              <ProviderIcon
                kind={thread.agentKind}
                tone={getStatusTone(thread)}
                className="size-4 shrink-0"
              />
              <h1 className="truncate text-sm font-semibold tracking-tight text-foreground">
                {thread.title}
              </h1>
              {isWsl ? <TuxIcon className="h-3 w-auto shrink-0 text-muted/60" /> : null}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {showCloseButton ? (
                <Button
                  isIconOnly
                  aria-label="Close pane"
                  className="rounded-3xl text-muted hover:bg-white/[0.05] hover:text-foreground"
                  onPress={() => onClose?.()}
                  size="sm"
                  variant="ghost"
                >
                  <X className="size-4" />
                </Button>
              ) : null}
            </div>
          </div>

          <div
            className={`${alignClass} flex min-h-0 w-full max-w-[920px] flex-1 flex-col gap-2 pt-3`}
          >
            <div className="min-h-0 flex-1 overflow-hidden">
              {usesTerminalPresentation ? (
                <TerminalPane
                  key={thread.id}
                  onTerminalResize={setTerminalSize}
                  status={thread.status}
                  threadId={thread.id}
                />
              ) : null}
            </div>

            {activeServerRequest ? (
              <ThreadServerRequestPanel
                agentLabel={agentStatus?.label}
                request={activeServerRequest}
                onResolve={onResolveServerRequest}
              />
            ) : null}

            <div className="relative">
              {thread.status === "launching" ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-3xl bg-background/80">
                  <span className="text-sm text-muted">Starting thread...</span>
                </div>
              ) : null}
              <ThreadComposer
                autoFocus // eslint-disable-line jsx-a11y/no-autofocus -- desktop app, expected UX
                compact
                controls={controls}
                placeholder={
                  isServerControlled
                    ? `Ask ${agentStatus?.label ?? "the agent"} anything about this workspace`
                    : isTerminalInput
                      ? "Send a message..."
                      : "Send a message..."
                }
                prompt={prompt}
                promptDisabled={
                  !(showServerComposer || showTerminalComposer) || thread.status === "launching"
                }
                submitDisabled={
                  prompt.trim().length === 0 ||
                  !(canSubmitServerInput || canSubmitTerminalInput) ||
                  isSubmitting
                }
                submitLabel="Send message"
                afterControls={
                  branchName ? (
                    <div className="lightcode-composer-static min-w-0 px-2.5">
                      {thread.worktreePath ? (
                        <GitFork className="size-3.5 text-muted" />
                      ) : (
                        <GitBranch className="size-3.5 text-muted" />
                      )}
                      <span className="truncate">{branchName}</span>
                    </div>
                  ) : undefined
                }
                onPromptChange={setPrompt}
                onSubmit={() => {
                  if (
                    prompt.trim().length === 0 ||
                    !(canSubmitServerInput || canSubmitTerminalInput) ||
                    isSubmitting
                  ) {
                    return;
                  }

                  setIsSubmitting(true);
                  void onSubmitInput(prompt.trim())
                    .then(() => {
                      setPrompt("");
                    })
                    .catch(() => {
                      // Leave the prompt intact so the user can retry.
                    })
                    .finally(() => {
                      setIsSubmitting(false);
                    });
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
