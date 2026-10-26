import { Button } from "@heroui/react";
import { Trash2 } from "lucide-react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { MessageDescriptor } from "@lingui/core";
import type { PrReviewState, PrReviewer } from "@/shared/contracts";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePrDetailScope } from "../detail/prDetailScope";
import { PrAvatar } from "../parts/PrAvatar";
import { RailSection } from "./RailSection";
import { ReviewerPicker } from "./ReviewerPicker";
import { buildReviewerRows } from "./reviewerModel";
import { useRailMutation } from "./useRailMutation";

const NO_REVIEWERS: readonly PrReviewer[] = [];

const REVIEW_DOT: Record<PrReviewState, { label: MessageDescriptor; className: string }> = {
  APPROVED: { label: msg`Approved`, className: "bg-success" },
  CHANGES_REQUESTED: { label: msg`Requested changes`, className: "bg-danger" },
  COMMENTED: { label: msg`Commented`, className: "bg-muted" },
  DISMISSED: { label: msg`Review dismissed`, className: "bg-muted/40" },
  PENDING: { label: msg`Pending review`, className: "bg-warning" },
};

const refOf = (reviewer: PrReviewer) => ({
  id: reviewer.id,
  ...(reviewer.team ? { team: true } : {}),
});

/** Requested reviewers and everyone who has reviewed, with add and remove where the host allows. */
export function RailReviewers() {
  const { t } = useLingui();
  const scope = usePrDetailScope();
  const requested = useGitStore((s) => s.prDetails[scope.cacheKey]?.requestedReviewers);
  const reviews = useGitStore((s) => s.prDetails[scope.cacheKey]?.reviews);
  const authorLogin = useGitStore((s) => s.prDetails[scope.cacheKey]?.author?.login);
  const mutation = useRailMutation();
  const canEdit = scope.scoped?.capabilities.reviewRequests === true;
  const rows = buildReviewerRows({
    requested: requested ?? NO_REVIEWERS,
    reviews: reviews ?? [],
    authorLogin,
  });
  if (!canEdit && rows.length === 0) return null;
  const disabled = scope.readOnly || mutation.pending;

  return (
    <RailSection
      title={<Trans>Reviewers</Trans>}
      action={
        canEdit ? (
          <ReviewerPicker
            requested={requested ?? NO_REVIEWERS}
            authorLogin={authorLogin}
            disabled={disabled}
            onPick={(reviewer) =>
              mutation.run((client) =>
                client.requestReviewers({
                  projectLocation: scope.location,
                  prNumber: scope.prNumber,
                  add: [refOf(reviewer)],
                  remove: [],
                }),
              )
            }
          />
        ) : null
      }
    >
      {rows.length === 0 ? (
        <p className="text-xs text-muted">
          <Trans>No reviewers requested</Trans>
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => {
            const dot = row.state ? REVIEW_DOT[row.state] : undefined;
            const reviewer = row.requested;
            return (
              <li key={row.login} className="flex items-center gap-2 text-xs">
                <PrAvatar author={row.author} />
                <span className="min-w-0 flex-1 truncate text-foreground" title={row.login}>
                  {row.login}
                </span>
                {dot ? (
                  <span
                    role="img"
                    aria-label={t(dot.label)}
                    title={t(dot.label)}
                    className={`size-2 shrink-0 rounded-full ${dot.className}`}
                  />
                ) : null}
                {canEdit && reviewer ? (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    aria-label={t`Remove ${row.login}`}
                    isDisabled={disabled}
                    className="size-6 min-h-0 min-w-0 text-muted hover:text-danger"
                    onPress={() =>
                      void mutation.run((client) =>
                        client.requestReviewers({
                          projectLocation: scope.location,
                          prNumber: scope.prNumber,
                          add: [],
                          remove: [refOf(reviewer)],
                        }),
                      )
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </RailSection>
  );
}
