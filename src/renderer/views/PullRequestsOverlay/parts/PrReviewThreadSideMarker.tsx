import { Trans } from "@lingui/react/macro";
import type { PrReviewThread } from "@/shared/contracts";

export function PrReviewThreadSideMarker(props: { side: PrReviewThread["side"] }) {
  if (props.side !== "LEFT") return null;
  return (
    <span className="rounded-full border border-[color:var(--border)] px-1.5 text-[11px] font-medium text-muted">
      <Trans>Old side</Trans>
    </span>
  );
}
