import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Tooltip } from "@heroui/react";
import { useShallow } from "zustand/shallow";
import { useGitStore } from "../../state/gitStore";
import { useAppStore } from "../../state/appStore";
import { readBridge } from "../../bridge";
import { buildWorktreeLocation } from "../../../shared/worktree";
import type { SyncAction } from "./useWorktreeActions";

function deriveSyncAction(hasTracking: boolean, ahead: number, behind: number): SyncAction {
  if (!hasTracking) return "push";
  if (ahead > 0 && behind === 0) return "push";
  if (behind > 0 && ahead === 0) return "pull";
  return "sync";
}

export function SyncBadge(props: { projectId: string; worktreePath?: string }) {
  const { ahead, behind, hasTracking, hasRemote } = useGitStore(
    useShallow((s) => {
      const status = props.worktreePath
        ? s.worktreeStatuses[props.worktreePath]
        : s.statuses[props.projectId];
      return {
        ahead: status?.ahead ?? 0,
        behind: status?.behind ?? 0,
        hasTracking: Boolean(status?.tracking),
        hasRemote: status?.hasRemote ?? false,
      };
    }),
  );

  const [isSyncing, setIsSyncing] = useState(false);

  if (ahead === 0 && behind === 0) return null;
  if (!hasRemote) return null;

  const syncAction = deriveSyncAction(hasTracking, ahead, behind);

  const label =
    syncAction === "push"
      ? `Push ↑${ahead}`
      : syncAction === "pull"
        ? `Pull ↓${behind}`
        : `Sync ↓${behind} ↑${ahead}`;

  async function handlePress() {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const project = useAppStore.getState().projects.find((p) => p.id === props.projectId);
      if (!project) return;

      const location = props.worktreePath
        ? buildWorktreeLocation(project.location, props.worktreePath)
        : project.location;

      if (syncAction === "push") {
        if (props.worktreePath) {
          const thread = useAppStore
            .getState()
            .threads.find((t) => t.worktreePath === props.worktreePath && t.worktreeBranch);
          await readBridge().gitPush({
            projectLocation: location,
            remote: "origin",
            branch: thread?.worktreeBranch ?? undefined,
            setUpstream: true,
          });
        } else {
          await readBridge().gitPush({
            projectLocation: location,
            setUpstream: !hasTracking,
          });
        }
      } else if (syncAction === "pull") {
        await readBridge().gitPull({ projectLocation: location });
      } else {
        await readBridge().gitSync({ projectLocation: location });
      }
    } catch {
      // Errors will be visible via git status refresh
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <Tooltip delay={300}>
      <Tooltip.Trigger>
        <div
          role="button"
          tabIndex={0}
          aria-label={label}
          className="shrink-0 cursor-default rounded px-1 py-0.5 transition-colors text-muted/60 hover:bg-white/[0.04] hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            void handlePress();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              void handlePress();
            }
          }}
        >
          <span className="flex items-center text-[10px] font-medium">
            {isSyncing ? (
              <Loader2 className="size-2.5 animate-spin" />
            ) : (
              <>
                {behind > 0 && <span className="text-accent">↓{behind}</span>}
                {ahead > 0 && <span className="text-accent">↑{ahead}</span>}
              </>
            )}
          </span>
        </div>
      </Tooltip.Trigger>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  );
}
