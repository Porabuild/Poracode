import { useState } from "react";
import { useShallow } from "zustand/shallow";
import { Button, Label, Modal } from "@heroui/react";
import { FlaskConical, Loader2, Plus, X } from "lucide-react";
import type { AgentStatus, Project, PromptSegment, ThreadConfig } from "@/shared/contracts";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import { useAppStore } from "@/renderer/state/appStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { useExperimentLauncherStore } from "@/renderer/state/experimentLauncherStore";
import {
  launchExperiment,
  resolveProjectBaseBranch,
  type ExperimentCandidateSpec,
} from "@/renderer/actions/experimentActions";

interface CandidateDraft {
  agentKind: string;
  model: string;
  baseConfig: ThreadConfig | null;
}

export function NewExperimentModal() {
  const { open, projectId, initialPrompt, initialSegments, initialCandidate, sessionId, close } =
    useExperimentLauncherStore(
      useShallow((s) => ({
        open: s.open,
        projectId: s.projectId,
        initialPrompt: s.initialPrompt,
        initialSegments: s.initialSegments,
        initialCandidate: s.initialCandidate,
        sessionId: s.sessionId,
        close: s.close,
      })),
    );

  return (
    <Modal.Backdrop
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-xl">
          {open && projectId ? (
            <NewExperimentModalInner
              key={sessionId}
              projectId={projectId}
              initialPrompt={initialPrompt}
              initialSegments={initialSegments}
              initialCandidate={initialCandidate}
              onClose={close}
            />
          ) : null}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function defaultModelForAgent(agent: AgentStatus | undefined): string {
  return agent?.capabilities.models[0]?.id ?? "";
}

function defaultConfigForAgent(agent: AgentStatus | undefined, model: string): ThreadConfig {
  const caps = agent?.capabilities;
  return {
    model,
    ...(caps?.defaultEffort ? { effort: caps.defaultEffort } : {}),
    ...(caps?.defaultApprovalPolicy ? { approvalPolicy: caps.defaultApprovalPolicy } : {}),
    ...(caps?.defaultSandboxMode ? { sandboxMode: caps.defaultSandboxMode } : {}),
    ...(caps?.defaultContextSize ? { contextSize: caps.defaultContextSize } : {}),
  };
}

function NewExperimentModalInner(props: {
  projectId: string;
  initialPrompt: string;
  initialSegments: PromptSegment[];
  initialCandidate: { agentKind: string; config?: ThreadConfig; model?: string } | null;
  onClose: () => void;
}) {
  const project = useAppStore(
    useShallow((s) => s.projects.find((p) => p.id === props.projectId)),
  ) as Project | undefined;

  const agents = useAgentStatusesStore(
    useShallow((s) =>
      project ? getProjectAgentStatuses(project.location, s.agentStatuses, s.wslAgentStatuses) : [],
    ),
  );
  const installedAgents = agents.filter((a) => a.installed && a.capabilities.models.length > 0);

  const branchList = useGitStore((s) => s.branches[props.projectId]);
  const localBranches = branchList?.branches.map((b) => b.name) ?? [];

  const agentByKind = (kind: string): AgentStatus | undefined =>
    installedAgents.find((a) => a.kind === kind);

  const [prompt, setPrompt] = useState(props.initialPrompt);
  const [baseBranch, setBaseBranch] = useState(
    () => resolveProjectBaseBranch(props.projectId) ?? branchList?.current ?? "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [candidates, setCandidates] = useState<CandidateDraft[]>(() => {
    if (installedAgents.length === 0) return [];
    const seedKind =
      props.initialCandidate && agentByKind(props.initialCandidate.agentKind)
        ? props.initialCandidate.agentKind
        : installedAgents[0]!.kind;
    const seedAgent = agentByKind(seedKind);
    const first: CandidateDraft = {
      agentKind: seedKind,
      model:
        props.initialCandidate?.config?.model ??
        props.initialCandidate?.model ??
        defaultModelForAgent(seedAgent),
      baseConfig: props.initialCandidate?.config ?? null,
    };
    // Seed a second row to nudge toward an actual fan-out: a different provider
    // when one is installed, otherwise the same agent again (a "voting" run).
    const secondAgent = installedAgents.find((a) => a.kind !== seedKind) ?? seedAgent;
    const second: CandidateDraft = {
      agentKind: secondAgent?.kind ?? seedKind,
      model: defaultModelForAgent(secondAgent),
      baseConfig: null,
    };
    return [first, second];
  });

  function updateCandidate(idx: number, patch: Partial<CandidateDraft>) {
    setCandidates((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  function changeAgent(idx: number, agentKind: string) {
    updateCandidate(idx, {
      agentKind,
      model: defaultModelForAgent(agentByKind(agentKind)),
      baseConfig: null,
    });
  }

  function addCandidate() {
    const agent = installedAgents[0];
    if (!agent) return;
    setCandidates((prev) => [
      ...prev,
      { agentKind: agent.kind, model: defaultModelForAgent(agent), baseConfig: null },
    ]);
  }

  function removeCandidate(idx: number) {
    setCandidates((prev) => prev.filter((_, i) => i !== idx));
  }

  const canLaunch =
    !!project &&
    prompt.trim().length > 0 &&
    candidates.length >= 2 &&
    candidates.every((c) => {
      const agent = agentByKind(c.agentKind);
      return !!agent && agent.capabilities.models.some((m) => m.id === c.model);
    }) &&
    !submitting;

  async function handleLaunch() {
    if (!project || !canLaunch) return;
    const trimmedPrompt = prompt.trim();
    const segments =
      props.initialSegments.length > 0 && trimmedPrompt === props.initialPrompt.trim()
        ? props.initialSegments
        : undefined;
    const specs: ExperimentCandidateSpec[] = candidates.map((c) => {
      const agent = agentByKind(c.agentKind);
      const caps = agent?.capabilities;
      const defaults = defaultConfigForAgent(agent, c.model);
      return {
        agentKind: c.agentKind,
        ...(agent ? { agentLabel: agent.label } : {}),
        config: {
          ...defaults,
          ...(c.baseConfig ?? {}),
          model: c.model,
        },
        ...(caps ? { presentationMode: caps.presentationMode } : {}),
      };
    });
    setSubmitting(true);
    try {
      const id = await launchExperiment({
        project,
        prompt: trimmedPrompt,
        ...(segments ? { segments } : {}),
        ...(baseBranch ? { baseBranch } : {}),
        candidates: specs,
      });
      if (id) props.onClose();
    } finally {
      setSubmitting(false);
    }
  }

  const selectClass =
    "rounded-md border border-[var(--hairline)] bg-transparent px-2 py-1 text-sm outline-none";

  return (
    <>
      <Modal.CloseTrigger />
      <Modal.Header>
        <Modal.Heading>
          <span className="flex items-center gap-2">
            <FlaskConical className="size-4 text-amber-500" />
            New experiment
          </span>
        </Modal.Heading>
        <p className="mt-1 text-xs text-muted">
          Fan one prompt out across multiple agents, then compare and merge the winner.
        </p>
      </Modal.Header>
      <Modal.Body className="flex flex-col gap-4 p-4">
        {installedAgents.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            No installed agents with selectable models for this project.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-muted">Prompt</Label>
              <textarea
                // eslint-disable-next-line jsx-a11y/no-autofocus -- desktop modal, expected UX
                autoFocus
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                placeholder="Describe the task to fan out across agents…"
                className="resize-y rounded-md border border-[var(--hairline)] bg-transparent px-2.5 py-2 text-sm outline-none focus:border-amber-400/60"
              />
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-xs font-medium text-muted">Fork from</Label>
              {localBranches.length > 0 ? (
                <select
                  aria-label="Base branch"
                  value={baseBranch}
                  onChange={(e) => setBaseBranch(e.target.value)}
                  className={`flex-1 ${selectClass}`}
                >
                  {!localBranches.includes(baseBranch) && baseBranch && (
                    <option value={baseBranch}>{baseBranch}</option>
                  )}
                  {localBranches.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="flex-1 font-mono text-sm text-foreground/80">
                  {baseBranch || "current branch"}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted">
                Candidates ({candidates.length})
              </Label>
              {candidates.map((candidate, idx) => {
                const agent = agentByKind(candidate.agentKind);
                const models = agent?.capabilities.models ?? [];
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-2 rounded-md border border-[var(--hairline)] px-2 py-1.5"
                  >
                    <select
                      aria-label="Agent"
                      value={candidate.agentKind}
                      onChange={(e) => changeAgent(idx, e.target.value)}
                      className={selectClass}
                    >
                      {installedAgents.map((a) => (
                        <option key={a.kind} value={a.kind}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Model"
                      value={candidate.model}
                      onChange={(e) => updateCandidate(idx, { model: e.target.value })}
                      className={`min-w-0 flex-1 ${selectClass}`}
                    >
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      aria-label="Remove candidate"
                      disabled={candidates.length <= 1}
                      onClick={() => removeCandidate(idx)}
                      className="shrink-0 rounded p-1 text-muted/60 transition-colors hover:bg-[var(--row-hover)] hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={addCandidate}
                className="inline-flex w-fit items-center gap-1 rounded-md border border-dashed border-[var(--hairline)] px-2 py-1 text-xs text-muted transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
              >
                <Plus className="size-3" />
                Add candidate
              </button>
            </div>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button slot="close" variant="ghost" className="text-muted">
          Cancel
        </Button>
        <Button
          variant="tertiary"
          isDisabled={!canLaunch}
          isPending={submitting}
          onPress={() => void handleLaunch()}
        >
          {submitting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <FlaskConical className="size-3.5" />
          )}
          Run experiment
        </Button>
      </Modal.Footer>
    </>
  );
}
