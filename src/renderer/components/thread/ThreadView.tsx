import React, { useEffect, useRef, useState } from "react";
import { ClipboardList, ShieldOff, Sparkles, TerminalSquare, X } from "lucide-react";
import type {
  AgentStatus,
  ProjectLocation,
  TerminalSize,
  Thread,
  ThreadConfig,
  ThreadServerRequestId,
} from "../../../shared/contracts";

import { ProviderIcon, getStatusTone } from "../providers";
import type { PendingThreadServerRequest } from "../../state/appStore";
import { Button, PromptOptions, TuxIcon } from "../common";
import { readBridge } from "../../bridge";
import { TerminalPane } from "./TerminalPane";
import { ThreadComposer } from "./ThreadComposer";
import { ThreadServerRequestPanel } from "./ThreadServerRequestPanel";
import { formatCompactLabel, modelOptions } from "./threadComposerOptions";

const DEFAULT_HIDDEN_TERMINAL_SIZE: TerminalSize = { cols: 120, rows: 30 };

function buildControls(
  thread: Thread,
  agentStatus: AgentStatus | undefined,
  onConfigChange: (config: ThreadConfig) => void,
) {
  const statusTone = getStatusTone(thread);
  const hasPermissions =
    (agentStatus?.capabilities.approvalPolicies.length ?? 0) > 0 ||
    (agentStatus?.capabilities.sandboxModes.length ?? 0) > 0;
  const isFullAccess =
    thread.config.approvalPolicy === "never" && thread.config.sandboxMode === "danger-full-access";
  const availableEfforts =
    agentStatus?.capabilities.modelEfforts?.[thread.config.model ?? ""] ??
    agentStatus?.capabilities.efforts ??
    [];
  const isDisabled = !thread.canResumeWithConfig;

  return [
    {
      kind: "static" as const,
      value: agentStatus?.label ?? thread.agentKind,
      hideLabelOnWrap: true,
      icon: <ProviderIcon kind={thread.agentKind} tone={statusTone} className="size-4 shrink-0" />,
    },
    {
      options: modelOptions(
        agentStatus?.capabilities.models ?? [],
        thread.config.model,
        thread.agentKind,
      ),
      value: thread.config.model,
      isDisabled,
      onChange: (value: string) => {
        const nextEfforts =
          agentStatus?.capabilities.modelEfforts?.[value] ??
          agentStatus?.capabilities.efforts ??
          [];
        const effortValid = nextEfforts.includes(thread.config.effort ?? "");
        onConfigChange({
          ...thread.config,
          model: value,
          ...(!effortValid && nextEfforts.length > 0 ? { effort: nextEfforts[0] } : {}),
        });
      },
    },
    ...(availableEfforts.length
      ? [
          {
            icon: <Sparkles className="size-4 text-muted" />,
            options: availableEfforts.map((value) => ({
              id: value,
              label: formatCompactLabel(value),
            })),
            value: thread.config.effort ?? availableEfforts[0] ?? "",
            isDisabled,
            onChange: (value: string) =>
              onConfigChange({
                ...thread.config,
                effort: value,
              }),
          },
        ]
      : []),
    ...(agentStatus?.capabilities.modes.length === 2
      ? [
          {
            kind: "toggle" as const,
            icon: <ClipboardList className="size-3.5" />,
            label: formatCompactLabel(
              agentStatus.capabilities.modes.find((m) => m !== "agent") ?? "plan",
            ),
            hideLabelOnWrap: true,
            isSelected: (thread.config.mode ?? "agent") !== "agent",
            isDisabled,
            onChange: (isSelected: boolean) => {
              const altMode = agentStatus.capabilities.modes.find((m) => m !== "agent") ?? "plan";
              onConfigChange({
                ...thread.config,
                mode: (isSelected ? altMode : "agent") as Thread["config"]["mode"],
              });
            },
          },
        ]
      : agentStatus?.capabilities.modes.length
        ? [
            {
              icon: <TerminalSquare className="size-4 text-muted" />,
              options: agentStatus.capabilities.modes.map((value) => ({
                id: value,
                label: formatCompactLabel(value),
              })),
              hideLabelOnWrap: true,
              value: thread.config.mode ?? agentStatus.capabilities.modes[0] ?? "agent",
              isDisabled,
              onChange: (value: string) =>
                onConfigChange({
                  ...thread.config,
                  mode: value as Thread["config"]["mode"],
                }),
            },
          ]
        : []),
    ...((agentStatus?.capabilities.approvalPolicies.length ?? 0) > 2
      ? [
          {
            icon: <ShieldOff className="size-3.5" />,
            options: agentStatus!.capabilities.approvalPolicies.map((value) => ({
              id: value,
              label: formatCompactLabel(value),
            })),
            hideLabelOnWrap: true,
            value:
              thread.config.approvalPolicy ??
              agentStatus!.capabilities.approvalPolicies[0] ??
              "default",
            isDisabled,
            onChange: (value: string) =>
              onConfigChange({ ...thread.config, approvalPolicy: value }),
          },
        ]
      : hasPermissions
        ? [
            {
              kind: "toggle" as const,
              icon: <ShieldOff className="size-3.5" />,
              label: "Full Access",
              hideLabelOnWrap: true,
              isSelected: isFullAccess,
              isDisabled,
              onChange: (selected: boolean) => {
                if (selected) {
                  onConfigChange({
                    ...thread.config,
                    approvalPolicy: "never",
                    sandboxMode: "danger-full-access",
                  });
                } else {
                  const { approvalPolicy: _a, sandboxMode: _s, ...rest } = thread.config;
                  onConfigChange({
                    ...rest,
                    approvalPolicy: agentStatus?.capabilities.approvalPolicies[0],
                    sandboxMode: agentStatus?.capabilities.sandboxModes[0],
                  });
                }
              },
            },
          ]
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
  const usesTerminalPresentation = (agentStatus?.capabilities.presentationMode ?? "terminal") === "terminal";
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

  const terminalPrompt =
    usesTerminalPresentation &&
    thread.terminalPrompt &&
    (thread.status === "needs_approval" || thread.status === "needs_reply")
      ? thread.terminalPrompt
      : undefined;

  const controls = buildControls(thread, agentStatus, onConfigChange);

  useEffect(() => {
    setPrompt("");
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

  const writeTerminalData = (data: string) => {
    void readBridge().writeTerminal({ threadId: thread.id, data });
  };

  const promptInputContent = terminalPrompt ? (
    <PromptOptions
      title={terminalPrompt.title}
      options={terminalPrompt.options}
      onSelect={(key) => writeTerminalData(key)}
      onSubmitText={(key, text) => {
        writeTerminalData(key);
        setTimeout(() => writeTerminalData(text), 150);
        setTimeout(() => writeTerminalData("\r"), 300);
      }}
      onCancel={() => writeTerminalData("\x1b")}
    />
  ) : undefined;

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
                  onTerminalResize={setTerminalSize}
                  readOnly={isServerControlled}
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
                inputContent={promptInputContent}
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
