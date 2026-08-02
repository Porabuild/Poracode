import { useState } from "react";
import { AnimatedNumber } from "@/renderer/components/common/AnimatedNumber";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { Tooltip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useShallow } from "zustand/shallow";
import { useGitStore } from "@/renderer/state/gitStore";
import { useAppStore } from "@/renderer/state/appStore";
import { readBridge } from "@/renderer/bridge";
import { buildWorktreeLocation } from "@/shared/worktree";
import { handleKeyActivate } from "@/renderer/utils/a11y";
import {
  deriveSyncAction,
  runGitSyncCommand,
  showGitActionError,
} from "@/renderer/actions/gitCommandRunner";

export function SyncBadge(props: { projectId: string; worktreePath?: string }) {
  const { t } = useLingui();
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
      ? t`Push ↑${ahead}`
      : syncAction === "pull"
        ? t`Pull ↓${behind}`
        : t`Sync ↓${behind} ↑${ahead}`;

  async function handlePress() {
    if (isSyncing) return;
    setIsSyncing(true);
    const project = useAppStore.getState().projects.find((p) => p.id === props.projectId);
    if (!project) {
      setIsSyncing(false);
      return;
    }

    const location = props.worktreePath
      ? buildWorktreeLocation(project.location, props.worktreePath)
      : project.location;

    const refreshStatus = async () => {
      const newStatus = await readBridge().getGitStatus({ projectLocation: location });
      if (props.worktreePath) {
        useGitStore.getState().setWorktreeStatus(props.worktreePath, newStatus);
      } else {
        useGitStore.getState().setProjectSnapshot(props.projectId, { status: newStatus });
      }
    };

    try {
      if (syncAction === "push") {
        if (props.worktreePath) {
          const thread = useAppStore
            .getState()
            .threads.find(
              (candidate) =>
                candidate.worktreePath === props.worktreePath && candidate.worktreeBranch,
            );
          await runGitSyncCommand({
            command: "push",
            projectLocation: location,
            remote: "origin",
            ...(thread?.worktreeBranch ? { branch: thread.worktreeBranch } : {}),
            setUpstream: true,
          });
        } else {
          await runGitSyncCommand({
            command: "push",
            projectLocation: location,
            setUpstream: !hasTracking,
          });
        }
      } else if (syncAction === "pull") {
        await runGitSyncCommand({ command: "pull", projectLocation: location });
      } else {
        await runGitSyncCommand({ command: "sync", projectLocation: location });
      }

      // Eagerly refresh git status so the badge updates immediately.
      // The file watcher is disabled for WSL projects, so without this
      // the badge would stay stale until the next periodic fetch.
      await refreshStatus();
    } catch (error) {
      showGitActionError(error, {
        logPrefix: "[git] sidebar sync failed",
        ...(syncAction === "pull"
          ? {
              onStashAndPull: async () => {
                await runGitSyncCommand({
                  command: "pull",
                  projectLocation: location,
                  preserveLocalChanges: true,
                });
                await refreshStatus();
              },
            }
          : {}),
      });
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
          className="shrink-0 cursor-default rounded px-1 py-0.5 transition-colors text-muted/60 hover:bg-[var(--row-hover)] hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            void handlePress();
          }}
          onKeyDown={(e) =>
            handleKeyActivate(e, () => void handlePress(), { stopPropagation: true })
          }
        >
          <span className="flex items-center text-[10px] font-medium">
            {isSyncing ? (
              <PixelLoader size="xs" />
            ) : (
              <>
                {behind > 0 && <AnimatedNumber className="text-accent" value={behind} prefix="↓" />}
                {ahead > 0 && <AnimatedNumber className="text-accent" value={ahead} prefix="↑" />}
              </>
            )}
          </span>
        </div>
      </Tooltip.Trigger>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  );
}
