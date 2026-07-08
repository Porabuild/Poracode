import { splitPath } from "@/shared/pathUtils";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { toProjectRelativeDisplayPath } from "../../chatPathUtils";

interface ChatFilePathProps {
  path: string;
  /** Applied to the outer wrapper (callers pass `flex-1` so it fills the row). */
  className?: string;
  /** Class for the always-visible basename (defaults to foreground). */
  basenameClassName?: string;
  /** Class for the muted, head-truncated directory. */
  dirClassName?: string;
}

/**
 * File path for chat tool-call / file-change rows, rendered as
 * `<basename> <muted …dir-tail>`.
 *
 * Truncation is **pure CSS** (`lc-truncate-start` = `direction: rtl` +
 * `text-overflow: ellipsis` on the directory), NOT JS measurement. This is
 * deliberate: these rows hug their content (`w-fit max-w-full`), and a
 * width-measuring truncator (the shared `PathDisplay`) collapses inside a
 * fit-content ancestor — it deletes characters to fit its box, that shrinks the
 * hugging `<code>`/row, its ResizeObserver fires smaller, it deletes more, and
 * the path collapses to a lone truncated basename. CSS truncation never changes
 * the element's intrinsic (max-content) width, so `w-fit` still sizes to the
 * full path (capped at 100%) and the directory just clips visually — no
 * feedback loop, and no per-row ResizeObserver in long threads.
 *
 * The basename is `shrink-0` (never truncated); the directory is `flex-1
 * min-w-0` so it takes the remaining width and head-ellipsises when it doesn't
 * fit. The path is shown relative to the agent's working directory (project /
 * worktree root); the absolute path stays available as the hover tooltip.
 */
export function ChatFilePath({
  path,
  className,
  basenameClassName = "text-foreground",
  dirClassName = "text-muted/60",
}: ChatFilePathProps) {
  const projectLocation = useChatPaneActions()?.projectLocation;
  const displayPath = projectLocation ? toProjectRelativeDisplayPath(path, projectLocation) : path;
  const { dirWithSlash, basename } = splitPath(displayPath);
  const dir = dirWithSlash.replace(/[\\/]$/, "");
  return (
    <span
      className={`flex min-w-0 items-baseline overflow-hidden whitespace-nowrap ${className ?? ""}`}
      title={path}
    >
      <span className={`shrink-0 ${basenameClassName}`}>{basename}</span>
      {dir ? <span className={`lc-truncate-start ml-1 flex-1 ${dirClassName}`}>{dir}</span> : null}
    </span>
  );
}
