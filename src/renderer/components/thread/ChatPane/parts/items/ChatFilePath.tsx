import type { ComponentProps } from "react";
import { PathDisplay } from "@/renderer/components/common";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { toProjectRelativeDisplayPath } from "../../chatPathUtils";

type ChatFilePathProps = Omit<ComponentProps<typeof PathDisplay>, "title">;

/**
 * `PathDisplay` for chat tool-call / file-change rows. Renders the path relative
 * to the agent's working directory (the project / worktree root) when it sits
 * inside it, and the absolute path otherwise — so files in the current project
 * read as `src/foo/bar.ts` instead of the full
 * `C:\Users\…\worktree\src\foo\bar.ts`. The absolute path stays available as the
 * hover tooltip.
 *
 * The relativization is purely cosmetic: callers keep handing it the absolute
 * `path` from the tool payload, which the rest of the row still uses for disk
 * reads, diffs, and language detection.
 */
export function ChatFilePath({ path, ...rest }: ChatFilePathProps) {
  const projectLocation = useChatPaneActions()?.projectLocation;
  const displayPath = projectLocation ? toProjectRelativeDisplayPath(path, projectLocation) : path;
  return <PathDisplay {...rest} path={displayPath} title={path} />;
}
