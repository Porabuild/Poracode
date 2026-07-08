import { useEffect } from "react";
import { useLingui } from "@lingui/react/macro";
import { FloatingComposerDock } from "../FloatingComposerDock";
import { useRemote } from "../remoteContext";
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
 * This route owns the home-specific controlled expanded state so the same
 * bubble handles both compact and expanded start flows.
 *
 */
export function QuickCompose(props: {
  readonly expanded: boolean;
  readonly onExpandedChange: (expanded: boolean) => void;
  readonly onStarted: (threadId: string) => void;
}) {
  const { t } = useLingui();
  const remote = useRemote();
  const { expanded, onExpandedChange, onStarted } = props;
  const ready = remote.connection === "online" && remote.projects.length > 0;

  useEffect(() => {
    if (!ready && expanded) onExpandedChange(false);
  }, [ready, expanded, onExpandedChange]);

  if (!ready) return null;

  return (
    <FloatingComposerDock
      keyboardKey="home-draft"
      expanded={expanded}
      focusOnExpand
      scrimLabel={t`Close composer`}
      collapsedTapLabel={t`New thread`}
      onExpandedChange={onExpandedChange}
    >
      <NewThreadFlow onStarted={onStarted} />
    </FloatingComposerDock>
  );
}
