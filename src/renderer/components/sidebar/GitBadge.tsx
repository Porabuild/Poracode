import { useGitStore } from "../../state/gitStore";
import { useShallow } from "zustand/shallow";

export function GitBadge(props: {
  projectId: string;
  projectName: string;
  onPress: () => void;
  worktreePath?: string;
}) {
  const { isRepo, totalInsertions, totalDeletions } = useGitStore(
    useShallow((s) => {
      const gitStatus = props.worktreePath
        ? s.worktreeStatuses[props.worktreePath]
        : s.statuses[props.projectId];
      return {
        isRepo: gitStatus?.isRepo ?? false,
        totalInsertions: gitStatus?.totalInsertions ?? 0,
        totalDeletions: gitStatus?.totalDeletions ?? 0,
      };
    }),
  );
  if (!isRepo || (totalInsertions === 0 && totalDeletions === 0))
    return null;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Git changes for ${props.projectName}`}
      className="shrink-0 cursor-default rounded px-1 py-0.5 transition-colors text-muted/60 hover:bg-white/[0.04] hover:text-foreground"
      onClick={(e) => {
        e.stopPropagation();
        props.onPress();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.stopPropagation();
          props.onPress();
        }
      }}
    >
      <span className="flex items-center gap-0.5 text-[10px] font-medium">
        {totalInsertions > 0 && (
          <span className="text-success">+{totalInsertions}</span>
        )}
        {totalDeletions > 0 && (
          <span className="text-danger">-{totalDeletions}</span>
        )}
      </span>
    </div>
  );
}
