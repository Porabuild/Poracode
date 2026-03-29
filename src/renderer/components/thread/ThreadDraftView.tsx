import { useEffect, useRef, useState } from "react";
import { TerminalSquare } from "lucide-react";
import type {
  AgentStatus,
  Project,
  ProjectDraftConfig,
  ThreadConfig,
} from "../../../shared/contracts";
import { ProviderIcon, getComposerControls } from "../providers";
import { useGitStore } from "../../state/gitStore";
import { BranchSelector, generateWorktreeBranch, type BranchSelection } from "../common";
import { ThreadComposer } from "./ThreadComposer";

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
  return preferred && models.some((m) => m.id === preferred) ? preferred : (models[0]?.id ?? "");
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
  return preferred && policies.some((p) => p.id === preferred) ? preferred : (policies[0]?.id ?? "");
}

function resolveSandboxModeValue(agent: AgentStatus, preferred?: string): string {
  const modes = agent.capabilities.sandboxModes;
  return preferred && modes.some((m) => m.id === preferred) ? preferred : (modes[0]?.id ?? "");
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
    existingWorktreePath?: string;
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
  const [branchSelection, setBranchSelection] = useState<BranchSelection | null>(null);
  const lastAppliedAgentKindRef = useRef<AgentStatus["kind"] | undefined>(undefined);

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

  const factory = getComposerControls(selectedAgent.kind);
  const onConfigPatch = (patch: Partial<ThreadConfig>) => {
    if (patch.model !== undefined) setModel(patch.model);
    if (patch.effort !== undefined) setEffort(patch.effort);
    if (patch.mode !== undefined) setMode(patch.mode as "agent" | "plan");
    if (patch.approvalPolicy !== undefined) setApprovalPolicy(patch.approvalPolicy);
    if (patch.sandboxMode !== undefined) setSandboxMode(patch.sandboxMode);
  };

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
                  ...(factory
                    ? factory({
                        capabilities: selectedAgent.capabilities,
                        config: { model, effort, mode, approvalPolicy, sandboxMode },
                        isDisabled: false,
                        onConfigChange: onConfigPatch,
                      })
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
                      ? branchSelection.worktreePath
                        ? {
                            existingWorktreePath: branchSelection.worktreePath,
                            worktreeBranch: branchSelection.branch,
                          }
                        : {
                            worktreeBranch: generateWorktreeBranch(),
                            ...(branchSelection.baseBranch
                              ? { worktreeBaseBranch: branchSelection.baseBranch }
                              : {}),
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
