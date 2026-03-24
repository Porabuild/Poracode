import { useEffect, useState } from "react";
import { Bot, ClipboardList, ShieldOff, Sparkles, TerminalSquare } from "lucide-react";
import type { AgentStatus, Project, ThreadConfig } from "../../../shared/contracts";
import { CodexStatusIcon } from "../common";
import { ThreadComposer } from "./ThreadComposer";
import { formatCompactLabel, withCurrentValue } from "./threadComposerOptions";

export function ThreadDraftView(props: {
  project: Project;
  agentStatuses: AgentStatus[];
  onStart: (input: {
    agentKind: AgentStatus["kind"];
    config: ThreadConfig;
    prompt: string;
  }) => void;
}) {
  const { project, agentStatuses, onStart } = props;
  const installedAgents = agentStatuses.filter((status) => status.installed);
  const [agentKind, setAgentKind] = useState<AgentStatus["kind"]>(
    installedAgents[0]?.kind ?? "codex",
  );
  const selectedAgent =
    installedAgents.find((status) => status.kind === agentKind) ?? installedAgents[0];
  const [model, setModel] = useState(selectedAgent?.capabilities.models[0] ?? "");
  const [effort, setEffort] = useState(selectedAgent?.capabilities.efforts[0] ?? "");
  const [mode, setMode] = useState(selectedAgent?.capabilities.modes[0] ?? "agent");
  const [approvalPolicy, setApprovalPolicy] = useState(
    selectedAgent?.capabilities.approvalPolicies[0] ?? "",
  );
  const [sandboxMode, setSandboxMode] = useState(selectedAgent?.capabilities.sandboxModes[0] ?? "");
  const [prompt, setPrompt] = useState("");

  const availableEfforts =
    selectedAgent?.capabilities.modelEfforts?.[model] ?? selectedAgent?.capabilities.efforts ?? [];

  useEffect(() => {
    if (!selectedAgent) {
      return;
    }
    setModel(selectedAgent.capabilities.models[0] ?? "");
    setEffort(selectedAgent.capabilities.efforts[0] ?? "");
    setMode(selectedAgent.capabilities.modes[0] ?? "agent");
    setApprovalPolicy(selectedAgent.capabilities.approvalPolicies[0] ?? "");
    setSandboxMode(selectedAgent.capabilities.sandboxModes[0] ?? "");
  }, [selectedAgent]);

  useEffect(() => {
    if (availableEfforts.length > 0 && !availableEfforts.includes(effort)) {
      setEffort(availableEfforts[0] ?? "");
    }
  }, [model, availableEfforts, effort]);

  if (!selectedAgent) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">No supported agents detected</h1>
        <p className="text-muted">Install Codex or Claude Code to create a thread.</p>
      </div>
    );
  }

  const hasPermissions =
    selectedAgent.capabilities.approvalPolicies.length > 0 ||
    selectedAgent.capabilities.sandboxModes.length > 0;
  const isFullAccess =
    approvalPolicy === "never" && sandboxMode === "danger-full-access";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-full min-h-0 flex-col px-8 py-8">
        <div className="mx-auto flex h-full w-full max-w-[1040px] flex-col">
          <div className="flex flex-1 flex-col justify-center">
            <h1 className="flex max-w-[760px] items-baseline gap-3 overflow-visible pr-[0.22em] pb-[0.32em] text-[clamp(3.25rem,8vw,6.25rem)] leading-[1.22] font-semibold tracking-[-0.06em]">
              <span className="pr-[0.04em] pb-[0.04em] text-transparent [background-image:linear-gradient(135deg,var(--foreground)_0%,color-mix(in_oklab,var(--accent)_60%,var(--foreground))_52%,var(--muted)_100%)] [background-size:100%_100%] bg-clip-text">
                {project.name}
              </span>
              <TerminalSquare className="translate-y-[-0.04em] size-[0.48em] shrink-0 text-[color:color-mix(in_oklab,var(--accent)_58%,var(--foreground))] opacity-90" />
            </h1>

            <div className="mt-10 w-full max-w-[920px] pt-2">
              <ThreadComposer
                controls={[
                  {
                    icon:
                      agentKind === "codex" ? (
                        <CodexStatusIcon className="size-4 shrink-0" tone="inactive" />
                      ) : (
                        <Bot className="size-4 text-muted" />
                      ),
                    options: installedAgents.map((agent) => ({
                      id: agent.kind,
                      label: agent.label,
                      icon:
                        agent.kind === "codex" ? (
                          <CodexStatusIcon className="size-4 shrink-0" tone="inactive" />
                        ) : (
                          <Bot className="size-4 text-muted" />
                        ),
                    })),
                    value: agentKind,
                    onChange: (value) => setAgentKind(value as AgentStatus["kind"]),
                  },
                  {
                    options: withCurrentValue(selectedAgent.capabilities.models, model),
                    value: model,
                    onChange: setModel,
                  },
                  ...(availableEfforts.length > 0
                    ? [
                        {
                          icon: <Sparkles className="size-4 text-muted" />,
                          options: availableEfforts.map((value) => ({
                            id: value,
                            label: formatCompactLabel(value),
                          })),
                          value: effort,
                          onChange: setEffort,
                        },
                      ]
                    : []),
                  ...(selectedAgent.capabilities.modes.length === 2
                    ? [
                        {
                          kind: "toggle" as const,
                          icon: <ClipboardList className="size-3.5" />,
                          label: formatCompactLabel(
                            selectedAgent.capabilities.modes.find((m) => m !== "agent") ?? "plan",
                          ),
                          isSelected: mode !== "agent",
                          onChange: (isSelected: boolean) =>
                            setMode(
                              isSelected
                                ? (selectedAgent.capabilities.modes.find((m) => m !== "agent") ??
                                    "plan")
                                : "agent",
                            ),
                        },
                      ]
                    : selectedAgent.capabilities.modes.length > 0
                      ? [
                          {
                            icon: <TerminalSquare className="size-4 text-muted" />,
                            options: selectedAgent.capabilities.modes.map((value) => ({
                              id: value,
                              label: formatCompactLabel(value),
                            })),
                            value: mode,
                            onChange: (value: string) => setMode(value as "agent" | "plan"),
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
                          onChange: (selected: boolean) => {
                            if (selected) {
                              setApprovalPolicy("never");
                              setSandboxMode("danger-full-access");
                            } else {
                              setApprovalPolicy(
                                selectedAgent.capabilities.approvalPolicies[0] ?? "",
                              );
                              setSandboxMode(selectedAgent.capabilities.sandboxModes[0] ?? "");
                            }
                          },
                        },
                      ]
                    : []),
                ]}
                placeholder="Ask LightCode anything, @ to add files, / for commands"
                prompt={prompt}
                submitDisabled={prompt.trim().length === 0}
                submitLabel="Launch thread"
                onPromptChange={setPrompt}
                onSubmit={() =>
                  onStart({
                    agentKind,
                    config: {
                      model,
                      ...(effort ? { effort } : {}),
                      ...(mode ? { mode } : {}),
                      ...(approvalPolicy ? { approvalPolicy } : {}),
                      ...(sandboxMode ? { sandboxMode } : {}),
                    },
                    prompt: prompt.trim(),
                  })
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
