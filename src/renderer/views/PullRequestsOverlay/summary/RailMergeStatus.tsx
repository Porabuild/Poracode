import { Trans } from "@lingui/react/macro";
import { usePrMergeReadiness } from "@/renderer/hooks/usePrMergeReadiness";
import { PR_TONE_BG_CLASS } from "@/renderer/utils/prStatus";
import { usePrDetailScope } from "../detail/prDetailScope";
import { RailSection } from "./RailSection";

/** Read-only merge readiness; the merge action itself lives in the header. */
export function RailMergeStatus() {
  const scope = usePrDetailScope();
  const readiness = usePrMergeReadiness(scope.prKey, scope.cacheKey);
  return (
    <RailSection title={<Trans>Merge status</Trans>}>
      {readiness.statusLabel ? (
        <div className="flex items-center gap-2 text-xs text-foreground">
          <span
            aria-hidden
            className={`size-2 shrink-0 rounded-full ${PR_TONE_BG_CLASS[readiness.tone]}`}
          />
          <span className="font-medium">{readiness.statusLabel}</span>
        </div>
      ) : (
        <p className="text-xs text-muted">—</p>
      )}
      {readiness.blockReason ? (
        <p className="text-[11px] leading-snug text-muted">{readiness.blockReason}</p>
      ) : null}
      {readiness.isPendingChecksBlock ? (
        <p className="text-[11px] leading-snug text-muted">
          <Trans>Waiting for checks to finish.</Trans>
        </p>
      ) : null}
      {readiness.isAwaitingReview ? (
        <p className="text-[11px] leading-snug text-muted">
          <Trans>Awaiting a required review.</Trans>
        </p>
      ) : null}
    </RailSection>
  );
}
