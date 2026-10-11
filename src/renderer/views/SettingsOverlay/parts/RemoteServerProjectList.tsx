import { Button } from "@heroui/react";
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
    <div className="group flex min-h-11 items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-[var(--row-hover)]">
      <Folder className={`size-4 shrink-0 ${isSynced ? "text-muted" : "text-muted/40"}`} />
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-sm font-medium ${isSynced ? "text-foreground" : "text-muted/60"}`}
        >
          {project.name}
        </span>
        <span
          className={`block truncate font-mono text-[11px] ${isSynced ? "text-muted/65" : "text-muted/40"}`}
        >
          {projectPath(project)}
        </span>
      </span>
      {isSynced ? null : (
        <span className="shrink-0 rounded-full bg-default-100 px-2 py-0.5 text-[10px] text-muted">
          <Trans>Not synced</Trans>
        </span>
      )}
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        className={`size-7 min-w-0 shrink-0 transition-opacity ${
          isSynced
            ? "text-muted opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-danger"
            : "text-muted hover:text-foreground"
        }`}
        aria-label={toggleLabel}
        onPress={() => setRemoteProjectSynced(desktopId, project.id, !isSynced)}
      >
        {isSynced ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
      </Button>
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
      <p className="rounded-xl bg-default-50 px-3 py-4 text-center text-xs text-muted">
        <Trans>No projects on this server.</Trans>
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      {selectable.map((project) => (
        <RemoteProjectRow
          key={project.id}
          desktopId={desktopId}
          project={project}
          isSynced={isRemoteProjectSynced(project.id, excluded)}
        />
      ))}
    </div>
  );
}
