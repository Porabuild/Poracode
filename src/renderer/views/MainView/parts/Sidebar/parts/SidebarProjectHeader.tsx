import { ChevronRight, FolderOpen } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { Project } from "@/shared/contracts";
import { TuxIcon } from "@/renderer/components/common/TuxIcon";
import { useRemoteServerStatusLabel } from "@/renderer/components/common/RemoteServerStatusDot";
import {
  ProjectRemoteServerIcon,
  useProjectRemoteServer,
} from "@/renderer/components/common/ProjectRemoteServer";
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

export function SidebarProjectHeader(props: {
  project: Project;
  isCollapsed: boolean;
  isDragging: boolean;
  isUnreachable: boolean;
}) {
  const { project, isCollapsed, isDragging, isUnreachable } = props;
  const { t } = useLingui();
  const toggleProjectCollapsed = useSidebarUiStore((s) => s.toggleProjectCollapsed);
  const hasTerminal = useIsProjectTerminalOpen(project.id);
  const isActiveTerminal = useIsProjectTerminalActive(project.id);
  const isBusyTerminal = useIsProjectTerminalBusy(project.id);
  const isActiveGitPanel = useIsProjectGitPanelActive(project.id);
  const isActiveFilesPanel = useIsProjectFilesPanelActive(project.id);
  const projectLocation = formatProjectLocation(project);
  const isDisabled = !!project.disabled;
  const remote = useProjectRemoteServer(project);
  const remoteStatusLabel = useRemoteServerStatusLabel(remote.status ?? "offline");
  // Git, run-scripts and removal all execute on the project's host, so they are
  // unavailable while a mirrored project's server is unreachable. The row
  // tooltip carries the status, so the greyed-out items read as explained.
  const isUnavailable = isDisabled || isUnreachable;
  const showBody = !isCollapsed && !isUnavailable;
  const projectMenu = useProjectMenu(project, { isUnreachable });
  // Same collapse footprint as thread / worktree panel buttons so idle icons
  // free horizontal space for the project title.
  const hiddenPanelButtonClass =
    "w-0 -mr-[3px] overflow-hidden p-0 opacity-0 pointer-events-none group-hover:w-[18px] group-hover:mr-0 group-hover:p-0.5 group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:w-[18px] focus-visible:mr-0 focus-visible:p-0.5 focus-visible:opacity-100 focus-visible:pointer-events-auto";
  const panelButtonBaseClass =
    "flex h-[18px] shrink-0 cursor-grab items-center justify-center rounded transition-[opacity,color,background-color] hover:bg-[var(--row-hover)] hover:text-foreground active:cursor-grabbing";

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
            <ProjectRemoteServerIcon info={remote} />
            {/* Own span rather than the shared chip: the machine name has to
                undo the project name's `font-semibold` beside it. */}
            {remote.serverName ? (
              <span className="max-w-24 truncate text-[10px] font-normal text-muted/60">
                {remote.serverName}
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
            : remote.serverName
              ? `${projectLocation} · ${remote.serverName} · ${remoteStatusLabel}`
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
                className={`${panelButtonBaseClass} ${
                  isActiveFilesPanel
                    ? "w-[18px] p-0.5 text-accent"
                    : `text-muted/60 ${hiddenPanelButtonClass}`
                }`}
                onPress={() => openFilesPanel(project.id)}
              >
                <FolderOpen className="size-3.5" />
              </SidebarPanelDragButton>
              <SidebarPanelDragButton
                panel="terminal"
                projectId={project.id}
                ariaLabel={t`Terminal for ${project.name}`}
                className={`${panelButtonBaseClass} ${
                  isActiveTerminal
                    ? "w-[18px] p-0.5 text-accent"
                    : hasTerminal
                      ? "w-[18px] p-0.5 text-foreground"
                      : `text-muted/60 ${hiddenPanelButtonClass}`
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
