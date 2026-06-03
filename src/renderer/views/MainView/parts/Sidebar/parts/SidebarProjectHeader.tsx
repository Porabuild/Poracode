import { useEffect, useState } from "react";
import {
  ChevronRight,
  FileDiff,
  FolderOpen,
  GitFork,
  Play,
  Power,
  PowerOff,
  RefreshCw,
  Server,
  Settings2,
  Trash2,
} from "lucide-react";
import type { Project } from "@/shared/contracts";
import { TuxIcon } from "@/renderer/components/common/TuxIcon";
import { ContextMenu, SidebarButton } from "@/renderer/components/common";
import { setProjectDisabled, deleteProject } from "@/renderer/actions/projectActions";
import {
  openFilesPanel,
  openGitReview,
  openProjectSettings,
} from "@/renderer/actions/panelActions";
import { gitSync } from "@/renderer/actions/gitActions";
import { openTerminal, runProjectAction } from "@/renderer/actions/terminalActions";
import { readBridge } from "@/renderer/bridge";
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

type SshProjectStatus = "checking" | "connected" | "error" | "disconnected";

export function SidebarProjectHeader(props: {
  project: Project;
  isCollapsed: boolean;
  isDragging: boolean;
}) {
  const { project, isCollapsed, isDragging } = props;
  const toggleProjectCollapsed = useSidebarUiStore((s) => s.toggleProjectCollapsed);
  const hasTerminal = useIsProjectTerminalOpen(project.id);
  const isActiveTerminal = useIsProjectTerminalActive(project.id);
  const isBusyTerminal = useIsProjectTerminalBusy(project.id);
  const isActiveGitPanel = useIsProjectGitPanelActive(project.id);
  const isActiveFilesPanel = useIsProjectFilesPanelActive(project.id);
  const projectLocation = formatProjectLocation(project);
  const isDisabled = !!project.disabled;
  const [sshStatus, setSshStatus] = useState<SshProjectStatus>(
    isDisabled ? "disconnected" : "checking",
  );
  const [sshStatusMessage, setSshStatusMessage] = useState("");
  const isSshProject = project.location.kind === "ssh";
  const sshHost = project.location.kind === "ssh" ? project.location.host : undefined;
  const sshPath = project.location.kind === "ssh" ? project.location.path : undefined;
  const shouldReconnect = isSshProject && (isDisabled || sshStatus === "error");
  const toggleDisabledIconIsPower = isSshProject ? shouldReconnect : isDisabled;
  const toggleDisabledLabel = isSshProject
    ? shouldReconnect
      ? "Reconnect"
      : "Disconnect"
    : isDisabled
      ? "Enable Project"
      : "Disable Project";
  const showBody = !isCollapsed && !isDisabled;
  const sshIconClass =
    sshStatus === "connected"
      ? "text-success"
      : sshStatus === "error"
        ? "text-danger"
        : sshStatus === "checking"
          ? "text-accent"
          : "text-muted/40";
  const sshTooltip =
    sshStatus === "connected"
      ? "Connected"
      : sshStatus === "checking"
        ? "Checking connection"
        : sshStatus === "error"
          ? sshStatusMessage || "Connection failed"
          : "Disconnected";

  async function checkSshConnection(): Promise<boolean> {
    if (!isSshProject) return true;
    setSshStatus("checking");
    setSshStatusMessage("");
    try {
      const result = await readBridge().checkSshProjectConnection({
        projectLocation: project.location,
      });
      setSshStatus(result.ok ? "connected" : "error");
      setSshStatusMessage(result.message ?? "");
      return result.ok;
    } catch (error) {
      setSshStatus("error");
      setSshStatusMessage(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  useEffect(() => {
    // Key off the SSH host/path primitives rather than the `project.location`
    // object: the projects array (and the derived project object) is rebuilt on
    // unrelated store updates, so depending on the object reference would
    // re-spawn an `ssh` probe and flicker the badge on every such render.
    if (sshHost === undefined || sshPath === undefined) return;
    if (isDisabled) {
      setSshStatus("disconnected");
      setSshStatusMessage("");
      return;
    }
    let cancelled = false;
    setSshStatus("checking");
    setSshStatusMessage("");
    void readBridge()
      .checkSshProjectConnection({
        projectLocation: { kind: "ssh", host: sshHost, path: sshPath },
      })
      .then((result) => {
        if (cancelled) return;
        setSshStatus(result.ok ? "connected" : "error");
        setSshStatusMessage(result.message ?? "");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSshStatus("error");
        setSshStatusMessage(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [isDisabled, sshHost, sshPath]);

  function handleToggleDisabled() {
    if (!isSshProject) {
      setProjectDisabled(project.id, !isDisabled);
      return;
    }
    if (!shouldReconnect) {
      setSshStatus("disconnected");
      setSshStatusMessage("");
      setProjectDisabled(project.id, true);
      return;
    }
    void checkSshConnection().then((connected) => {
      if (connected) setProjectDisabled(project.id, false);
    });
  }

  return (
    <ContextMenu
      items={[
        {
          id: "project-settings",
          label: "Project Settings",
          icon: <Settings2 className="size-3.5" />,
        },
        ...(isDisabled
          ? []
          : [
              {
                type: "submenu" as const,
                id: "git",
                label: "Git",
                icon: <GitFork className="size-3.5" />,
                items: [
                  {
                    id: "git-review",
                    label: "Review Changes",
                    icon: <FileDiff className="size-3.5" />,
                  },
                  {
                    id: "git-sync",
                    label: "Sync",
                    icon: <RefreshCw className="size-3.5" />,
                  },
                ],
              },
              ...(project.scripts?.actions?.length
                ? [
                    {
                      type: "submenu" as const,
                      id: "run-action",
                      label: "Run",
                      icon: <Play className="size-3.5" />,
                      items: project.scripts.actions.map((action) => ({
                        id: `action:${action.id}`,
                        label: action.name,
                        icon: resolveActionIcon(action.icon),
                      })),
                    },
                  ]
                : []),
            ]),
        {
          id: "toggle-disabled",
          label: toggleDisabledLabel,
          icon: toggleDisabledIconIsPower ? (
            <Power className="size-3.5" />
          ) : (
            <PowerOff className="size-3.5" />
          ),
        },
        {
          id: "remove-project",
          label: "Remove Project",
          icon: <Trash2 className="size-3.5" />,
          variant: "danger" as const,
        },
      ]}
      onAction={(key) => {
        if (key === "project-settings") openProjectSettings(project.id);
        if (key === "remove-project") deleteProject(project.id);
        if (key === "toggle-disabled") handleToggleDisabled();
        if (key === "git-review") openGitReview(project.id);
        if (key === "git-sync") gitSync(project.id);
        if (key.startsWith("action:")) {
          runProjectAction(project.id, key.slice("action:".length));
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
            {project.location.kind === "wsl" && (
              <TuxIcon className="h-3 w-auto shrink-0 text-muted/60" />
            )}
            {isSshProject && <Server className={`size-3 shrink-0 ${sshIconClass}`} />}
          </span>
        }
        tooltip={
          isSshProject
            ? `${projectLocation} (${sshTooltip})`
            : isDisabled
              ? `${projectLocation} (disabled)`
              : projectLocation
        }
        className={`lightcode-sidebar-project-nudge !pl-1${isDragging ? " opacity-60" : ""}${
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
                ariaLabel={`Files for ${project.name}`}
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
                ariaLabel={`Terminal for ${project.name}`}
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
