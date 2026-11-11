import { memo } from "react";
import type { Project } from "@/shared/contracts";
import { ProjectIcon } from "@/renderer/components/common/ProjectIcon";
import { TuxIcon } from "@/renderer/components/common/TuxIcon";
import {
  ProjectRemoteServerChip,
  type ProjectRemoteServerInfo,
} from "@/renderer/components/common/ProjectRemoteServer";

/**
 * Trailing project label for a cross-project (flat) list row. `stacked` rows
 * (threads, worktree headers) put it on a second line; provider/experiment
 * group headers keep the inline trailing form. Remote mirrors carry the
 * machine name so their rows read as non-local.
 */
function FlatListProjectTagInner(props: {
  project: Project;
  remote: ProjectRemoteServerInfo;
  stacked: boolean;
}) {
  const { project, remote, stacked } = props;
  return (
    <span
      className={`${stacked ? "min-w-0 flex-1" : "ml-auto max-w-[9rem] shrink-0 pl-1"} flex items-center gap-1 text-[10px] leading-4 text-muted/70`}
    >
      {/* Sized to the tag, not the 16px menu default, so a
          custom icon reads as part of the 10px label. */}
      <ProjectIcon project={project} className="size-3 text-muted/70" />
      <span className="truncate">{project.name}</span>
      <ProjectRemoteServerChip info={remote} size="xs" />
      {/* Mirrors the grouped header's trailing WSL marker. */}
      {project.location.kind === "wsl" ? (
        <TuxIcon className="h-2.5 w-auto shrink-0 text-muted/60" />
      ) : null}
    </span>
  );
}

export const FlatListProjectTag = memo(
  FlatListProjectTagInner,
  (prev, next) =>
    prev.project === next.project &&
    prev.stacked === next.stacked &&
    prev.remote.isRemote === next.remote.isRemote &&
    prev.remote.serverName === next.remote.serverName &&
    prev.remote.status === next.remote.status,
);
