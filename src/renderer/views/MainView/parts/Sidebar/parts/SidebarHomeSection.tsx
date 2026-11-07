import { ChevronRight, House } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { Project } from "@/shared/contracts";
import { openTerminal } from "@/renderer/actions/terminalActions";
import { AnimatedTerminalIcon } from "@/renderer/components/common/AnimatedTerminalIcon";
import {
  ProjectRemoteServerIcon,
  useProjectRemoteServer,
} from "@/renderer/components/common/ProjectRemoteServer";
import { useRemoteServerStatusLabel } from "@/renderer/components/common/RemoteServerStatusDot";
import { SidebarButton } from "@/renderer/components/common/SidebarButton";
import {
  useIsProjectTerminalActive,
  useIsProjectTerminalBusy,
  useIsProjectTerminalOpen,
} from "@/renderer/hooks/uiSelectors";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { isRemoteProjectStatusUnreachable } from "@/renderer/state/remoteServers/reachability";
import { useIsProjectCollapsed, useSidebarUiStore } from "@/renderer/state/sidebarUiStore";
import { SidebarPanelDragButton } from "./SidebarPanelDragButton";
import { SidebarProjectThreadList } from "./SidebarProjectThreadList";
import type { ThreadSortMode } from "./sortMode";

function HomeTerminalButton(props: { projectId: string; projectName: string }) {
  const { t } = useLingui();
  const hasTerminal = useIsProjectTerminalOpen(props.projectId);
  const isActiveTerminal = useIsProjectTerminalActive(props.projectId);
  const isBusy = useIsProjectTerminalBusy(props.projectId);
  // Match thread / project-header collapse so idle home terminal does not
  // reserve row width for the project title.
  const hiddenPanelButtonClass =
    "w-0 -mr-[3px] overflow-hidden p-0 opacity-0 pointer-events-none group-hover:w-[18px] group-hover:mr-0 group-hover:p-0.5 group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:w-[18px] focus-visible:mr-0 focus-visible:p-0.5 focus-visible:opacity-100 focus-visible:pointer-events-auto";
  return (
    <SidebarPanelDragButton
      panel="terminal"
      projectId={props.projectId}
      ariaLabel={t`Terminal for ${props.projectName}`}
      className={`flex h-[18px] shrink-0 cursor-grab items-center justify-center rounded transition-[opacity,color,background-color] hover:bg-[var(--row-hover)] hover:text-foreground active:cursor-grabbing ${
        isActiveTerminal
          ? "w-[18px] p-0.5 text-accent"
          : hasTerminal
            ? "w-[18px] p-0.5 text-foreground"
            : `text-muted/60 ${hiddenPanelButtonClass}`
      }`}
      onPress={() => openTerminal(props.projectId)}
    >
      <AnimatedTerminalIcon className="size-3.5" isBusy={isBusy} />
    </SidebarPanelDragButton>
  );
}

/**
 * One Home group. A browser client paired with several machines mirrors each
 * machine's Home, so the group names its machine and greys out while that
 * machine is unreachable, the way project headers do.
 */
export function SidebarHomeSection(props: { project: Project; sortMode: ThreadSortMode }) {
  const { project } = props;
  const isCollapsed = useIsProjectCollapsed(project.id);
  const toggleProjectCollapsed = useSidebarUiStore((s) => s.toggleProjectCollapsed);
  const remote = useProjectRemoteServer(project);
  const remoteStatus = useRemoteServersStore((state) =>
    project.remoteServerId ? state.runtime[project.remoteServerId]?.status : undefined,
  );
  const remoteStatusLabel = useRemoteServerStatusLabel(remote.status ?? "offline");
  const isUnreachable = isRemoteProjectStatusUnreachable(project, remoteStatus);
  const showBody = !isCollapsed && !isUnreachable;

  return (
    <section className="space-y-0.5">
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
            <House className="size-3.5 shrink-0 text-muted" />
            <span className="truncate text-xs font-semibold text-foreground">
              <Trans>Home</Trans>
            </span>
            <ProjectRemoteServerIcon info={remote} />
            {remote.serverName ? (
              <span className="max-w-24 truncate text-[10px] font-normal text-muted/60">
                {remote.serverName}
              </span>
            ) : null}
          </span>
        }
        tooltip={remote.serverName ? `${remote.serverName} · ${remoteStatusLabel}` : undefined}
        className={`poracode-sidebar-project-nudge !pl-1${isUnreachable ? " opacity-50" : ""}`}
        onPress={() => {
          if (isUnreachable) return;
          toggleProjectCollapsed(project.id);
        }}
        suffix={
          isUnreachable ? null : (
            <HomeTerminalButton projectId={project.id} projectName={project.name} />
          )
        }
      />
      {showBody ? <SidebarProjectThreadList project={project} sortMode={props.sortMode} /> : null}
    </section>
  );
}
