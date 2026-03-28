import { useState } from "react";
import { ClipboardList, ShieldOff, Sparkles, TerminalSquare } from "lucide-react";
import type {
  AgentStatus,
  Project,
  ProjectDraftConfig,
  ThreadConfig,
} from "../../../shared/contracts";
import { ProviderIcon } from "../providers";
import { ThreadComposer } from "./ThreadComposer";
import { formatCompactLabel, modelOptions } from "./threadComposerOptions";

export function ThreadDraftView(props: {
  project: Project;
  agentStatuses: AgentStatus[];
  lastDraftConfig?: ProjectDraftConfig;
  onStart: (input: {
    agentKind: AgentStatus["kind"];
    config: ThreadConfig;
    prompt: string;
  }) => void;
}) {
  const { project, agentStatuses, lastDraftConfig, onStart } = props;
  const installedAgents = agentStatuses.filter((status) => status.installed);
  const defaultAgent = lastDraftConfig
    ? (installedAgents.find((a) => a.kind === lastDraftConfig.agentKind) ?? installedAgents[0])
    : installedAgents[0];
  const [agentKind, setAgentKind] = useState<AgentStatus["kind"]>(defaultAgent?.kind ?? "codex");
  const selectedAgent =
    installedAgents.find((status) => status.kind === agentKind) ?? installedAgents[0];
  const [model, setModel] = useState(() => {
    const saved = lastDraftConfig?.model;
    const models = selectedAgent?.capabilities.models ?? [];
    return saved && models.includes(saved) ? saved : (models[0] ?? "");
  });
  const [effort, setEffort] = useState(() => {
    const saved = lastDraftConfig?.effort;
    const efforts = selectedAgent?.capabilities.efforts ?? [];
    if (saved && efforts.includes(saved)) return saved;
    const fallback = selectedAgent?.capabilities.defaultEffort;
    return fallback && efforts.includes(fallback) ? fallback : (efforts[0] ?? "");
  });
  const [mode, setMode] = useState(() => {
    const saved = lastDraftConfig?.mode;
    const modes = selectedAgent?.capabilities.modes ?? [];
    return saved && modes.includes(saved) ? saved : (modes[0] ?? "agent");
  });
  const [approvalPolicy, setApprovalPolicy] = useState(() => {
    const saved = lastDraftConfig?.approvalPolicy;
    const policies = selectedAgent?.capabilities.approvalPolicies ?? [];
    return saved && policies.includes(saved) ? saved : (policies[0] ?? "");
  });
  const [sandboxMode, setSandboxMode] = useState(() => {
    const saved = lastDraftConfig?.sandboxMode;
    const modes = selectedAgent?.capabilities.sandboxModes ?? [];
    return saved && modes.includes(saved) ? saved : (modes[0] ?? "");
  });
  const [prompt, setPrompt] = useState("");

  const availableEfforts =
    selectedAgent?.capabilities.modelEfforts?.[model] ?? selectedAgent?.capabilities.efforts ?? [];

  const [lastResetAgentKind, setLastResetAgentKind] = useState(agentKind);
  const [wasAgentResolved, setWasAgentResolved] = useState(!!selectedAgent);
  const needsAgentReset =
    selectedAgent && (agentKind !== lastResetAgentKind || (!wasAgentResolved && !lastDraftConfig));
  if (needsAgentReset) {
    setLastResetAgentKind(agentKind);
    if (!wasAgentResolved) setWasAgentResolved(true);
    setModel(selectedAgent.capabilities.models[0] ?? "");
    setEffort(
      selectedAgent.capabilities.defaultEffort ?? selectedAgent.capabilities.efforts[0] ?? "",
    );
    setMode(selectedAgent.capabilities.modes[0] ?? "agent");
    setApprovalPolicy(selectedAgent.capabilities.approvalPolicies[0] ?? "");
    setSandboxMode(selectedAgent.capabilities.sandboxModes[0] ?? "");
  }

  const [lastResetModel, setLastResetModel] = useState(model);
  if (model !== lastResetModel) {
    setLastResetModel(model);
    if (availableEfforts.length > 0 && !availableEfforts.includes(effort)) {
      setEffort(availableEfforts[0] ?? "");
    }
  }

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
  const isFullAccess = approvalPolicy === "never" && sandboxMode === "danger-full-access";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-full min-h-0 flex-col px-8 py-8">
        <div className="mx-auto flex h-full w-full max-w-[1040px] flex-col">
          <div className="flex flex-1 flex-col items-center justify-center">
            <div className="w-full max-w-[920px] overflow-visible pb-[0.32em] text-center">
              <h1 className="inline-flex items-baseline gap-3 text-[clamp(3.25rem,8vw,6.25rem)] leading-[1.22] font-semibold tracking-[-0.06em]">
                <span className="pr-[0.04em] pb-[0.04em] text-transparent [background-image:linear-gradient(135deg,var(--foreground)_0%,color-mix(in_oklab,var(--accent)_60%,var(--foreground))_52%,var(--muted)_100%)] [background-size:100%_100%] bg-clip-text">
                  Lightcode
                </span>
                <TerminalSquare className="translate-y-[-0.04em] size-[0.48em] shrink-0 text-[color:color-mix(in_oklab,var(--accent)_58%,var(--foreground))] opacity-90" />
              </h1>
              <p className="mx-auto mt-1 max-w-full truncate text-[clamp(1.25rem,3vw,2rem)] leading-snug font-medium tracking-tight text-transparent [background-image:linear-gradient(135deg,var(--muted)_0%,color-mix(in_oklab,var(--accent)_30%,var(--muted))_100%)] [background-size:100%_100%] bg-clip-text font-mono">
                {project.name}
              </p>
            </div>

            <div className="mt-36 w-full max-w-[920px]">
              <ThreadComposer
                autoFocus // eslint-disable-line jsx-a11y/no-autofocus -- desktop app, expected UX
                controls={[
                  {
                    icon: (
                      <ProviderIcon kind={agentKind} tone="inactive" className="size-4 shrink-0" />
                    ),
                    options: installedAgents.map((agent) => ({
                      id: agent.kind,
                      label: agent.label,
                      icon: (
                        <ProviderIcon
                          kind={agent.kind}
                          tone="inactive"
                          className="size-4 shrink-0"
                        />
                      ),
                    })),
                    value: agentKind,
                    onChange: (value) => setAgentKind(value as AgentStatus["kind"]),
                  },
                  {
                    options: modelOptions(selectedAgent.capabilities.models, model, agentKind),
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
                  ...(selectedAgent.capabilities.approvalPolicies.length > 2
                    ? [
                        {
                          icon: <ShieldOff className="size-3.5" />,
                          options: selectedAgent.capabilities.approvalPolicies.map((value) => ({
                            id: value,
                            label: formatCompactLabel(value),
                          })),
                          value: approvalPolicy,
                          onChange: setApprovalPolicy,
                        },
                      ]
                    : hasPermissions
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
