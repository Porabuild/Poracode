import { useEffect, useState } from "react";
import { useShallow } from "zustand/shallow";
import { Tooltip } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Crown, FlaskConical, LayoutGrid, Loader2, Trash2, X } from "lucide-react";
import { isThreadTurnActive } from "@/shared/contracts";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import {
  createExperimentCandidatePr,
  discardExperiment,
  isEligibleExperimentJudgeAgent,
  mergeExperimentWinner,
  retryExperimentCleanup,
  setManualExperimentCrown,
} from "@/renderer/actions/experimentActions";
import { formatModelConfigLabel } from "@/renderer/components/providers/modelDisplay";
import { openThread } from "@/renderer/actions/threadActions";
import { Button } from "@/renderer/components/common/Button";
import { ConfirmDialog } from "@/renderer/components/common/ConfirmDialog";
import { macosTrafficLightPadClass } from "@/renderer/components/layout/sidebarChrome";
import { useAppStore } from "@/renderer/state/appStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useThreadLiveWorkflowStore } from "@/renderer/state/threadLiveWorkflowStore";
import { HomeView } from "@/renderer/views/HomeView";
import { ExperimentCandidateCard } from "./parts/ExperimentCandidateCard";
import { ExperimentPromptSection } from "./parts/ExperimentPromptSection";
import { ExperimentJudgeDialog } from "./parts/ExperimentJudgeDialog";
import { ExperimentJudgeRunDialog } from "./parts/ExperimentJudgeRunDialog";
import { useExperimentJudgeRun } from "./parts/useExperimentJudgeRun";

type Operation = "crown" | "merge" | "cleanup" | "discard" | "pr";
type Confirmation = { kind: "merge" } | { kind: "discard" } | null;

export function ExperimentView(props: { experimentId: string }) {
  const { t } = useLingui();
  const experiment = useExperimentStore((state) => state.experiments[props.experimentId]);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const project = useAppStore((state) =>
    experiment
      ? state.projects.find((candidate) => candidate.id === experiment.projectId)
      : undefined,
  );
  const disabledAgents = useSharedSettings((state) => state.disabledAgents);
  const projectAgents = useAgentStatusesStore(
    useShallow((state) =>
      project
        ? getProjectAgentStatuses(project.location, state.agentStatuses, state.wslAgentStatuses)
        : [],
    ),
  );
  const judgeAgents = projectAgents.filter((agent) =>
    isEligibleExperimentJudgeAgent(agent, disabledAgents),
  );
  const hasActiveTurn = useAppStore((state) =>
    experiment
      ? state.threads.some(
          (thread) =>
            experiment.candidates.some((candidate) => candidate.threadId === thread.id) &&
            isThreadTurnActive(thread.status),
        )
      : false,
  );
  const hasLiveWorkflow = useThreadLiveWorkflowStore((state) =>
    experiment
      ? experiment.candidates.some((candidate) => state.liveThreadIds.has(candidate.threadId))
      : false,
  );
  const hasActiveCandidate = hasActiveTurn || hasLiveWorkflow;
  const hasCleanupPending =
    experiment?.status === "decided" &&
    experiment.candidates.some((candidate) => candidate.worktreeState !== "removed");

  const hasAvailableJudge = judgeAgents.length > 0;
  const judge = useExperimentJudgeRun({
    experiment,
    judgeAgents,
    projectAgents,
    runCrown: (action) => void performOperation("crown", action),
  });

  useEffect(() => {
    if (!experiment) return;
    const threadById = new Map(
      useAppStore.getState().threads.map((thread) => [thread.id, thread] as const),
    );
    const nextTitles = new Map<string, string>();
    for (const candidate of experiment.candidates) {
      const thread = threadById.get(candidate.threadId);
      const provider = candidate.agentLabel ?? candidate.agentKind;
      const model = formatModelConfigLabel(
        projectAgents.find((agent) => agent.kind === candidate.agentKind),
        candidate,
      );
      if (model && thread?.title === `${provider} · ${model}`) {
        nextTitles.set(thread.id, `${model} · ${provider}`);
      }
    }
    if (nextTitles.size > 0) {
      useAppStore.setState((state) => ({
        threads: state.threads.map((thread) => {
          const title = nextTitles.get(thread.id);
          return title ? { ...thread, title } : thread;
        }),
      }));
    }
  }, [experiment, projectAgents]);

  if (!experiment) return <HomeView />;

  const exp = experiment;
  const candidates = exp.candidates;
  const decided = exp.status === "decided";
  const crownThreadId = exp.crown?.threadId;
  const crownedCandidate = candidates.find((candidate) => candidate.threadId === crownThreadId);
  const hasAiResults = exp.crown?.source === "ai";
  const operationLocked = operation !== null;

  async function performOperation(kind: Operation, action: () => void | Promise<void>) {
    if (operation) return;
    setOperation(kind);
    try {
      await action();
    } finally {
      setOperation(null);
    }
  }

  function confirmMerge() {
    setConfirmation(null);
    void performOperation("merge", async () => {
      await mergeExperimentWinner(exp.id);
    });
  }

  function confirmDiscard() {
    setConfirmation(null);
    void performOperation("discard", async () => {
      await discardExperiment(exp.id);
    });
  }

  const loserCount = Math.max(candidates.length - 1, 0);
  const mergeTarget = exp.baseBranch;
  const crownedProvider = crownedCandidate?.agentLabel ?? crownedCandidate?.agentKind;
  const crownedModel = crownedCandidate
    ? formatModelConfigLabel(
        projectAgents.find((agent) => agent.kind === crownedCandidate.agentKind),
        crownedCandidate,
      )
    : "";
  const crownedLabel = crownedModel
    ? `${crownedModel} · ${crownedProvider}`
    : (crownedProvider ?? t`the winner`);

  return (
    <div className="flex h-full flex-col">
      <div
        className={`poracode-content-over-drag-region ${macosTrafficLightPadClass} h-[env(titlebar-area-height,32px)] shrink-0 px-3`}
      >
        <div className="mx-auto flex h-full max-w-4xl items-center gap-2">
          <FlaskConical className="size-3.5 shrink-0 text-muted" />
          <span className="truncate text-xs font-medium">{exp.title}</span>
          <span className="shrink-0 rounded-full bg-surface-secondary px-1.5 py-0.5 text-[10px] text-muted">
            <Plural value={candidates.length} one="# candidate" other="# candidates" />
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              size="sm"
              variant="tertiary"
              className="h-7 px-2 text-xs"
              isDisabled={candidates.length < 2 || operation === "merge" || operation === "discard"}
              onPress={() => useAppStore.getState().openGroupGrid(exp.id)}
            >
              <LayoutGrid className="size-3.5" />
              <Trans>Open All</Trans>
            </Button>
            {hasAiResults ? (
              <Button
                size="sm"
                variant="tertiary"
                className="h-7 px-2.5 text-xs"
                isDisabled={operation === "crown"}
                onPress={judge.openResults}
              >
                <Crown className="size-3" />
                <Trans>Results</Trans>
              </Button>
            ) : null}
            {!decided ? (
              <Tooltip delay={300}>
                <Tooltip.Trigger>
                  <Button
                    size="sm"
                    variant="tertiary"
                    className="h-7 px-2.5 text-xs"
                    isDisabled={
                      operationLocked ||
                      hasActiveCandidate ||
                      candidates.length < 2 ||
                      !hasAvailableJudge
                    }
                    isPending={operation === "crown"}
                    onPress={judge.open}
                  >
                    {operation === "crown" ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Crown className="size-3" />
                    )}
                    {operation === "crown" ? <Trans>Judging…</Trans> : <Trans>Crown with AI</Trans>}
                  </Button>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  {!hasAvailableJudge ? (
                    <Trans>None of these agents can run the AI comparison.</Trans>
                  ) : hasActiveCandidate ? (
                    <Trans>Wait for every candidate to finish before judging.</Trans>
                  ) : (
                    <Trans>Let an AI judge compare the candidate changes.</Trans>
                  )}
                </Tooltip.Content>
              </Tooltip>
            ) : null}
            {decided && hasCleanupPending ? (
              <Button
                size="sm"
                variant="secondary"
                className="h-6 px-2 text-xs"
                isDisabled={operationLocked || hasActiveCandidate}
                isPending={operation === "cleanup"}
                onPress={() =>
                  void performOperation("cleanup", async () => {
                    await retryExperimentCleanup(exp.id);
                  })
                }
              >
                <Trans>Retry cleanup</Trans>
              </Button>
            ) : null}
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              isDisabled={operation === "discard"}
              aria-label={t`Discard experiment`}
              className="size-6 min-w-0 text-muted hover:text-danger"
              onPress={() => setConfirmation({ kind: "discard" })}
            >
              <Trash2 className="size-3.5" />
            </Button>
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              isDisabled={operation === "merge" || operation === "discard"}
              aria-label={t`Close experiment`}
              className="size-6 min-w-0 text-muted"
              onPress={() => useAppStore.getState().openHome()}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mx-auto flex max-w-4xl flex-col gap-3">
          <ExperimentPromptSection
            prompt={exp.prompt}
            {...(exp.segments ? { segments: exp.segments } : {})}
            baseBranch={exp.baseBranch}
          />

          {decided ? (
            <div
              className={`rounded-lg border px-3 py-2 text-sm ${
                hasCleanupPending
                  ? "border-warning/40 bg-warning/5 text-warning"
                  : "border-success/40 bg-success/5 text-success"
              }`}
            >
              {hasCleanupPending ? (
                <Trans>Some losing worktrees could not be removed.</Trans>
              ) : (
                <Trans>Winner merged.</Trans>
              )}
            </div>
          ) : null}

          <div className="divide-y divide-[var(--hairline)] overflow-hidden rounded-xl border border-[var(--hairline)] bg-surface-secondary/30">
            {candidates.map((candidate, index) => {
              const candidateAgent = projectAgents.find(
                (agent) => agent.kind === candidate.agentKind,
              );
              const configLabel = formatModelConfigLabel(candidateAgent, candidate);
              return (
                <ExperimentCandidateCard
                  key={candidate.threadId}
                  candidate={candidate}
                  candidateNumber={index + 1}
                  baseCommit={exp.baseCommit}
                  configLabel={configLabel}
                  isCrowned={crownThreadId === candidate.threadId}
                  isWinner={exp.winnerThreadId === candidate.threadId}
                  decided={decided}
                  operationLocked={operationLocked}
                  hasActiveCandidate={hasActiveCandidate}
                  isCreatingPr={operation === "pr"}
                  isMerging={operation === "merge"}
                  onOpen={() => openThread(candidate.threadId)}
                  onCrown={() =>
                    void performOperation("crown", () =>
                      setManualExperimentCrown(exp.id, candidate.threadId),
                    )
                  }
                  onMerge={() => setConfirmation({ kind: "merge" })}
                  onCreatePr={() =>
                    void performOperation("pr", async () => {
                      await createExperimentCandidatePr(exp.id, candidate.threadId);
                    })
                  }
                />
              );
            })}
          </div>
        </div>
      </div>

      {judge.config ? (
        <ExperimentJudgeDialog
          agents={judgeAgents}
          config={judge.config}
          onChange={judge.setConfig}
          onConfirm={judge.confirm}
          onClose={() => judge.setConfig(null)}
        />
      ) : null}

      {judge.run ? (
        <ExperimentJudgeRunDialog
          run={judge.run}
          onCancel={judge.cancel}
          onClose={() => judge.setRun(null)}
        />
      ) : null}

      <ConfirmDialog
        isOpen={confirmation?.kind === "merge"}
        title={t`Merge experiment winner?`}
        confirmLabel={t`Merge winner`}
        confirmVariant="primary"
        status="warning"
        body={
          <div className="space-y-2 text-sm text-muted">
            <p>
              <Trans>
                Merge {crownedLabel}'s changes into {mergeTarget}?
              </Trans>
            </p>
            {loserCount > 0 ? (
              <p>
                <Trans>
                  Losing worktrees and branches will be removed. Their session history will remain.
                </Trans>
              </p>
            ) : null}
          </div>
        }
        onConfirm={confirmMerge}
        onClose={() => setConfirmation(null)}
      />

      <ConfirmDialog
        isOpen={confirmation?.kind === "discard"}
        title={t`Discard experiment?`}
        confirmLabel={t`Discard experiment`}
        body={
          <p className="text-sm text-muted">
            <Trans>All candidate sessions, worktrees, and branches will be removed.</Trans>
          </p>
        }
        onConfirm={confirmDiscard}
        onClose={() => setConfirmation(null)}
      />
    </div>
  );
}
