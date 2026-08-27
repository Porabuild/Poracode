import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "@heroui/react";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  FileDiff,
  GitCommit,
  GitMerge,
  Loader2,
  MessageSquare,
  RefreshCw,
  XCircle,
} from "lucide-react";
import type { PrMergeMethod } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { openExternalWithFeedback } from "@/renderer/utils/openExternal";
import { useGitStore } from "@/renderer/state/gitStore";
import {
  usePrMergeable,
  usePrMergeStateStatus,
  usePrReviewDecision,
  usePrState,
  usePrTitle,
  usePrUrl,
  usePrViewerDidAuthor,
} from "@/renderer/state/gitSelectors";
import { usePrCombinedChecksStatus } from "@/renderer/hooks/usePrCombinedChecksStatus";
import {
  isPrBlockedOnlyByPendingChecks,
  isPrBlockedOnlyByPendingReview,
} from "@/renderer/utils/prStatus";
import { pullMergedPrBaseIfPossible } from "@/renderer/actions/gitCommandRunner";
import type { TranslateFn } from "@/renderer/i18n/i18n";
import { PrHeaderCard } from "@/renderer/views/PrReviewOverlay/parts/PrHeaderCard";
import { PrMetaRow } from "@/renderer/views/PrReviewOverlay/parts/PrMetaRow";
import { SubmitReviewPopover } from "@/renderer/views/PrReviewOverlay/parts/SubmitReviewPopover";
import { PrWatchControls } from "@/renderer/views/GitReviewOverlay/parts/GitReviewSidebar/parts/PrWatchControls";
import { SheetMenu } from "../../components";
import { usePr } from "./prContext";
import { PrPageHeader } from "./PrPageHeader";

// Mirrors PrSection's merge-block reasons (the desktop git-review sidebar).
const BLOCK_REASON: Record<string, MessageDescriptor> = {
  BLOCKED: msg`Required reviews, conversations, or status checks not met.`,
  BEHIND: msg`Base branch is ahead — branch must be updated first.`,
  DIRTY: msg`Merge conflicts must be resolved.`,
  UNSTABLE: msg`Some checks are failing or pending.`,
  HAS_HOOKS: msg`Repository pre-receive hook is blocking the merge.`,
};

/** Status line for the checks row — derived from the same combined status as
 * the glyph so the two never disagree (e.g. green icon + "0 passed"). */
function checksSummary(status: string | undefined, total: number, t: TranslateFn): string {
  if (total === 0) return t`No checks reported`;
  switch (status?.toUpperCase()) {
    case "SUCCESS":
      return t`All checks passed`;
    case "FAILURE":
    case "ERROR":
      return t`Some checks failed`;
    case "PENDING":
      return t`Checks running`;
    default:
      return total === 1 ? t`1 check` : t`${total} checks`;
  }
}

/** One tappable overview summary row that drills into a PR deep page. */
function PrSummaryRow(props: {
  readonly icon: ReactNode;
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  readonly onClick: () => void;
}) {
  return (
    <button type="button" className="m-more-row" onClick={props.onClick}>
      <span className="m-more-row__icon">{props.icon}</span>
      <span className="m-more-row__body">
        <strong>{props.title}</strong>
        {props.subtitle}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted" />
    </button>
  );
}

function ChecksGlyph(props: { readonly status: string | undefined }) {
  const status = props.status?.toUpperCase();
  if (status === "SUCCESS") return <CheckCircle2 className="size-4 text-success" />;
  if (status === "FAILURE" || status === "ERROR") return <XCircle className="size-4 text-danger" />;
  if (status === "PENDING") return <Clock className="size-4 text-warning" />;
  return <CheckCircle2 className="size-4 text-muted/70" />;
}

/** Builds the `SheetMenu` trigger button for the merge-method menu, capturing
 *  `mergingMethod`/`t` as parameters instead of a render-time closure. */
function makeMergeMenuTrigger(mergingMethod: PrMergeMethod | null, t: TranslateFn) {
  return ({ open }: { readonly open: () => void }) => (
    <button
      type="button"
      className="m-git-head__btn"
      aria-label={t`Merge options`}
      disabled={mergingMethod !== null}
      onClick={open}
    >
      <ChevronRight className="size-4 rotate-90" />
    </button>
  );
}

/**
 * GitHub-style PR overview: identity + description, then tappable summary rows
 * ("N files changed", "N commits", "Conversation", "Checks") that drill into the
 * deep pages, plus the merge/review status.
 */
export function PrOverviewPage() {
  const { t } = useLingui();
  const pr = usePr();
  const details = useGitStore((s) => s.prDetails[pr.cacheKey]);
  const files = useGitStore((s) => s.prFiles[pr.cacheKey]);
  const title = usePrTitle(pr.prKey) || details?.title || t`Pull request #${pr.prNumber}`;
  const url = usePrUrl(pr.prKey);
  const state = usePrState(pr.prKey);
  const viewerDidAuthor = usePrViewerDidAuthor(pr.prKey);
  const checksStatus = usePrCombinedChecksStatus(pr.prKey, pr.cacheKey);
  const mergeStateStatus = usePrMergeStateStatus(pr.prKey);
  const mergeable = usePrMergeable(pr.prKey);
  const reviewDecision = usePrReviewDecision(pr.prKey);
  const [mergingMethod, setMergingMethod] = useState<PrMergeMethod | null>(null);

  const filesCount = files?.length ?? details?.changedFiles ?? 0;
  const additions = details?.additions ?? 0;
  const deletions = details?.deletions ?? 0;
  const commitsCount = details?.commits.length ?? 0;
  const conversationCount =
    (details?.comments.length ?? 0) +
    (details?.reviews.filter(
      (r) => r.body || r.state === "APPROVED" || r.state === "CHANGES_REQUESTED",
    ).length ?? 0);
  const checks = details?.checks ?? [];

  const reasonKey = mergeable === "CONFLICTING" ? "DIRTY" : mergeStateStatus;
  const mergeStatus = { reviewDecision, mergeable, mergeStateStatus };
  const isPendingChecksBlock = isPrBlockedOnlyByPendingChecks(checksStatus, mergeStatus);
  const isAwaitingReview = isPrBlockedOnlyByPendingReview(checksStatus, mergeStatus);
  const isSoftBlock = isPendingChecksBlock || isAwaitingReview;
  // Only an open (non-draft) PR can be merge-blocked, mirroring the desktop
  // PrSection's `state !== "merged" && state !== "draft"` guard.
  const isBlocked =
    state === "open" &&
    (isAwaitingReview ||
      (reasonKey !== undefined &&
        reasonKey !== "CLEAN" &&
        reasonKey !== "DRAFT" &&
        reasonKey !== "UNKNOWN"));
  const blockReason = reasonKey ? BLOCK_REASON[reasonKey] : undefined;
  const canMerge = state === "open" && !isBlocked;
  const canReview =
    viewerDidAuthor !== true &&
    state !== "merged" &&
    state !== "closed" &&
    details?.mergedAt == null &&
    details?.closedAt == null;

  async function handleMerge(method: PrMergeMethod) {
    if (mergingMethod !== null) return;
    setMergingMethod(method);
    try {
      await readBridge().ghMergePr({
        projectLocation: pr.projectLocation,
        prNumber: pr.prNumber,
        method,
        admin: false,
      });
      const current = useGitStore.getState().prData[pr.prKey];
      if (current) {
        await pullMergedPrBaseIfPossible(pr.project.location, current.baseBranch);
        useGitStore.getState().setPrData(pr.prKey, {
          ...current,
          state: "merged",
          updatedAt: new Date().toISOString(),
        });
      }
      toast.success(t`Pull request merged`);
      pr.reload();
    } catch (err) {
      toast.danger(friendlyError(err));
    } finally {
      setMergingMethod(null);
    }
  }

  return (
    <>
      <PrPageHeader
        title={`#${pr.prNumber}`}
        onBack={pr.close}
        backLabel={t`Close PR review`}
        actions={
          <>
            {canReview && details?.headBranch ? (
              <PrWatchControls
                projectId={pr.project.id}
                prNumber={pr.prNumber}
                headBranch={details.headBranch}
                {...(pr.worktreePath ? { worktreePath: pr.worktreePath } : {})}
                onRefreshPr={pr.reload}
              />
            ) : null}
            {url ? (
              <button
                type="button"
                className="m-git-head__btn"
                aria-label={t`Open on GitHub`}
                onClick={() => openExternalWithFeedback(url)}
              >
                <ExternalLink className="size-4" />
              </button>
            ) : null}
            <button
              type="button"
              className="m-git-head__btn"
              aria-label={t`Refresh`}
              onClick={pr.reload}
            >
              <RefreshCw className={`size-4 ${pr.loading ? "m-spin" : ""}`} />
            </button>
          </>
        }
      />
      <div className="m-git-overlay__body">
        <div className="m-pr-overview">
          <div className="m-card">
            <h1 className="m-pr-title">{title}</h1>
            <PrMetaRow prKey={pr.prKey} cacheKey={pr.cacheKey} />
          </div>

          <PrHeaderCard cacheKey={pr.cacheKey} />

          <div className="m-pr-section">
            <div className="m-pr-section__head">
              <Trans>Changes</Trans>
            </div>
            <PrSummaryRow
              icon={<FileDiff className="size-4" />}
              title={<Plural value={filesCount} one="# file changed" other="# files changed" />}
              subtitle={
                <span className="m-pr-diffstat">
                  {additions > 0 ? <span className="text-success">+{additions}</span> : null}
                  {deletions > 0 ? <span className="text-danger">−{deletions}</span> : null}
                </span>
              }
              onClick={() => pr.toPage("changes")}
            />
            <PrSummaryRow
              icon={<GitCommit className="size-4" />}
              title={<Plural value={commitsCount} one="# commit" other="# commits" />}
              onClick={() => pr.toPage("commits")}
            />
          </div>

          <div className="m-pr-section">
            <div className="m-pr-section__head">
              <Trans>Status</Trans>
            </div>
            <PrSummaryRow
              icon={<MessageSquare className="size-4" />}
              title={<Trans>Conversation</Trans>}
              subtitle={
                <span>
                  <Plural
                    value={conversationCount}
                    one="# comment or review"
                    other="# comments & reviews"
                  />
                </span>
              }
              onClick={() => pr.toPage("conversation")}
            />
            <PrSummaryRow
              icon={<ChecksGlyph status={checksStatus} />}
              title={<Trans>Checks</Trans>}
              subtitle={<span>{checksSummary(checksStatus, checks.length, t)}</span>}
              onClick={() => pr.toPage("checks")}
            />
            {isBlocked ? (
              <div className="m-pr-merge">
                <AlertTriangle
                  className={`size-4 shrink-0 ${isSoftBlock ? "text-warning" : "text-danger"}`}
                />
                <span className="m-pr-merge__body">
                  <strong>
                    {isPendingChecksBlock ? (
                      <Trans>Checks pending</Trans>
                    ) : isAwaitingReview ? (
                      <Trans>Awaiting review</Trans>
                    ) : (
                      <Trans>Unable to merge</Trans>
                    )}
                  </strong>
                  {!isSoftBlock && blockReason ? <span>{t(blockReason)}</span> : null}
                </span>
              </div>
            ) : null}
          </div>

          {canReview || canMerge ? (
            <div className="m-pr-section">
              <div className="m-pr-section__head">
                <Trans>Actions</Trans>
              </div>
              {canReview ? (
                <SubmitReviewPopover
                  projectLocation={pr.projectLocation}
                  prNumber={pr.prNumber}
                  hidden={false}
                  triggerPresentation="touch"
                  onSubmitted={pr.reload}
                />
              ) : null}
              {canMerge ? (
                <div className="m-pr-actions">
                  <button
                    type="button"
                    className="m-more-row"
                    disabled={mergingMethod !== null}
                    onClick={() => void handleMerge("squash")}
                  >
                    <span className="m-more-row__icon">
                      {mergingMethod === "squash" ? (
                        <Loader2 className="size-4 m-spin" />
                      ) : (
                        <GitMerge className="size-4" />
                      )}
                    </span>
                    <span className="m-more-row__body">
                      <strong>
                        <Trans>Merge PR: Squash</Trans>
                      </strong>
                      <span>
                        <Trans>Merge this pull request with one squashed commit.</Trans>
                      </span>
                    </span>
                  </button>
                  <SheetMenu
                    label={t`Merge method`}
                    closeLabel={t`Close merge options`}
                    items={[
                      {
                        id: "merge",
                        label: <Trans>Merge PR: Commit</Trans>,
                        icon: <GitMerge className="size-4" />,
                        disabled: mergingMethod !== null,
                      },
                      {
                        id: "rebase",
                        label: <Trans>Merge PR: Rebase</Trans>,
                        icon: <GitMerge className="size-4" />,
                        disabled: mergingMethod !== null,
                      },
                    ]}
                    onSelect={(method) => void handleMerge(method as PrMergeMethod)}
                    trigger={makeMergeMenuTrigger(mergingMethod, t)}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
