import { useShallow } from "zustand/shallow";
import { Tooltip } from "@heroui/react";
import { GitFork } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { getBasename } from "@/shared/pathUtils";
import { closeAllPanels, showGitReviewPanel } from "@/renderer/actions/panelActions";
import {
  floatingGlassActiveClass,
  floatingGlassSurfaceClass,
} from "@/renderer/components/layout/floatingGlass";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePanelStore } from "@/renderer/state/panelStore";

/**
 * Translucent Git/worktree identity that floats over the top-right corner of
 * the composer. Worktrees remain visible when clean as an icon-only control;
 * root project scopes render only when they have changes. Clicking toggles the
 * docked Git review panel for the same scope.
 */
export function ThreadChangesBubble(props: {
  projectId: string;
  worktreePath?: string | undefined;
  worktreeName?: string | undefined;
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
  // Active only when the docked Git panel is showing *this* thread's scope.
  const isOpen = usePanelStore(
    (s) =>
      s.rightPanelTab === "git" &&
      s.gitReviewAsPanel &&
      s.gitReviewContext?.projectId === props.projectId &&
      s.gitReviewContext?.worktreePath === props.worktreePath,
  );

  const hasChanges = insertions > 0 || deletions > 0;
  const worktreeName =
    props.worktreeName ?? (props.worktreePath ? getBasename(props.worktreePath) : undefined);

  if (!hasChanges && !props.worktreePath) return null;

  const bubble = (
    <button
      type="button"
      {...(!worktreeName ? { title: isOpen ? t`Close changes` : t`Review changes` } : {})}
      aria-label={isOpen ? t`Close changes` : t`Review changes`}
      aria-pressed={isOpen}
      /* Sized to a 28px pill — same height as the scroll-to-bottom circle and the
         rail's icon buttons, so the floating chrome shares one scale. */
      className={`${floatingGlassSurfaceClass} absolute bottom-full right-3 z-10 mb-1.5 flex h-7 items-center gap-1.5 rounded-full text-xs font-medium transition-colors ${
        hasChanges ? "px-3" : "w-7 justify-center px-0"
      } ${isOpen ? floatingGlassActiveClass : "hover:border-border/30"}`}
      onClick={() => {
        if (isOpen) {
          closeAllPanels();
          return;
        }
        showGitReviewPanel(props.projectId, props.worktreePath);
      }}
    >
      {props.worktreePath ? <GitFork className="size-3.5 shrink-0 text-muted" /> : null}
      {insertions > 0 && <span className="text-success">+{insertions}</span>}
      {deletions > 0 && <span className="text-danger">-{deletions}</span>}
    </button>
  );

  if (!worktreeName) return bubble;

  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger>{bubble}</Tooltip.Trigger>
      <Tooltip.Content placement="top">{worktreeName}</Tooltip.Content>
    </Tooltip>
  );
}
