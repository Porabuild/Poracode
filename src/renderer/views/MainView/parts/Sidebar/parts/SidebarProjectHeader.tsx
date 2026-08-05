import { ChevronRight, FolderOpen, Server } from "lucide-react";
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
import { openFilesPanel, openGitReview } from "@/renderer/actions/panelActions";
import { openTerminal } from "@/renderer/actions/terminalActions";
import {
  useIsProjectFilesPanelActive,
  useIsProjectGitPanelActive,
  useIsProjectTerminalActive,
  useIsProjectTerminalBusy,
  useIsProjectTerminalOpen,
} from "@/renderer/hooks/uiSelectors";
import { useSidebarUiStore } from "@/renderer/state/sidebarUiStore";
import { formatProjectLocation } from "./formatProjectLocation";
import { AnimatedTerminalIcon } from "@/renderer/components/common/AnimatedTerminalIcon";
import { GitBadge } from "./GitBadge";
import { SidebarPanelDragButton } from "./SidebarPanelDragButton";
import { SyncBadge } from "./SyncBadge";
import { useProjectMenu } from "./useProjectMenu";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServerStatus } from "@/renderer/state/remoteServers/types";

export function SidebarProjectHeader(props: {
  project: Project;
  isCollapsed: boolean;
  isDragging: boolean;
  remoteStatus: RemoteServerStatus | undefined;
  isUnreachable: boolean;
}) {
  const { project, isCollapsed, isDragging, remoteStatus, isUnreachable } = props;
  const { t } = useLingui();
  const toggleProjectCollapsed = useSidebarUiStore((s) => s.toggleProjectCollapsed);
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
  const remoteServerName = remoteServer ? desktopTitle(remoteServer.label) : undefined;
  const remoteStatusLabel = useRemoteServerStatusLabel(remoteStatus ?? "offline");
  const isRemote = project.remoteServerId !== undefined && project.remoteId !== undefined;
  // Git, run-scripts and removal all execute on the project's host, so they are
  // unavailable while a mirrored project's server is unreachable. The row
  // tooltip carries the status, so the greyed-out items read as explained.
  const isUnavailable = isDisabled || isUnreachable;
  const showBody = !isCollapsed && !isUnavailable;
  const projectMenu = useProjectMenu(project, { isUnreachable });

  return (
    <ContextMenu items={projectMenu.items} onAction={projectMenu.onAction}>
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
          isUnavailable ? " opacity-50" : ""
        }`}
        onPress={() => {
          if (isUnavailable) return;
          toggleProjectCollapsed(project.id);
        }}
        isDragging={isDragging}
        suffix={
          isUnavailable ? null : (
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
