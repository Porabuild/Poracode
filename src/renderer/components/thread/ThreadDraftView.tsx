import { useEffect, useState } from "react";
import { Bot, Shield, Sparkles, TerminalSquare } from "lucide-react";
import type { AgentStatus, Project, ThreadConfig } from "../../../shared/contracts";
import { ThreadComposer } from "./ThreadComposer";
import {
  buildPermissionOptions,
  formatCompactLabel,
  withCurrentValue,
} from "./threadComposerOptions";

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

  if (!selectedAgent) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">No supported agents detected</h1>
        <p className="text-muted">Install LightCode CLI or Claude Code CLI to create a thread.</p>
      </div>
    );
  }

  const permissionOptions = buildPermissionOptions(
    selectedAgent.capabilities.approvalPolicies,
    selectedAgent.capabilities.sandboxModes,
  );
  const selectedPermission =
    permissionOptions.find((option) => option.id === `${approvalPolicy}::${sandboxMode}`)?.id ??
    permissionOptions[0]?.id ??
    "";

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
                    icon: <Bot className="size-4 text-muted" />,
                    options: installedAgents.map((agent) => ({
                      id: agent.kind,
                      label: agent.label,
                    })),
                    value: agentKind,
                    onChange: (value) => setAgentKind(value as AgentStatus["kind"]),
                  },
                  ...(selectedAgent.capabilities.modes.length > 0
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
                  {
                    options: withCurrentValue(selectedAgent.capabilities.models, model),
                    value: model,
                    onChange: setModel,
                  },
                  ...(selectedAgent.capabilities.efforts.length > 0
                    ? [
                        {
                          icon: <Sparkles className="size-4 text-muted" />,
                          options: selectedAgent.capabilities.efforts.map((value) => ({
                            id: value,
                            label: formatCompactLabel(value),
                          })),
                          value: effort,
                          onChange: setEffort,
                        },
                      ]
                    : []),
                  ...(permissionOptions.length > 0
                    ? [
                        {
                          icon: <Shield className="size-4 text-muted" />,
                          options: permissionOptions,
                          value: selectedPermission,
                          onChange: (value: string) => {
                            const [nextApprovalPolicy, nextSandboxMode] = String(value).split("::");
                            setApprovalPolicy(nextApprovalPolicy ?? "");
                            setSandboxMode(nextSandboxMode ?? "");
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
