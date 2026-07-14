import { useState, type ReactNode } from "react";
import { useShallow } from "zustand/shallow";
import { Tooltip } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Crown, FlaskConical, LayoutGrid, Loader2, Trash2, X } from "lucide-react";
import { isThreadTurnActive } from "@/shared/contracts";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import {
  crownExperiment,
  discardExperiment,
  mergeExperimentWinner,
  retryExperimentCleanup,
  setManualExperimentCrown,
} from "@/renderer/actions/experimentActions";
import { openThread } from "@/renderer/actions/threadActions";
import { Button } from "@/renderer/components/common/Button";
import { ConfirmDialog } from "@/renderer/components/common/ConfirmDialog";
import { OptionMenu } from "@/renderer/components/common/OptionMenu";
import { macosTrafficLightPadClass } from "@/renderer/components/layout/sidebarChrome";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { useAppStore } from "@/renderer/state/appStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useThreadLiveWorkflowStore } from "@/renderer/state/threadLiveWorkflowStore";
import { HomeView } from "@/renderer/views/HomeView";
import { ExperimentCandidateCard } from "./parts/ExperimentCandidateCard";

type Operation = "crown" | "merge" | "cleanup" | "discard";
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
  const judgeAgents = useAgentStatusesStore(
    useShallow((state) =>
      project
        ? getProjectAgentStatuses(
            project.location,
            state.agentStatuses,
            state.wslAgentStatuses,
          ).filter(
            (agent) =>
              agent.installed &&
              agent.authState !== "missing" &&
              !disabledAgents.includes(agent.kind) &&
              agent.capabilities.supportsTextOnlyOneShot === true,
          )
        : [],
    ),
  );
  const candidateThreads = useAppStore(
    useShallow((state) =>
      experiment
        ? state.threads.filter((thread) =>
            experiment.candidates.some((candidate) => candidate.threadId === thread.id),
          )
        : [],
    ),
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

  const judgeOptions: Array<{
    id: string;
    label: string;
    agentKind: string;
    threadId?: string;
    icon: ReactNode;
  }> = [];
  const seenJudgeConfigs = new Set<string>();
  const candidateAgentKinds = new Set(
    experiment?.candidates.map((candidate) => candidate.agentKind) ?? [],
  );
  for (const agent of judgeAgents) {
    if (candidateAgentKinds.has(agent.kind)) continue;
    judgeOptions.push({
      id: `agent:${agent.kind}`,
      label: agent.label,
      agentKind: agent.kind,
      icon: (
        <ProviderIcon
          kind={agent.kind}
          fallbackLabel={agent.label}
          {...(agent.icon ? { icon: agent.icon } : {})}
          className="size-4"
        />
      ),
    });
  }
  for (const candidate of experiment?.candidates ?? []) {
    const agent = judgeAgents.find((item) => item.kind === candidate.agentKind);
    const thread = candidateThreads.find((item) => item.id === candidate.threadId);
    if (!agent || !thread) continue;
    const configKey = [
      agent.kind,
      thread.config.model,
      thread.config.effort,
      thread.config.fast,
    ].join("\0");
    if (seenJudgeConfigs.has(configKey)) continue;
    seenJudgeConfigs.add(configKey);
    const details = [thread.config.model, thread.config.effort].filter(Boolean).join(" · ");
    judgeOptions.push({
      id: `thread:${thread.id}`,
      label: details ? `${agent.label} · ${details}` : agent.label,
      agentKind: agent.kind,
      threadId: thread.id,
      icon: (
        <ProviderIcon
          kind={agent.kind}
          fallbackLabel={agent.label}
          {...(agent.icon ? { icon: agent.icon } : {})}
          className="size-4"
        />
      ),
    });
  }
  for (const agent of judgeAgents) {
    if (judgeOptions.some((option) => option.agentKind === agent.kind)) continue;
    judgeOptions.push({
      id: `agent:${agent.kind}`,
      label: agent.label,
      agentKind: agent.kind,
      icon: (
        <ProviderIcon
          kind={agent.kind}
          fallbackLabel={agent.label}
          {...(agent.icon ? { icon: agent.icon } : {})}
          className="size-4"
        />
      ),
    });
  }
  const [selectedJudgeId, setSelectedJudgeId] = useState("");
  const selectedJudge =
    judgeOptions.find((option) => option.id === selectedJudgeId) ?? judgeOptions[0];
  const hasAvailableJudge = judgeOptions.length > 0;

  if (!experiment) return <HomeView />;

  const exp = experiment;
  const candidates = exp.candidates;
  const decided = exp.status === "decided";
  const crownThreadId = exp.crown?.threadId;
  const crownedCandidate = candidates.find((candidate) => candidate.threadId === crownThreadId);
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
  const crownedLabel = crownedCandidate?.agentLabel ?? crownedCandidate?.agentKind ?? t`the winner`;

  return (
    <div className="flex h-full flex-col">
      <div
        className={`poracode-content-over-drag-region ${macosTrafficLightPadClass} flex h-[env(titlebar-area-height,32px)] shrink-0 items-center gap-2 border-b border-border px-2`}
      >
        <FlaskConical className="size-3.5 shrink-0 text-muted" />
        <span className="truncate text-xs font-medium">{exp.title}</span>
        <span className="shrink-0 rounded-full bg-surface-secondary px-1.5 py-0.5 text-[10px] text-muted">
          <Plural value={candidates.length} one="# candidate" other="# candidates" />
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 px-2 text-xs"
            isDisabled={candidates.length < 2 || operationLocked}
            onPress={() => useAppStore.getState().openGroupGrid(exp.id)}
          >
            <LayoutGrid className="size-3.5" />
            <Trans>Open All</Trans>
          </Button>
          {!decided ? (
            <div className="flex items-center gap-1">
              <OptionMenu
                value={selectedJudge?.id ?? ""}
                options={judgeOptions}
                onChange={setSelectedJudgeId}
                placeholder={t`AI judge`}
                buttonVariant="tertiary"
                className="h-7 max-w-56 px-2 text-xs"
                isDisabled={operationLocked || hasActiveCandidate || !hasAvailableJudge}
              />
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
                    onPress={() =>
                      void performOperation("crown", async () => {
                        await crownExperiment(
                          exp.id,
                          selectedJudge
                            ? {
                                agentKind: selectedJudge.agentKind,
                                ...(selectedJudge.threadId
                                  ? { threadId: selectedJudge.threadId }
                                  : {}),
                              }
                            : undefined,
                        );
                      })
                    }
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
            </div>
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
            isDisabled={operationLocked || hasActiveCandidate}
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
            isDisabled={operationLocked}
            aria-label={t`Close experiment`}
            className="size-6 min-w-0 text-muted"
            onPress={() => useAppStore.getState().openHome()}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mx-auto flex max-w-7xl flex-col gap-3">
          <div className="rounded-lg border border-border bg-surface-secondary px-3 py-2.5">
            <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
              <Trans>Prompt</Trans>
            </div>
            <p className="whitespace-pre-wrap text-sm text-foreground/90">{exp.prompt}</p>
            <div className="mt-1.5 text-xs text-muted">
              <Trans>
                Forked from <span className="font-mono">{exp.baseBranch}</span>
              </Trans>
            </div>
          </div>

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

          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-2.5">
            {candidates.map((candidate, index) => (
              <ExperimentCandidateCard
                key={candidate.threadId}
                candidate={candidate}
                candidateNumber={index + 1}
                baseCommit={exp.baseCommit}
                isCrowned={crownThreadId === candidate.threadId}
                isWinner={exp.winnerThreadId === candidate.threadId}
                {...(exp.crown?.rationale ? { crownRationale: exp.crown.rationale } : {})}
                {...(exp.crown?.source ? { crownSource: exp.crown.source } : {})}
                decided={decided}
                operationLocked={operationLocked}
                hasActiveCandidate={hasActiveCandidate}
                onOpen={() => openThread(candidate.threadId)}
                onCrown={() =>
                  void performOperation("crown", () =>
                    setManualExperimentCrown(exp.id, candidate.threadId),
                  )
                }
                onMerge={() => setConfirmation({ kind: "merge" })}
              />
            ))}
          </div>
        </div>
      </div>

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
