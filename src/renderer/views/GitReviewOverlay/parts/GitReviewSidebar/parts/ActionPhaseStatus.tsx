import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import type { GitActionPhase } from "@/renderer/state/gitReviewActionStore";
import { PixelLoader } from "@/renderer/components/common";

/** Status labels for the tracked git action phases; resolve via `useLingui().t`. */
export const ACTION_PHASE_LABELS: Record<GitActionPhase, MessageDescriptor> = {
  "generating-message": msg`Generating commit message…`,
  committing: msg`Committing…`,
  pushing: msg`Pushing…`,
  pulling: msg`Pulling…`,
  syncing: msg`Syncing…`,
  "generating-pr-summary": msg`Generating PR summary…`,
  "creating-pr": msg`Creating PR…`,
};

/**
 * Live status row naming the git step in flight. Shared by the commit/sync
 * panel and the create-PR dialog so a multi-step action reads the same in both
 * places. Renders nothing when idle.
 */
export function ActionPhaseStatus(props: { actionPhase: GitActionPhase | null }) {
  const { t } = useLingui();
  if (!props.actionPhase) return null;
  return (
    <div className="flex items-center gap-2 px-1 text-xs text-muted" role="status">
      <PixelLoader size="xs" />
      <span>{t(ACTION_PHASE_LABELS[props.actionPhase])}</span>
    </div>
  );
}
