import { Folder, Plus, X } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { Project } from "@/shared/contracts";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import {
  isRemoteProjectSynced,
  selectableRemoteProjects,
} from "@/renderer/state/remoteServers/projectSync";

function projectPath(project: Project): string {
  return "path" in project.location ? project.location.path : project.location.uncPath;
}

/**
 * One project offered by a paired server. Syncing is local state — excluding a
 * project only drops it from this client's sidebar, never from the server — so
 * both directions stay available while the server is offline.
 */
function RemoteProjectRow(props: {
  readonly desktopId: string;
  readonly project: Project;
  readonly isSynced: boolean;
}) {
  const { desktopId, project, isSynced } = props;
  const { t } = useLingui();
  const setRemoteProjectSynced = useRemoteServersStore((s) => s.setRemoteProjectSynced);
  const toggleLabel = isSynced ? t`Exclude from sync` : t`Include in sync`;

  return (
    <div className="group flex items-center gap-2 rounded-md py-0.5 pl-5">
      <Folder className={`size-3.5 shrink-0 ${isSynced ? "text-muted" : "text-muted/40"}`} />
      <span className={`truncate text-sm ${isSynced ? "text-foreground" : "text-muted/60"}`}>
        {project.name}
      </span>
      <span
        className={`min-w-0 flex-1 truncate text-xs ${isSynced ? "text-muted/70" : "text-muted/40"}`}
      >
        {projectPath(project)}
      </span>
      {isSynced ? null : (
        <span className="shrink-0 text-xs text-muted/50">
          <Trans>Not synced</Trans>
        </span>
      )}
      <button
        type="button"
        className={`shrink-0 rounded p-0.5 ${
          isSynced
            ? "hidden text-muted hover:text-danger group-hover:block"
            : "text-muted hover:text-foreground"
        }`}
        aria-label={toggleLabel}
        title={toggleLabel}
        onClick={() => setRemoteProjectSynced(desktopId, project.id, !isSynced)}
      >
        {isSynced ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
      </button>
    </div>
  );
}

/**
 * Every project a paired server offers, each with its sync toggle. The server's
 * own Home scope row is left out — it is not a real project and this client has
 * its own.
 */
export function RemoteServerProjectList(props: {
  readonly desktopId: string;
  readonly projects: readonly Project[];
}) {
  const { desktopId, projects } = props;
  const excluded = useRemoteServersStore((s) => s.excludedProjectIds[desktopId]);
  const selectable = selectableRemoteProjects(projects);

  if (selectable.length === 0) {
    return (
      <p className="pl-5 text-xs text-muted">
        <Trans>No projects on this server.</Trans>
      </p>
    );
  }

  return (
    <>
      {selectable.map((project) => (
        <RemoteProjectRow
          key={project.id}
          desktopId={desktopId}
          project={project}
          isSynced={isRemoteProjectSynced(project.id, excluded)}
        />
      ))}
    </>
  );
}
