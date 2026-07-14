import { useEffect, useState } from "react";
import { Card } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Crown, ExternalLink, GitMerge, Loader2 } from "lucide-react";
import type { ExperimentCandidate, GetExperimentCandidateStatsResult } from "@/shared/contracts";
import { buildWorktreeLocation } from "@/shared/worktree";
import { readBridge } from "@/renderer/bridge";
import { Button } from "@/renderer/components/common/Button";
import { ThreadProviderIcon } from "@/renderer/components/providers/ThreadProviderIcon";
import { threadRuntimeStatusLabel } from "@/renderer/components/thread/ThreadHeaderStatus";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { useThreadHasLiveWorkflow } from "@/renderer/state/threadLiveWorkflowStore";
import { useThread } from "@/renderer/state/useThread";

type CandidateStatsState = GetExperimentCandidateStatsResult | "loading" | "unavailable";

export function ExperimentCandidateCard(props: {
  candidate: ExperimentCandidate;
  candidateNumber: number;
  baseCommit: string;
  isCrowned: boolean;
  isWinner: boolean;
  crownRationale?: string;
  crownSource?: "ai" | "user";
  decided: boolean;
  operationLocked: boolean;
  hasActiveCandidate: boolean;
  onOpen: () => void;
  onCrown: () => void;
  onMerge: () => void;
}) {
  const { candidate, isCrowned, isWinner, crownRationale, crownSource, decided } = props;
  const { t } = useLingui();
  const thread = useThread(candidate.threadId);
  const hasLiveWorkflow = useThreadHasLiveWorkflow(candidate.threadId);
  const statusLabel = hasLiveWorkflow
    ? t`Working`
    : thread
      ? threadRuntimeStatusLabel(thread, t)
      : t`Idle`;
  const spinning =
    hasLiveWorkflow || thread?.status === "launching" || thread?.status === "working";
  const projectLocation = useAppStore(
    (state) => state.projects.find((project) => project.id === thread?.projectId)?.location,
  );
  const worktreePath = thread?.worktreePath ?? candidate.worktreePath;
  const worktreeStatus = useGitStore((state) =>
    worktreePath ? state.worktreeStatuses[worktreePath] : undefined,
  );
  const [stats, setStats] = useState<CandidateStatsState>("loading");
  useEffect(() => {
    if (!projectLocation || !worktreePath) {
      setStats(candidate.worktreeState === "pending" ? "loading" : "unavailable");
      return;
    }
    let cancelled = false;
    setStats("loading");
    void readBridge()
      .getExperimentCandidateStats({
        projectLocation: buildWorktreeLocation(projectLocation, worktreePath),
        baseRef: props.baseCommit,
      })
      .then((nextStats) => {
        if (!cancelled) setStats(nextStats);
      })
      .catch(() => {
        if (!cancelled) setStats("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [
    candidate.worktreeState,
    projectLocation,
    props.baseCommit,
    thread?.status,
    worktreePath,
    worktreeStatus,
  ]);
  const label = candidate.agentLabel ?? candidate.agentKind;
  const details = [candidate.model, candidate.effort, candidate.fast ? t`Fast` : undefined].filter(
    (value): value is string => !!value,
  );

  return (
    <Card
      className={`w-full rounded-lg border p-2.5 shadow-none transition-colors ${
        isWinner
          ? "border-success/60 bg-success/5"
          : isCrowned
            ? "border-accent/50 bg-accent/5"
            : "border-border bg-surface-secondary"
      }`}
    >
      <Card.Header className="flex items-start justify-between gap-3 p-0">
        <div className="flex min-w-0 items-start gap-2">
          {thread ? (
            <ThreadProviderIcon thread={thread} className="mt-0.5 size-4 shrink-0" />
          ) : null}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {isCrowned || isWinner ? (
                <Crown className="size-3.5 shrink-0 text-accent" aria-label={t`Crowned`} />
              ) : null}
              <Card.Title className="truncate text-sm font-medium">{label}</Card.Title>
            </div>
            {details.length > 0 ? (
              <Card.Description className="truncate text-xs text-muted">
                {details.join(" · ")}
              </Card.Description>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-muted">
          {spinning ? <Loader2 className="size-3 animate-spin text-warning" /> : null}
          <span>{statusLabel}</span>
        </div>
      </Card.Header>

      <div className="mt-2 flex min-h-5 items-center gap-2 whitespace-nowrap text-xs">
        {typeof stats === "object" && stats.files > 0 ? (
          <>
            <span className="font-mono text-success">+{stats.insertions}</span>
            <span className="font-mono text-danger">−{stats.deletions}</span>
            <span className="text-muted">
              <Plural value={stats.files} one="# file" other="# files" />
            </span>
          </>
        ) : typeof stats === "object" ? (
          <span className="text-muted">
            <Trans>No changes yet</Trans>
          </span>
        ) : stats === "unavailable" ? (
          <span className="text-muted">
            <Trans>Changes unavailable</Trans>
          </span>
        ) : (
          <span className="text-muted">
            <Trans>Computing changes…</Trans>
          </span>
        )}
      </div>

      <div className="mt-0.5 truncate font-mono text-[10px] text-muted/70">
        {candidate.worktreeBranch}
      </div>

      {isCrowned && (crownSource === "user" || crownRationale) ? (
        <div className="mt-2 rounded-md bg-accent/10 px-2 py-1.5 text-xs text-accent-foreground">
          <span className="font-medium">
            {crownSource === "user" ? <Trans>Your pick</Trans> : <Trans>AI judge</Trans>}
          </span>
          {crownSource === "ai" && crownRationale ? `: ${crownRationale}` : null}
        </div>
      ) : null}

      <Card.Footer className="mt-2 flex items-center gap-1.5 p-0">
        <Button
          size="sm"
          variant="secondary"
          className="h-7 px-2 text-xs"
          aria-label={t`Open candidate ${props.candidateNumber}: ${label}`}
          isDisabled={props.operationLocked}
          onPress={props.onOpen}
        >
          <ExternalLink className="size-3.5" />
          <Trans>Open</Trans>
        </Button>
        {!decided ? (
          <Button
            size="sm"
            variant="secondary"
            className={`h-7 px-2 text-xs ${isCrowned ? "text-accent" : ""}`}
            aria-label={t`Select candidate ${props.candidateNumber} (${label}) as winner`}
            isDisabled={props.operationLocked || props.hasActiveCandidate}
            onPress={props.onCrown}
          >
            <Crown className="size-3.5" />
            {isCrowned ? <Trans>Crowned</Trans> : <Trans>Crown</Trans>}
          </Button>
        ) : null}
        {!decided && isCrowned ? (
          <Button
            size="sm"
            variant="tertiary"
            aria-label={t`Merge candidate ${props.candidateNumber} (${label}) as experiment winner`}
            className="ml-auto h-7 px-2.5 text-xs"
            isDisabled={props.operationLocked || props.hasActiveCandidate}
            onPress={props.onMerge}
          >
            <GitMerge className="size-3.5" />
            <Trans>Merge winner</Trans>
          </Button>
        ) : null}
        {isWinner ? (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-success">
            <GitMerge className="size-3.5" />
            <Trans>Merged</Trans>
          </span>
        ) : null}
      </Card.Footer>
    </Card>
  );
}
