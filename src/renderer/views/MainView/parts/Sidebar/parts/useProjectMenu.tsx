import {
  EyeOff,
  FileDiff,
  GitFork,
  Layers,
  Loader2,
  Play,
  Power,
  PowerOff,
  RefreshCw,
  Settings2,
  Square,
  SquareTerminal,
  Trash2,
  Workflow,
} from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { Project } from "@/shared/contracts";
import type { ContextMenuEntry, ContextMenuItem } from "@/renderer/components/common/ContextMenu";
import { setProjectDisabled, deleteProject } from "@/renderer/actions/projectActions";
import { openGitReview, openProjectSettings } from "@/renderer/actions/panelActions";
import { gitSync } from "@/renderer/actions/gitActions";
import {
  runProjectAction,
  showTerminalPanel,
  stopProjectAction,
} from "@/renderer/actions/terminalActions";
import {
  WORKSPACE_UNFILED_KEY,
  parseWorkspaceMenuKey,
  workspaceMenuKey,
} from "@/renderer/components/workspace/workspaceMenuKeys";
import { WorkspaceIcon } from "@/renderer/components/workspace/WorkspaceIcon";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { resolveActionIcon } from "@/renderer/utils/actionIcons";
import { useRunningProjectActionIds } from "@/renderer/hooks/uiSelectors";

/**
 * The project context menu: entries plus their action dispatcher, shared by
 * every surface that offers project actions — the grouped sidebar's project
 * header (right-click) and the flat list's project filter rows (overflow
 * button). `isUnreachable` greys out entries that execute on the project's
 * host (terminal, git, run-scripts, removal) while a mirrored project's server is down.
 */
export function useProjectMenu(
  project: Project,
  options: { isUnreachable: boolean },
): { items: ContextMenuEntry[]; onAction: (key: string) => void } {
  const { t } = useLingui();
  const { isUnreachable } = options;
  const workspaces = useSharedSettings((s) => s.workspaces);
  const setRemoteProjectSynced = useRemoteServersStore((state) => state.setRemoteProjectSynced);
  const isDisabled = !!project.disabled;
  const isRemote = project.remoteServerId !== undefined && project.remoteId !== undefined;
  const runningActionIds = useRunningProjectActionIds(project.id);
  const runActionItems: ContextMenuItem[] = [];
  for (const action of project.scripts?.actions ?? []) {
    const isRunning = runningActionIds.includes(action.id);
    runActionItems.push({
      id: `action:${action.id}`,
      label: action.name,
      icon: isRunning ? (
        <Loader2 className="size-3.5 animate-spin text-accent" aria-hidden />
      ) : (
        resolveActionIcon(action.icon)
      ),
      isDisabled: isUnreachable,
      ...(isRunning
        ? {
            endAction: {
              id: `stop-action:${action.id}`,
              label: t`Stop ${action.name}`,
              icon: <Square className="size-3 fill-current" aria-hidden />,
              isDisabled: isUnreachable,
            },
          }
        : {}),
    });
  }

  const items: ContextMenuEntry[] = [
    {
      id: "project-settings",
      label: t`Project Settings`,
      icon: <Settings2 className="size-3.5" />,
    },
    ...(isDisabled
      ? []
      : [
          {
            id: "open-terminal",
            label: t`Open terminal`,
            icon: <SquareTerminal className="size-3.5" />,
            isDisabled: isUnreachable,
          },
          {
            type: "submenu" as const,
            id: "git",
            label: t`Git`,
            icon: <GitFork className="size-3.5" />,
            items: [
              {
                id: "git-review",
                label: t`Review Changes`,
                icon: <FileDiff className="size-3.5" />,
                isDisabled: isUnreachable,
              },
              {
                id: "github-actions",
                label: t`GitHub Actions`,
                icon: <Workflow className="size-3.5" />,
                isDisabled: isUnreachable,
              },
              {
                id: "git-sync",
                label: t`Sync`,
                icon: <RefreshCw className="size-3.5" />,
                isDisabled: isUnreachable,
              },
            ],
          },
          ...(project.scripts?.actions?.length
            ? [
                {
                  type: "submenu" as const,
                  id: "run-action",
                  label: t`Run`,
                  icon: <Play className="size-3.5" />,
                  items: runActionItems,
                },
              ]
            : []),
        ]),
    ...(workspaces.length > 1
      ? [
          {
            type: "submenu" as const,
            id: "move-to-workspace",
            label: t`Move to Workspace`,
            icon: <Layers className="size-3.5" />,
            items: [
              ...workspaces.map((workspace) => ({
                id: workspaceMenuKey(workspace.id),
                label: workspace.name,
                icon: <WorkspaceIcon icon={workspace.icon} className="size-3.5" />,
                isDisabled: workspace.id === project.workspaceId,
              })),
              {
                id: WORKSPACE_UNFILED_KEY,
                label: t`All workspaces`,
                icon: <Layers className="size-3.5" />,
                isDisabled: !project.workspaceId,
              },
            ],
          },
        ]
      : []),
    {
      id: "toggle-disabled",
      label: isDisabled ? t`Enable Project` : t`Disable Project`,
      icon: isDisabled ? <Power className="size-3.5" /> : <PowerOff className="size-3.5" />,
    },
    // Dropping a mirrored project from this client is local state, so it
    // stays available while the server is offline — unlike Remove Project,
    // which deletes it on the host.
    ...(isRemote
      ? [
          {
            id: "stop-syncing",
            label: t`Stop syncing`,
            icon: <EyeOff className="size-3.5" />,
          },
        ]
      : []),
    {
      id: "remove-project",
      label: t`Remove Project`,
      icon: <Trash2 className="size-3.5" />,
      variant: "danger" as const,
      isDisabled: isUnreachable,
    },
  ];

  const onAction = (key: string) => {
    if (key === "project-settings") openProjectSettings(project.id);
    if (key === "open-terminal") showTerminalPanel(project.id);
    if (key === "stop-syncing" && project.remoteServerId && project.remoteId) {
      setRemoteProjectSynced(project.remoteServerId, project.remoteId, false);
    }
    if (key === "remove-project") deleteProject(project.id);
    if (key === "toggle-disabled") setProjectDisabled(project.id, !isDisabled);
    if (key === "git-review") openGitReview(project.id);
    if (key === "github-actions") {
      useAppStore.getState().openGitHubActions(project.id);
    }
    if (key === "git-sync") gitSync(project.id);
    if (key.startsWith("action:")) {
      runProjectAction(project.id, key.slice("action:".length));
    }
    if (key.startsWith("stop-action:")) {
      stopProjectAction(project.id, key.slice("stop-action:".length));
    }
    const workspaceChoice = parseWorkspaceMenuKey(key);
    if (workspaceChoice?.kind === "unfiled") {
      useAppStore.getState().setProjectWorkspace(project.id, undefined);
    } else if (workspaceChoice?.kind === "workspace") {
      useAppStore.getState().setProjectWorkspace(project.id, workspaceChoice.workspaceId);
    }
  };

  return { items, onAction };
}
