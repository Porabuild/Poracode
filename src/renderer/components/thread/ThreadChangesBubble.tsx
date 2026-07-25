import { useShallow } from "zustand/shallow";
import { useLingui } from "@lingui/react/macro";
import { showGitReviewPanel } from "@/renderer/actions/panelActions";
import { floatingChromeSurfaceClass } from "@/renderer/components/layout/sidebarChrome";
import { useGitStore } from "@/renderer/state/gitStore";

/**
 * Translucent working-tree diff stat that floats over the top-right corner of
 * the composer. Renders nothing when the thread's scope has no changes, and
 * opens the docked Git review panel for that scope on click.
 */
export function ThreadChangesBubble(props: {
  projectId: string;
  worktreePath?: string | undefined;
}) {
  const { t } = useLingui();
  const { insertions, deletions } = useGitStore(
    useShallow((s) => {
      const status = props.worktreePath
        ? s.worktreeStatuses[props.worktreePath]
        : s.statuses[props.projectId];
      return {
        insertions: status?.totalInsertions ?? 0,
        deletions: status?.totalDeletions ?? 0,
      };
    }),
  );

  if (insertions === 0 && deletions === 0) return null;

  return (
    <button
      type="button"
      title={t`Review changes`}
      aria-label={t`Review changes`}
      /* Sized to a 28px pill — same height as the scroll-to-bottom circle and the
         rail's icon buttons, so the floating chrome shares one scale. */
      className={`${floatingChromeSurfaceClass} absolute bottom-full right-2 z-10 mb-1.5 flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors hover:border-border/30`}
      onClick={() => showGitReviewPanel(props.projectId, props.worktreePath)}
    >
      {insertions > 0 && <span className="text-success">+{insertions}</span>}
      {deletions > 0 && <span className="text-danger">-{deletions}</span>}
    </button>
  );
}
