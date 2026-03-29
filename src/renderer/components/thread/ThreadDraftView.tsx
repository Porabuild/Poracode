import { useEffect, useRef, useState } from "react";
import { ClipboardList, ShieldOff, Sparkles, TerminalSquare } from "lucide-react";
import type {
  AgentStatus,
  Project,
  ProjectDraftConfig,
  ThreadConfig,
} from "../../../shared/contracts";
import { ProviderIcon } from "../providers";
import { useGitStore } from "../../state/gitStore";
import { BranchSelector, generateWorktreeBranch } from "../common";
import { ThreadComposer } from "./ThreadComposer";
import { formatCompactLabel, modelOptions } from "./threadComposerOptions";

function resolvePreferredAgentKind(
  installedAgents: AgentStatus[],
  lastDraftConfig?: ProjectDraftConfig,
): AgentStatus["kind"] | undefined {
  if (lastDraftConfig) {
    const savedAgent = installedAgents.find((agent) => agent.kind === lastDraftConfig.agentKind);
    if (savedAgent) {
      return savedAgent.kind;
    }
  }

  return installedAgents[0]?.kind;
}

function resolveModelValue(agent: AgentStatus, preferred?: string): string {
  const models = agent.capabilities.models;
  return preferred && models.includes(preferred) ? preferred : (models[0] ?? "");
}

function resolveEffortValue(agent: AgentStatus, model: string, preferred?: string): string {
  const efforts = agent.capabilities.modelEfforts?.[model] ?? agent.capabilities.efforts ?? [];
  if (preferred && efforts.includes(preferred)) {
    return preferred;
  }

  const fallback = agent.capabilities.defaultEffort;
  if (fallback && efforts.includes(fallback)) {
    return fallback;
  }

  return efforts[0] ?? "";
}

function resolveModeValue(agent: AgentStatus, preferred?: string): string {
  const modes = agent.capabilities.modes;
  return preferred && modes.includes(preferred as "agent" | "plan")
    ? preferred
    : (modes[0] ?? "agent");
}

function resolveApprovalPolicyValue(agent: AgentStatus, preferred?: string): string {
  const policies = agent.capabilities.approvalPolicies;
  return preferred && policies.includes(preferred) ? preferred : (policies[0] ?? "");
}

function resolveSandboxModeValue(agent: AgentStatus, preferred?: string): string {
  const modes = agent.capabilities.sandboxModes;
  return preferred && modes.includes(preferred) ? preferred : (modes[0] ?? "");
}

function formatAgentList(names: string[]): string {
  if (names.length === 0) return "a supported coding agent";
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")}, or ${names.at(-1)}`;
}

export function ThreadDraftView(props: {
  project: Project;
  agentStatuses: AgentStatus[];
  lastDraftConfig?: ProjectDraftConfig;
  onStart: (input: {
    agentKind: AgentStatus["kind"];
    config: ThreadConfig;
    prompt: string;
    worktreeBranch?: string;
    worktreeBaseBranch?: string;
    worktreeIsNewBranch?: boolean;
  }) => void;
}) {
  const { project, agentStatuses, lastDraftConfig, onStart } = props;
  const gitBranch = useGitStore((s) => s.statuses[project.id]?.branch);
  const installedAgents = agentStatuses.filter((status) => status.installed);
  const preferredAgentKind = resolvePreferredAgentKind(installedAgents, lastDraftConfig);
  const [agentKind, setAgentKind] = useState<AgentStatus["kind"] | undefined>(preferredAgentKind);
  const effectiveAgentKind = installedAgents.some((status) => status.kind === agentKind)
    ? agentKind
    : preferredAgentKind;
  const selectedAgent =
    installedAgents.find((status) => status.kind === effectiveAgentKind) ?? installedAgents[0];
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  const [mode, setMode] = useState<"agent" | "plan">("agent");
  const [approvalPolicy, setApprovalPolicy] = useState("");
  const [sandboxMode, setSandboxMode] = useState("");
  const [prompt, setPrompt] = useState("");
  const [worktreeMode, setWorktreeMode] = useState(false);
  const [branchSelection, setBranchSelection] = useState<{
    branch: string;
    baseBranch?: string;
    isNew: boolean;
    isWorktree: boolean;
  } | null>(null);
  const lastAppliedAgentKindRef = useRef<AgentStatus["kind"] | undefined>(undefined);

  const availableEfforts =
    selectedAgent?.capabilities.modelEfforts?.[model] ?? selectedAgent?.capabilities.efforts ?? [];

  useEffect(() => {
    if (effectiveAgentKind && agentKind !== effectiveAgentKind) {
      setAgentKind(effectiveAgentKind);
    }
  }, [agentKind, effectiveAgentKind]);

  useEffect(() => {
    if (!selectedAgent || !effectiveAgentKind) {
      return;
    }

    if (lastAppliedAgentKindRef.current === effectiveAgentKind) {
      return;
    }

    const restoreSavedDraft =
      lastAppliedAgentKindRef.current === undefined &&
      lastDraftConfig?.agentKind === effectiveAgentKind;
    const nextModel = resolveModelValue(
      selectedAgent,
      restoreSavedDraft ? lastDraftConfig?.model : undefined,
    );

    setModel(nextModel);
    setEffort(
      resolveEffortValue(
        selectedAgent,
        nextModel,
        restoreSavedDraft ? lastDraftConfig?.effort : undefined,
      ),
    );
    setMode(
      resolveModeValue(selectedAgent, restoreSavedDraft ? lastDraftConfig?.mode : undefined) as
        | "agent"
        | "plan",
    );
    setApprovalPolicy(
      resolveApprovalPolicyValue(
        selectedAgent,
        restoreSavedDraft ? lastDraftConfig?.approvalPolicy : undefined,
      ),
    );
    setSandboxMode(
      resolveSandboxModeValue(
        selectedAgent,
        restoreSavedDraft ? lastDraftConfig?.sandboxMode : undefined,
      ),
    );
    lastAppliedAgentKindRef.current = effectiveAgentKind;
  }, [effectiveAgentKind, lastDraftConfig, selectedAgent]);

  useEffect(() => {
    if (!selectedAgent) {
      return;
    }

    const nextEffort = resolveEffortValue(selectedAgent, model, effort);
    if (nextEffort !== effort) {
      setEffort(nextEffort);
    }
  }, [effort, model, selectedAgent]);

  if (!selectedAgent) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">No supported agents detected</h1>
        <p className="text-muted">
          Install {formatAgentList(props.agentStatuses.map((s) => s.label))} to create a thread.
        </p>
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
                      <ProviderIcon
                        kind={selectedAgent.kind}
                        tone="inactive"
                        className="size-4 shrink-0"
                      />
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
                    value: selectedAgent.kind,
                    onChange: (value) => setAgentKind(value as AgentStatus["kind"]),
                  },
                  {
                    options: modelOptions(
                      selectedAgent.capabilities.models,
                      model,
                      selectedAgent.kind,
                    ),
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
                    agentKind: selectedAgent.kind,
                    config: {
                      model,
                      ...(effort ? { effort } : {}),
                      ...(mode ? { mode } : {}),
                      ...(approvalPolicy ? { approvalPolicy } : {}),
                      ...(sandboxMode ? { sandboxMode } : {}),
                    },
                    prompt: prompt.trim(),
                    ...(branchSelection?.isWorktree
                      ? {
                          worktreeBranch: generateWorktreeBranch(),
                          worktreeBaseBranch: branchSelection.baseBranch,
                          worktreeIsNewBranch: true,
                        }
                      : {}),
                  })
                }
                afterControls={
                  gitBranch ? (
                    <BranchSelector
                      projectId={project.id}
                      currentBranch={gitBranch}
                      value={branchSelection?.branch ?? gitBranch}
                      isWorktree={branchSelection?.isWorktree}
                      isNew={branchSelection?.isNew}
                      baseBranch={branchSelection?.baseBranch}
                      worktreeMode={worktreeMode}
                      onWorktreeModeChange={setWorktreeMode}
                      onSelect={setBranchSelection}
                    />
                  ) : undefined
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
