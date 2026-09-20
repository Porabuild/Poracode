import type { ReactNode } from "react";
import { FolderOpen, House, Monitor } from "lucide-react";
import { useShallow } from "zustand/shallow";
import type { Project } from "@/shared/contracts";
import { isHomeProject } from "@/shared/homeScope";
import { desktopTitle } from "@/shared/remote/desktopLabel";
import { createArrayKeyedMap } from "@/renderer/state/derivations";
import { remoteOwner } from "@/renderer/state/remoteProjection";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServerRecord, RemoteServerStatus } from "@/renderer/state/remoteServers/types";
import { useProjectIconNode } from "./ProjectIcon";
import { RemoteServerIcon } from "./RemoteServerIcon";
import { RemoteServerStatusDot } from "./RemoteServerStatusDot";
import { TuxIcon } from "./TuxIcon";

/** What a surface needs to show that a project lives on another machine. */
export interface ProjectRemoteServerInfo {
  /** The project mirrors a project hosted on a paired machine. */
  readonly isRemote: boolean;
  /** Machine name to display, when its pairing record is still known. */
  readonly serverName: string | undefined;
  /** Live connection status of that machine, when known. */
  readonly status: RemoteServerStatus | undefined;
}

interface ProjectRemoteServerSource {
  readonly remoteServerId?: string | undefined;
  readonly remoteId?: string | undefined;
  readonly location?: { readonly remoteServerId?: string | undefined } | undefined;
}

const LOCAL: ProjectRemoteServerInfo = {
  isRemote: false,
  serverName: undefined,
  status: undefined,
};

const serverByDesktopId = createArrayKeyedMap<RemoteServerRecord, string, RemoteServerRecord>(
  (servers) => new Map(servers.map((server) => [server.desktopId, server])),
);

/**
 * Resolver for a project's hosting machine, shared by every surface that lists
 * projects (sidebar sections, flat thread rows, the project filter, the
 * composer switcher).
 *
 * Returns a lookup rather than the info itself so list surfaces can resolve
 * many projects from one subscription — calling a hook per row is not allowed.
 */
export function useProjectRemoteServerLookup(): (
  project: ProjectRemoteServerSource | undefined,
) => ProjectRemoteServerInfo {
  const servers = useRemoteServersStore((state) => state.servers);
  // Only the status is displayed, and the runtime map is rebuilt wholesale on
  // every snapshot refresh — comparing the statuses alone keeps thread and
  // project traffic from re-rendering every project list.
  const statuses = useRemoteServersStore(
    useShallow((state) => {
      const byDesktopId: Record<string, RemoteServerStatus> = {};
      for (const [desktopId, runtime] of Object.entries(state.runtime)) {
        byDesktopId[desktopId] = runtime.status;
      }
      return byDesktopId;
    }),
  );
  return (project) => {
    const desktopId = project?.remoteServerId ?? project?.location?.remoteServerId;
    if (!desktopId || !project) return LOCAL;
    const server = serverByDesktopId(servers, desktopId);
    return {
      // An unpaired-but-mirrored project still reads as non-local, so the
      // glyph shows even once the machine record is gone.
      isRemote:
        remoteOwner(project) !== undefined ||
        project.location?.remoteServerId !== undefined ||
        server !== undefined,
      serverName: server ? desktopTitle(server.label) : undefined,
      status: statuses[desktopId],
    };
  };
}

/** Single-project form, for surfaces that render exactly one project. */
export function useProjectRemoteServer(project: Project): ProjectRemoteServerInfo {
  return useProjectRemoteServerLookup()(project);
}

/**
 * Machine glyph for a mirrored project, carrying the pairing status light. The
 * light is omitted when the machine is unknown, since there is no connection to
 * report — the bare glyph still marks the project as non-local.
 */
export function ProjectRemoteServerIcon(props: {
  info: ProjectRemoteServerInfo;
  /**
   * Glyph size and colour, so the icon sits at the same weight as whatever
   * icons it stands beside; the status light keeps its own palette.
   */
  className?: string | undefined;
  /** Status-light diameter — shrinks with the glyph on dense rows. */
  dotClassName?: string | undefined;
}) {
  const { info } = props;
  if (!info.isRemote && !info.serverName) return null;
  return (
    <RemoteServerIcon
      status={info.serverName ? (info.status ?? "offline") : null}
      className={props.className ?? "size-3 text-muted/60"}
      {...(props.dotClassName ? { dotClassName: props.dotClassName } : {})}
    />
  );
}

export function ProjectLocationIcon(props: {
  location: Project["location"];
  className?: string | undefined;
}) {
  if (props.location.kind === "wsl") {
    return (
      <span
        className={`${props.className ?? "size-4"} relative inline-flex shrink-0 items-center justify-center text-muted`}
        aria-hidden="true"
      >
        <TuxIcon className="size-full" />
      </span>
    );
  }
  const className = `${props.className ?? "size-4"} shrink-0 text-muted`;
  return props.location.kind === "windows" ? (
    <Monitor className={className} />
  ) : (
    <FolderOpen className={className} />
  );
}

/**
 * Keep a mirrored project's connection light on a custom icon. That icon takes
 * the machine glyph's slot, and in project selectors the machine glyph carries
 * the only online/offline indicator on the row.
 */
export function ProjectIconWithRemoteStatus(props: {
  icon: ReactNode;
  info: ProjectRemoteServerInfo;
  dotClassName?: string | undefined;
}) {
  if (!props.info.serverName) return props.icon;
  return (
    <span className="relative flex shrink-0">
      {props.icon}
      <RemoteServerStatusDot
        status={props.info.status ?? "offline"}
        {...(props.dotClassName ? { sizeClassName: props.dotClassName } : {})}
        className="absolute -right-0.5 -bottom-0.5"
      />
    </span>
  );
}

/** Leading glyph shared by project selectors: Home, host machine, or local path kind. */
export function ProjectSelectorIcon(props: {
  project: Project;
  remote: ProjectRemoteServerInfo;
  className?: string | undefined;
}) {
  const customIcon = useProjectIconNode(props.project, `${props.className ?? "size-4"} text-muted`);
  if (customIcon) {
    return (
      <ProjectIconWithRemoteStatus icon={customIcon} info={props.remote} dotClassName="size-1" />
    );
  }
  if (isHomeProject(props.project)) {
    return <House className={`${props.className ?? "size-4"} shrink-0 text-muted`} />;
  }
  if (props.remote.isRemote) {
    return (
      <ProjectRemoteServerIcon
        info={props.remote}
        className={`${props.className ?? "size-3.5"} text-muted`}
        dotClassName="size-1"
      />
    );
  }
  return <ProjectLocationIcon location={props.project.location} className={props.className} />;
}

const CHIP_SIZE = {
  /** The flat list's 10px row tags, where even the dense glyph reads heavy. */
  xs: { icon: "size-2.5 text-muted/60", dot: "size-1", name: "max-w-20 text-muted/60" },
  /** Dense sidebar rows, where the chip inherits a 10px tag. */
  sm: { icon: "size-3 text-muted/60", dot: "size-1.5", name: "max-w-20 text-muted/60" },
  /** Menu rows: own type scale for the name, but the same compact glyph. */
  md: { icon: "size-2.5 text-muted/60", dot: "size-1", name: "max-w-24 text-xs text-muted/60" },
} as const;

/**
 * Machine glyph plus its name — the trailing half of a project label wherever
 * projects are listed. Renders nothing for a local project, so callers can drop
 * it in beside the project name without a guard.
 */
export function ProjectRemoteServerChip(props: {
  info: ProjectRemoteServerInfo;
  size?: keyof typeof CHIP_SIZE;
}) {
  const { info } = props;
  if (!info.isRemote && !info.serverName) return null;
  const size = CHIP_SIZE[props.size ?? "sm"];
  return (
    <>
      <ProjectRemoteServerIcon info={info} className={size.icon} dotClassName={size.dot} />
      {info.serverName ? (
        <span className={`shrink-0 truncate ${size.name}`}>{info.serverName}</span>
      ) : null}
    </>
  );
}
