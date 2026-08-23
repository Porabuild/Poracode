import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import type { GitActionPhase } from "@/renderer/state/gitReviewActionStore";

/**
 * Status labels for the tracked git action phases; resolve via `useLingui().t`.
 *
 * Every label must survive the narrowest sidebar (240px), where the split
 * button leaves roughly 19 characters after the spinner and the chevron — so
 * these name the step alone and let the button they replace supply the object
 * ("Generating…" in the commit button is the commit message; in the PR button
 * it is the summary). Translations are held to the same budget; anything
 * longer truncates instead of wrapping.
 */
export const ACTION_PHASE_LABELS: Record<GitActionPhase, MessageDescriptor> = {
  "generating-message": msg`Generating…`,
  committing: msg`Committing…`,
  pushing: msg`Pushing…`,
  pulling: msg`Pulling…`,
  syncing: msg`Syncing…`,
  "generating-pr-summary": msg`Summarizing…`,
  "creating-pr": msg`Creating PR…`,
};

/**
 * Live name of the git step in flight, rendered *inside* the button that
 * started it: the button is already spinning and disabled, so its idle caption
 * ("Commit", "Sync", "Create PR") is dead weight while the phase label is the
 * useful text. Keeping it in the button also keeps the panel's height stable —
 * a separate status row appears and disappears mid-action and shifts every
 * control below it.
 */
export function ActionPhaseLabel(props: { phase: GitActionPhase }) {
  const { t } = useLingui();
  return (
    <span role="status" className="min-w-0 truncate">
      {t(ACTION_PHASE_LABELS[props.phase])}
    </span>
  );
}
