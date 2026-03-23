import { useEffect, useState } from "react";
import { Bot, Shield, Sparkles, TerminalSquare } from "lucide-react";
import type {
  AgentStatus,
  Thread,
  ThreadConfig,
  ThreadServerRequestId,
} from "../../../shared/contracts";
import { CodexStatusIcon, getCodexStatusTone, OptionMenu } from "../common";
import type { PendingThreadServerRequest } from "../../state/appStore";
import { TerminalPane } from "./TerminalPane";
import { ThreadComposer } from "./ThreadComposer";
import { ThreadServerRequestPanel } from "./ThreadServerRequestPanel";
import {
  buildPermissionOptions,
  formatCompactLabel,
  withCurrentValue,
} from "./threadComposerOptions";

function renderControlBar(
  thread: Thread,
  agentStatus: AgentStatus | undefined,
  onConfigChange: (config: ThreadConfig) => void,
) {
  const codexTone = getCodexStatusTone(thread);
  const permissionOptions = buildPermissionOptions(
    agentStatus?.capabilities.approvalPolicies ?? [],
    agentStatus?.capabilities.sandboxModes ?? [],
  );
  const selectedPermission =
    permissionOptions.find(
      (option) =>
        option.id === `${thread.config.approvalPolicy ?? ""}::${thread.config.sandboxMode ?? ""}`,
    )?.id ??
    permissionOptions[0]?.id ??
    "";

  const controls = [
    {
      key: "agent",
      value: agentStatus?.label ?? thread.agentKind,
      icon:
        thread.agentKind === "codex" ? (
          <CodexStatusIcon className="size-4 shrink-0" tone={codexTone} />
        ) : (
          <Bot className="size-4 text-muted" />
        ),
      isStatic: true,
    },
    ...(agentStatus?.capabilities.modes.length
      ? [
          {
            key: "mode",
            value: thread.config.mode ?? agentStatus.capabilities.modes[0] ?? "agent",
            icon: <TerminalSquare className="size-4 text-muted" />,
            options: agentStatus.capabilities.modes.map((value) => ({
              id: value,
              label: formatCompactLabel(value),
            })),
            onChange: (value: string) =>
              onConfigChange({
                ...thread.config,
                mode: value as Thread["config"]["mode"],
              }),
          },
        ]
      : []),
    {
      key: "model",
      value: thread.config.model,
      options: withCurrentValue(agentStatus?.capabilities.models ?? [], thread.config.model),
      onChange: (value: string) =>
        onConfigChange({
          ...thread.config,
          model: value,
        }),
    },
    ...(agentStatus?.capabilities.efforts.length
      ? [
          {
            key: "effort",
            value: thread.config.effort ?? agentStatus.capabilities.efforts[0] ?? "",
            icon: <Sparkles className="size-4 text-muted" />,
            options: agentStatus.capabilities.efforts.map((value) => ({
              id: value,
              label: formatCompactLabel(value),
            })),
            onChange: (value: string) =>
              onConfigChange({
                ...thread.config,
                effort: value,
              }),
          },
        ]
      : []),
    ...(permissionOptions.length > 0
      ? [
          {
            key: "permission",
            value: selectedPermission,
            icon: <Shield className="size-4 text-muted" />,
            options: permissionOptions,
            onChange: (value: string) => {
              const [nextApprovalPolicy, nextSandboxMode] = String(value).split("::");
              const nextConfig: ThreadConfig = {
                ...thread.config,
              };

              if (nextApprovalPolicy) {
                nextConfig.approvalPolicy = nextApprovalPolicy;
              } else {
                delete nextConfig.approvalPolicy;
              }

              if (nextSandboxMode) {
                nextConfig.sandboxMode = nextSandboxMode;
              } else {
                delete nextConfig.sandboxMode;
              }

              onConfigChange(nextConfig);
            },
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[1.4rem] border border-[color:var(--border)] bg-[color:color-mix(in_oklab,var(--surface)_84%,transparent)] px-3 py-2">
      {controls.map((control) =>
        control.isStatic ? (
          <div
            key={control.key}
            className="flex min-w-0 items-center gap-2 rounded-full bg-white/[0.03] px-2.5 py-1.5 text-sm text-muted"
          >
            {control.icon}
            <span className="truncate">{control.value}</span>
          </div>
        ) : (
          <OptionMenu
            key={control.key}
            buttonVariant="ghost"
            className="min-w-0 rounded-full px-2.5"
            {...(control.icon ? { icon: control.icon } : {})}
            isDisabled={thread.status !== "inactive" || !thread.canResumeWithConfig}
            options={control.options ?? []}
            value={control.value}
            onChange={control.onChange ?? (() => undefined)}
          />
        ),
      )}
    </div>
  );
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

          <div className="mx-auto flex min-h-0 w-full max-w-[920px] flex-1 flex-col gap-3 pt-3">
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
            ) : showServerComposer ? (
              <ThreadComposer
                compact
                controls={[]}
                placeholder="Ask Codex anything about this workspace"
                prompt={prompt}
                promptDisabled={isSubmitting}
                submitDisabled={prompt.trim().length === 0 || !canSubmitServerInput || isSubmitting}
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
            ) : thread.status === "launching" ? (
              <div className="rounded-[1.4rem] border border-[color:var(--border)] bg-[color:color-mix(in_oklab,var(--surface)_84%,transparent)] px-4 py-3 text-sm text-muted">
                Starting thread...
              </div>
            ) : null}

            {renderControlBar(thread, agentStatus, onConfigChange)}
          </div>
        </div>
      </div>
    </div>
  );
}
