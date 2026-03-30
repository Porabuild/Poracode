import { useGitStore } from "../../state/gitStore";

export function GitBadge(props: {
  projectId: string;
  projectName: string;
  onPress: () => void;
  worktreePath?: string;
}) {
  const gitStatus = useGitStore((s) =>
    props.worktreePath ? s.worktreeStatuses[props.worktreePath] : s.statuses[props.projectId],
  );
  if (!gitStatus?.isRepo || (gitStatus.totalInsertions === 0 && gitStatus.totalDeletions === 0))
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
        {gitStatus.totalInsertions > 0 && (
          <span className="text-success">+{gitStatus.totalInsertions}</span>
        )}
        {gitStatus.totalDeletions > 0 && (
          <span className="text-danger">-{gitStatus.totalDeletions}</span>
        )}
      </span>
    </div>
  );
}
