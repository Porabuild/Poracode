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
  MessageSquare,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { readBridge } from "@/renderer/bridge";
import { useGitStore } from "@/renderer/state/gitStore";
import {
  usePrMergeable,
  usePrMergeStateStatus,
  usePrState,
  usePrTitle,
  usePrUrl,
} from "@/renderer/state/gitSelectors";
import { usePrCombinedChecksStatus } from "@/renderer/hooks/usePrCombinedChecksStatus";
import type { TranslateFn } from "@/renderer/i18n/i18n";
import { PrHeaderCard } from "@/renderer/views/PrReviewOverlay/parts/PrHeaderCard";
import { PrMetaRow } from "@/renderer/views/PrReviewOverlay/parts/PrMetaRow";
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

function ChecksGlyph(props: { readonly status: string | undefined }) {
  const status = props.status?.toUpperCase();
  if (status === "SUCCESS") return <CheckCircle2 className="size-4 text-success" />;
  if (status === "FAILURE" || status === "ERROR") return <XCircle className="size-4 text-danger" />;
  if (status === "PENDING") return <Clock className="size-4 text-warning" />;
  return <CheckCircle2 className="size-4 text-muted/70" />;
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
  const checksStatus = usePrCombinedChecksStatus(pr.prKey, pr.cacheKey);
  const mergeStateStatus = usePrMergeStateStatus(pr.prKey);
  const mergeable = usePrMergeable(pr.prKey);

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
  // Only an open (non-draft) PR can be merge-blocked, mirroring the desktop
  // PrSection's `state !== "merged" && state !== "draft"` guard.
  const isBlocked =
    state === "open" &&
    reasonKey !== undefined &&
    reasonKey !== "CLEAN" &&
    reasonKey !== "DRAFT" &&
    reasonKey !== "UNKNOWN";
  const blockReason = reasonKey ? BLOCK_REASON[reasonKey] : undefined;

  return (
    <>
      <PrPageHeader
        title={`#${pr.prNumber}`}
        onBack={pr.close}
        backLabel={t`Close PR review`}
        actions={
          <>
            {url ? (
              <button
                type="button"
                className="m-git-head__btn"
                aria-label={t`Open on GitHub`}
                onClick={() => void readBridge().openExternal(url)}
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
            <button type="button" className="m-more-row" onClick={() => pr.toPage("changes")}>
              <span className="m-more-row__icon">
                <FileDiff className="size-4" />
              </span>
              <span className="m-more-row__body">
                <strong>
                  <Plural value={filesCount} one="# file changed" other="# files changed" />
                </strong>
                <span className="m-pr-diffstat">
                  {additions > 0 ? <span className="text-success">+{additions}</span> : null}
                  {deletions > 0 ? <span className="text-danger">−{deletions}</span> : null}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted" />
            </button>
            <button type="button" className="m-more-row" onClick={() => pr.toPage("commits")}>
              <span className="m-more-row__icon">
                <GitCommit className="size-4" />
              </span>
              <span className="m-more-row__body">
                <strong>
                  <Plural value={commitsCount} one="# commit" other="# commits" />
                </strong>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted" />
            </button>
          </div>

          <div className="m-pr-section">
            <div className="m-pr-section__head">
              <Trans>Status</Trans>
            </div>
            <button type="button" className="m-more-row" onClick={() => pr.toPage("conversation")}>
              <span className="m-more-row__icon">
                <MessageSquare className="size-4" />
              </span>
              <span className="m-more-row__body">
                <strong>
                  <Trans>Conversation</Trans>
                </strong>
                <span>
                  <Plural
                    value={conversationCount}
                    one="# comment or review"
                    other="# comments & reviews"
                  />
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted" />
            </button>
            <button type="button" className="m-more-row" onClick={() => pr.toPage("checks")}>
              <span className="m-more-row__icon">
                <ChecksGlyph status={checksStatus} />
              </span>
              <span className="m-more-row__body">
                <strong>
                  <Trans>Checks</Trans>
                </strong>
                <span>{checksSummary(checksStatus, checks.length, t)}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted" />
            </button>
            {isBlocked ? (
              <div className="m-pr-merge">
                <AlertTriangle className="size-4 shrink-0 text-danger" />
                <span className="m-pr-merge__body">
                  <strong>
                    <Trans>Unable to merge</Trans>
                  </strong>
                  {blockReason ? <span>{t(blockReason)}</span> : null}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
