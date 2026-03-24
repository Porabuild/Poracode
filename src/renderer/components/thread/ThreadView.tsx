import { useEffect, useState } from "react";
import { Bot, ClipboardList, ShieldOff, Sparkles, TerminalSquare } from "lucide-react";
import type {
  AgentStatus,
  Thread,
  ThreadConfig,
  ThreadServerRequestId,
} from "../../../shared/contracts";
import { CodexStatusIcon, getCodexStatusTone } from "../common";
import type { PendingThreadServerRequest } from "../../state/appStore";
import { TerminalPane } from "./TerminalPane";
import { ThreadComposer } from "./ThreadComposer";
import { ThreadServerRequestPanel } from "./ThreadServerRequestPanel";
import { formatCompactLabel, withCurrentValue } from "./threadComposerOptions";

function buildControls(
  thread: Thread,
  agentStatus: AgentStatus | undefined,
  onConfigChange: (config: ThreadConfig) => void,
) {
  const codexTone = getCodexStatusTone(thread);
  const hasPermissions =
    (agentStatus?.capabilities.approvalPolicies.length ?? 0) > 0 ||
    (agentStatus?.capabilities.sandboxModes.length ?? 0) > 0;
  const isFullAccess =
    thread.config.approvalPolicy === "never" &&
    thread.config.sandboxMode === "danger-full-access";
  const availableEfforts =
    agentStatus?.capabilities.modelEfforts?.[thread.config.model ?? ""] ??
    agentStatus?.capabilities.efforts ??
    [];
  const isDisabled = !thread.canResumeWithConfig;

  return [
    {
      kind: "static" as const,
      value: agentStatus?.label ?? thread.agentKind,
      icon:
        thread.agentKind === "codex" ? (
          <CodexStatusIcon className="size-4 shrink-0" tone={codexTone} />
        ) : (
          <Bot className="size-4 text-muted" />
        ),
    },
    {
      options: withCurrentValue(agentStatus?.capabilities.models ?? [], thread.config.model),
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
            isSelected: (thread.config.mode ?? "agent") !== "agent",
            isDisabled,
            onChange: (isSelected: boolean) => {
              const altMode =
                agentStatus.capabilities.modes.find((m) => m !== "agent") ?? "plan";
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
    ...(hasPermissions
      ? [
          {
            kind: "toggle" as const,
            icon: <ShieldOff className="size-3.5" />,
            label: "Full Access",
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
  pendingServerRequests: PendingThreadServerRequest[];
  onConfigChange: (config: ThreadConfig) => void;
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
    pendingServerRequests,
    onConfigChange,
    onResolveServerRequest,
    onSubmitInput,
  } = props;
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isServerControlled =
    thread.agentKind === "codex" && agentStatus?.capabilities.liveInputMode === "server";
  const activeServerRequest = pendingServerRequests[0];
  const canSubmitServerInput =
    isServerControlled &&
    thread.sessionRef !== undefined &&
    (thread.status === "idle" || thread.status === "needs_reply");
  const showServerComposer =
    isServerControlled && thread.status !== "inactive" && thread.status !== "launching";

  const controls = buildControls(thread, agentStatus, onConfigChange);

  useEffect(() => {
    setPrompt("");
  }, [thread.id]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-full min-h-0 flex-col px-6 pt-1 pb-4">
        <div className="mx-auto flex h-full w-full max-w-[1040px] flex-col">
          <div className="mx-auto flex w-full max-w-[920px] items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold tracking-tight text-foreground">
                {thread.title}
              </h1>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2" />
          </div>

          <div className="mx-auto flex min-h-0 w-full max-w-[920px] flex-1 flex-col gap-2 pt-3">
            <div className="min-h-0 flex-1 overflow-hidden">
              <TerminalPane
                readOnly={isServerControlled}
                status={thread.status}
                threadId={thread.id}
              />
            </div>

            {activeServerRequest ? (
              <ThreadServerRequestPanel
                request={activeServerRequest}
                onResolve={onResolveServerRequest}
              />
            ) : null}

            <div className="relative">
              {thread.status === "launching" ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[1.5rem] bg-background/80">
                  <span className="text-sm text-muted">Starting thread...</span>
                </div>
              ) : null}
              <ThreadComposer
                compact
                controls={controls}
                placeholder={
                  isServerControlled
                    ? "Ask Codex anything about this workspace"
                    : "Send a message..."
                }
                prompt={prompt}
                promptDisabled={isSubmitting || !showServerComposer || thread.status === "launching"}
                submitDisabled={
                  prompt.trim().length === 0 || !canSubmitServerInput || isSubmitting
                }
                submitLabel="Send message"
                onPromptChange={setPrompt}
                onSubmit={() => {
                  if (prompt.trim().length === 0 || !canSubmitServerInput || isSubmitting) {
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
