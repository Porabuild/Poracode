import { ButtonGroup, Dropdown, Label } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { ChevronDown, Crown, GitMerge, GitPullRequest, Loader2 } from "lucide-react";
import type { ExperimentCandidate } from "@/shared/contracts";
import { showGitReviewPanel } from "@/renderer/actions/panelActions";
import { Button } from "@/renderer/components/common/Button";
import { ThreadProviderIcon } from "@/renderer/components/providers/ThreadProviderIcon";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { useThreadHasLiveWorkflow } from "@/renderer/state/threadLiveWorkflowStore";
import { useThread } from "@/renderer/state/useThread";
import { getPrStatusTone, PR_TONE_TEXT_CLASS } from "@/renderer/utils/prStatus";
import { useExperimentCandidateStats } from "./useExperimentCandidateStats";

export function ExperimentCandidateCard(props: {
  candidate: ExperimentCandidate;
  candidateNumber: number;
  baseCommit: string;
  configLabel: string;
  isCrowned: boolean;
  isWinner: boolean;
  decided: boolean;
  operationLocked: boolean;
  hasActiveCandidate: boolean;
  isCreatingPr: boolean;
  isMerging: boolean;
  onOpen: () => void;
  onCrown: () => void;
  onMerge: () => void;
  onCreatePr: () => void;
}) {
  const { candidate, isCrowned, isWinner, decided } = props;
  const { t } = useLingui();
  const thread = useThread(candidate.threadId);
  const hasLiveWorkflow = useThreadHasLiveWorkflow(candidate.threadId);
  const isActive =
    hasLiveWorkflow || thread?.status === "launching" || thread?.status === "working";
  const projectId = thread?.projectId;
  const projectLocation = useAppStore(
    (state) => state.projects.find((project) => project.id === projectId)?.location,
  );
  const worktreePath = thread?.worktreePath ?? candidate.worktreePath;
  // gitStore preserves referential equality when status content is unchanged.
  const worktreeStatus = useGitStore((state) =>
    worktreePath ? state.worktreeStatuses[worktreePath] : undefined,
  );
  const pullRequest = useGitStore((state) =>
    worktreePath ? state.prData[worktreePath] : undefined,
  );
  const prNumber = pullRequest?.number ?? thread?.prNumber;
  const hasPullRequest = prNumber !== undefined && pullRequest?.state !== "closed";
  const prIconClass =
    PR_TONE_TEXT_CLASS[getPrStatusTone(pullRequest?.state, pullRequest?.checksStatus)];
  const { stats, isRefreshing: statsRefreshing } = useExperimentCandidateStats({
    projectLocation,
    worktreePath,
    baseCommit: props.baseCommit,
    worktreeState: candidate.worktreeState,
    worktreeStatus,
    isActive,
  });
  const provider = candidate.agentLabel ?? candidate.agentKind;
  const label = props.configLabel || provider;
  const details = props.configLabel ? provider : "";

  const crownIcon =
    isCrowned || isWinner ? (
      <Crown className="size-3.5 shrink-0 text-warning" aria-label={t`Crowned`} />
    ) : null;
  return (
    <div
      className={`group flex items-center gap-3 px-3 py-3 transition-colors hover:bg-default-100/60 ${
        isWinner ? "bg-success/5" : ""
      }`}
    >
      {thread ? (
        <ThreadProviderIcon thread={thread} className="size-4 shrink-0" />
      ) : (
        <span className="block size-4 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            className="truncate text-left text-sm font-medium text-foreground outline-none hover:underline focus-visible:underline"
            aria-label={t`Open candidate ${props.candidateNumber}: ${label}`}
            onClick={props.onOpen}
          >
            {label}
          </button>
          {crownIcon}
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted">
          {details ? (
            <>
              <span className="shrink-0 truncate">{details}</span>
              <span className="text-muted/40">·</span>
            </>
          ) : null}
          <span className="truncate font-mono text-[11px]">{candidate.worktreeBranch}</span>
        </div>
      </div>

      {typeof stats === "object" && stats.files > 0 ? (
        <button
          type="button"
          className="flex shrink-0 cursor-pointer flex-col items-end gap-0.5 rounded px-1.5 py-1 text-right text-[11px] transition-colors hover:bg-[var(--row-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          aria-label={t`Review candidate ${props.candidateNumber} (${label}) changes`}
          onClick={() => {
            if (projectId && worktreePath) showGitReviewPanel(projectId, worktreePath);
          }}
        >
          <span className="flex items-center gap-1 font-medium tabular-nums">
            {statsRefreshing ? (
              <Loader2 className="size-2.5 animate-spin text-muted" aria-hidden />
            ) : null}
            <span className="text-success">+{stats.insertions}</span>
            <span className="text-danger">−{stats.deletions}</span>
          </span>
          <span className="text-muted">
            <Plural value={stats.files} one="# file" other="# files" />
          </span>
        </button>
      ) : typeof stats === "object" ? (
        <span className="shrink-0 text-[11px] text-muted">
          <Trans>No changes yet</Trans>
        </span>
      ) : stats === "unavailable" ? (
        <span className="shrink-0 text-[11px] text-muted">
          <Trans>Changes unavailable</Trans>
        </span>
      ) : null}

      <div className="flex shrink-0 items-center gap-1.5">
        {!decided && !isCrowned ? (
          <Button
            size="sm"
            variant="tertiary"
            className="h-7 px-2 text-xs"
            aria-label={t`Select candidate ${props.candidateNumber} (${label}) as winner`}
            isDisabled={props.operationLocked || props.hasActiveCandidate}
            onPress={props.onCrown}
          >
            <Crown className="size-3.5" />
            <Trans>Crown</Trans>
          </Button>
        ) : null}
        {!decided && isCrowned ? (
          <ButtonGroup>
            {props.isMerging ? (
              <Button
                size="sm"
                variant="primary"
                className="h-7 px-2.5 text-xs"
                aria-label={t`Merge winner`}
                isDisabled
                isPending
              >
                <Loader2 className="size-3.5 animate-spin" />
                <Trans>Merge winner</Trans>
              </Button>
            ) : hasPullRequest ? (
              <Button
                isIconOnly
                size="sm"
                variant="primary"
                className="h-7"
                aria-label={t`Open PR #${prNumber}`}
                isDisabled={props.operationLocked || !projectId || !worktreePath}
                onPress={() => {
                  if (projectId && worktreePath) showGitReviewPanel(projectId, worktreePath);
                }}
              >
                <GitPullRequest className={`size-3.5 ${prIconClass}`} />
              </Button>
            ) : (
              <Button
                size="sm"
                variant="primary"
                className="h-7 px-2.5 text-xs"
                aria-label={t`Create a pull request for candidate ${props.candidateNumber} (${label})`}
                isDisabled={props.operationLocked || props.hasActiveCandidate}
                isPending={props.isCreatingPr}
                onPress={props.onCreatePr}
              >
                {props.isCreatingPr ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <GitPullRequest className="size-3.5" />
                )}
                <Trans>Create PR</Trans>
              </Button>
            )}
            <Dropdown>
              <Button
                isIconOnly
                size="sm"
                variant="primary"
                className="h-7"
                aria-label={t`More actions for candidate ${props.candidateNumber} (${label})`}
                isDisabled={props.operationLocked || props.hasActiveCandidate}
              >
                <ButtonGroup.Separator />
                <ChevronDown className="size-3.5" />
              </Button>
              <Dropdown.Popover placement="bottom end" className="w-64">
                <Dropdown.Menu
                  aria-label={t`Candidate actions`}
                  onAction={(key) => {
                    if (key === "merge") props.onMerge();
                  }}
                >
                  <Dropdown.Item id="merge" textValue={t`Merge winner`}>
                    <GitMerge className="mt-0.5 size-3.5 shrink-0 opacity-60" />
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <Label>
                        <Trans>Merge winner</Trans>
                      </Label>
                      <span className="whitespace-normal text-xs text-muted">
                        <Trans>
                          Merge this candidate's changes into the base branch and remove the other
                          candidates' worktrees.
                        </Trans>
                      </span>
                    </div>
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </ButtonGroup>
        ) : null}
        {isWinner ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
            <GitMerge className="size-3.5" />
            <Trans>Merged</Trans>
          </span>
        ) : null}
      </div>
    </div>
  );
}
