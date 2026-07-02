import { useLingui } from "@lingui/react/macro";
import { FloatingComposerDock } from "../FloatingComposerDock";
import { NewThreadFlow } from "./NewThreadFlow";

/**
 * The home screen's new-thread composer: the real draft composer floating over
 * the thread list as a bubble. Collapsed, CSS trims it down to just the prompt
 * input (plus the send button once a draft exists); tapping it grows the same
 * bubble in place — the input keeps focus, so the keyboard stays up — to
 * reveal every selection control: project, Chat/CLI, model, worktree.
 *
 * All keyboard mechanics and the dock chrome live in FloatingComposerDock,
 * shared with the live-thread composer so both feel like the same component.
 * This route owns the home-specific controlled expanded state so other
 * affordances (the empty-state "New thread" button) can open the same bubble.
 *
 */
export function QuickCompose(props: {
  readonly expanded: boolean;
  readonly onExpandedChange: (expanded: boolean) => void;
  readonly onStarted: (threadId: string) => void;
}) {
  const { t } = useLingui();

  return (
    <FloatingComposerDock
      keyboardKey="home-draft"
      expanded={props.expanded}
      focusOnExpand
      scrimLabel={t`Close composer`}
      collapsedTapLabel={t`New thread`}
      onExpandedChange={props.onExpandedChange}
    >
      <NewThreadFlow onStarted={props.onStarted} />
    </FloatingComposerDock>
  );
}
