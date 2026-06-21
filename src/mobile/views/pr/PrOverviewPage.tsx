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
import { PrHeaderCard } from "@/renderer/views/PrReviewOverlay/parts/PrHeaderCard";
import { PrMetaRow } from "@/renderer/views/PrReviewOverlay/parts/PrMetaRow";
import { usePr } from "./prContext";
import { PrPageHeader } from "./PrPageHeader";

// Mirrors PrSection's merge-block reasons (the desktop git-review sidebar).
const BLOCK_REASON: Record<string, string> = {
  BLOCKED: "Required reviews, conversations, or status checks not met.",
  BEHIND: "Base branch is ahead — branch must be updated first.",
  DIRTY: "Merge conflicts must be resolved.",
  UNSTABLE: "Some checks are failing or pending.",
  HAS_HOOKS: "Repository pre-receive hook is blocking the merge.",
};

/** Status line for the checks row — derived from the same combined status as
 * the glyph so the two never disagree (e.g. green icon + "0 passed"). */
function checksSummary(status: string | undefined, total: number): string {
  if (total === 0) return "No checks reported";
  switch (status?.toUpperCase()) {
    case "SUCCESS":
      return "All checks passed";
    case "FAILURE":
    case "ERROR":
      return "Some checks failed";
    case "PENDING":
      return "Checks running";
    default:
      return `${total} check${total === 1 ? "" : "s"}`;
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
  const pr = usePr();
  const details = useGitStore((s) => s.prDetails[pr.cacheKey]);
  const files = useGitStore((s) => s.prFiles[pr.cacheKey]);
  const title = usePrTitle(pr.prKey) || details?.title || `Pull request #${pr.prNumber}`;
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
        backLabel="Close PR review"
        actions={
          <>
            {url ? (
              <button
                type="button"
                className="m-git-head__btn"
                aria-label="Open on GitHub"
                onClick={() => void readBridge().openExternal(url)}
              >
                <ExternalLink className="size-4" />
              </button>
            ) : null}
            <button
              type="button"
              className="m-git-head__btn"
              aria-label="Refresh"
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
            <div className="m-pr-section__head">Changes</div>
            <button type="button" className="m-more-row" onClick={() => pr.toPage("changes")}>
              <span className="m-more-row__icon">
                <FileDiff className="size-4" />
              </span>
              <span className="m-more-row__body">
                <strong>
                  {filesCount} file{filesCount === 1 ? "" : "s"} changed
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
                  {commitsCount} commit{commitsCount === 1 ? "" : "s"}
                </strong>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted" />
            </button>
          </div>

          <div className="m-pr-section">
            <div className="m-pr-section__head">Status</div>
            <button type="button" className="m-more-row" onClick={() => pr.toPage("conversation")}>
              <span className="m-more-row__icon">
                <MessageSquare className="size-4" />
              </span>
              <span className="m-more-row__body">
                <strong>Conversation</strong>
                <span>
                  {conversationCount} comment{conversationCount === 1 ? "" : "s"} &amp; reviews
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted" />
            </button>
            <button type="button" className="m-more-row" onClick={() => pr.toPage("checks")}>
              <span className="m-more-row__icon">
                <ChecksGlyph status={checksStatus} />
              </span>
              <span className="m-more-row__body">
                <strong>Checks</strong>
                <span>{checksSummary(checksStatus, checks.length)}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted" />
            </button>
            {isBlocked ? (
              <div className="m-pr-merge">
                <AlertTriangle className="size-4 shrink-0 text-danger" />
                <span className="m-pr-merge__body">
                  <strong>Unable to merge</strong>
                  {blockReason ? <span>{blockReason}</span> : null}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
