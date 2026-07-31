import {
  ChevronRight,
  EyeOff,
  FileDiff,
  FolderOpen,
  GitFork,
  Layers,
  Play,
  Power,
  PowerOff,
  RefreshCw,
  Server,
  Settings2,
  Trash2,
  Workflow,
} from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { Project } from "@/shared/contracts";
import { desktopTitle } from "@/shared/remote/desktopLabel";
import { TuxIcon } from "@/renderer/components/common/TuxIcon";
import {
  RemoteServerStatusDot,
  useRemoteServerStatusLabel,
} from "@/renderer/components/common/RemoteServerStatusDot";
import { ContextMenu } from "@/renderer/components/common/ContextMenu";
import { SidebarButton } from "@/renderer/components/common/SidebarButton";
import { setProjectDisabled, deleteProject } from "@/renderer/actions/projectActions";
import {
  openFilesPanel,
  openGitReview,
  openProjectSettings,
} from "@/renderer/actions/panelActions";
import { gitSync } from "@/renderer/actions/gitActions";
import {
  WORKSPACE_UNFILED_KEY,
  parseWorkspaceMenuKey,
  workspaceMenuKey,
} from "@/renderer/components/workspace/workspaceMenuKeys";
import { WorkspaceIcon } from "@/renderer/components/workspace/WorkspaceIcon";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { openTerminal, runProjectAction } from "@/renderer/actions/terminalActions";
import {
  useIsProjectFilesPanelActive,
  useIsProjectGitPanelActive,
  useIsProjectTerminalActive,
  useIsProjectTerminalBusy,
  useIsProjectTerminalOpen,
} from "@/renderer/hooks/uiSelectors";
import { useSidebarUiStore } from "@/renderer/state/sidebarUiStore";
import { resolveActionIcon } from "@/renderer/utils/actionIcons";
import { formatProjectLocation } from "./formatProjectLocation";
import { AnimatedTerminalIcon } from "@/renderer/components/common/AnimatedTerminalIcon";
import { GitBadge } from "./GitBadge";
import { SidebarPanelDragButton } from "./SidebarPanelDragButton";
import { SyncBadge } from "./SyncBadge";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";

export function SidebarProjectHeader(props: {
  project: Project;
  isCollapsed: boolean;
  isDragging: boolean;
}) {
  const { project, isCollapsed, isDragging } = props;
  const { t } = useLingui();
  const toggleProjectCollapsed = useSidebarUiStore((s) => s.toggleProjectCollapsed);
  const workspaces = useSharedSettings((s) => s.workspaces);
  const hasTerminal = useIsProjectTerminalOpen(project.id);
  const isActiveTerminal = useIsProjectTerminalActive(project.id);
  const isBusyTerminal = useIsProjectTerminalBusy(project.id);
  const isActiveGitPanel = useIsProjectGitPanelActive(project.id);
  const isActiveFilesPanel = useIsProjectFilesPanelActive(project.id);
  const projectLocation = formatProjectLocation(project);
  const isDisabled = !!project.disabled;
  const remoteServer = useRemoteServersStore((state) =>
    project.remoteServerId
      ? state.servers.find((server) => server.desktopId === project.remoteServerId)
      : undefined,
  );
  const remoteStatus = useRemoteServersStore((state) =>
    project.remoteServerId ? state.runtime[project.remoteServerId]?.status : undefined,
  );
  const setRemoteProjectSynced = useRemoteServersStore((state) => state.setRemoteProjectSynced);
  const remoteServerName = remoteServer ? desktopTitle(remoteServer.label) : undefined;
  const remoteStatusLabel = useRemoteServerStatusLabel(remoteStatus ?? "offline");
  const isRemote = project.remoteServerId !== undefined && project.remoteId !== undefined;
  // Git, run-scripts and removal all execute on the project's host, so they are
  // unavailable while a mirrored project's server is unreachable. The row
  // tooltip carries the status, so the greyed-out items read as explained.
  const isUnreachable = project.remoteServerId !== undefined && remoteStatus !== "online";
  const showBody = !isCollapsed && !isDisabled;

  return (
    <ContextMenu
      items={[
        {
          id: "project-settings",
          label: t`Project Settings`,
          icon: <Settings2 className="size-3.5" />,
        },
        ...(isDisabled
          ? []
          : [
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
                      items: project.scripts.actions.map((action) => ({
                        id: `action:${action.id}`,
                        label: action.name,
                        icon: resolveActionIcon(action.icon),
                        isDisabled: isUnreachable,
                      })),
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
      ]}
      onAction={(key) => {
        if (key === "project-settings") openProjectSettings(project.id);
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
        const workspaceChoice = parseWorkspaceMenuKey(key);
        if (workspaceChoice?.kind === "unfiled") {
          useAppStore.getState().setProjectWorkspace(project.id, undefined);
        } else if (workspaceChoice?.kind === "workspace") {
          useAppStore.getState().setProjectWorkspace(project.id, workspaceChoice.workspaceId);
        }
      }}
    >
      <SidebarButton
        icon={
          <ChevronRight
            className={`size-3.5 shrink-0 text-muted transition-transform ${
              showBody ? "rotate-90" : ""
            }`}
          />
        }
        label={
          <span className="flex items-center gap-1.5">
            <span className="truncate text-xs font-semibold text-foreground">{project.name}</span>
            {isRemote || remoteServerName ? (
              <span className="relative flex shrink-0">
                <Server className="size-3 text-muted/60" />
                {remoteServerName ? (
                  <RemoteServerStatusDot
                    status={remoteStatus ?? "offline"}
                    className="absolute -right-0.5 -bottom-0.5"
                  />
                ) : null}
              </span>
            ) : null}
            {remoteServerName ? (
              <span className="max-w-24 truncate text-[10px] font-normal text-muted/60">
                {remoteServerName}
              </span>
            ) : null}
            {project.location.kind === "wsl" && (
              <TuxIcon className="h-3 w-auto shrink-0 text-muted/60" />
            )}
          </span>
        }
        tooltip={
          isDisabled
            ? t`${projectLocation} (disabled)`
            : remoteServerName
              ? `${projectLocation} · ${remoteServerName} · ${remoteStatusLabel}`
              : projectLocation
        }
        className={`poracode-sidebar-project-nudge !pl-1${isDragging ? " opacity-60" : ""}${
          isDisabled ? " opacity-50" : ""
        }`}
        onPress={() => {
          if (isDisabled) return;
          toggleProjectCollapsed(project.id);
        }}
        isDragging={isDragging}
        suffix={
          isDisabled ? null : (
            <>
              <SidebarPanelDragButton
                panel="files"
                projectId={project.id}
                ariaLabel={t`Files for ${project.name}`}
                className={`shrink-0 cursor-grab rounded p-0.5 transition-colors hover:bg-[var(--row-hover)] hover:text-foreground active:cursor-grabbing ${
                  isActiveFilesPanel
                    ? "text-accent"
                    : "text-muted/60 opacity-0 group-hover:opacity-100"
                }`}
                onPress={() => openFilesPanel(project.id)}
              >
                <FolderOpen className="size-3.5" />
              </SidebarPanelDragButton>
              <SidebarPanelDragButton
                panel="terminal"
                projectId={project.id}
                ariaLabel={t`Terminal for ${project.name}`}
                className={`shrink-0 cursor-grab rounded p-0.5 transition-colors hover:bg-[var(--row-hover)] hover:text-foreground active:cursor-grabbing ${
                  isActiveTerminal
                    ? "text-accent"
                    : hasTerminal
                      ? "text-foreground"
                      : "text-muted/60 opacity-0 group-hover:opacity-100"
                }`}
                onPress={() => openTerminal(project.id)}
              >
                <AnimatedTerminalIcon isBusy={isBusyTerminal} className="size-3.5" />
              </SidebarPanelDragButton>
              <SyncBadge projectId={project.id} />
              <GitBadge
                projectId={project.id}
                projectName={project.name}
                onPress={() => openGitReview(project.id)}
                isActive={isActiveGitPanel}
              />
            </>
          )
        }
      />
    </ContextMenu>
  );
}
