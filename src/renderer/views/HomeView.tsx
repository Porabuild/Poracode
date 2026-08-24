import { useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { useShallow } from "zustand/shallow";
import { Trans, useLingui } from "@lingui/react/macro";
import type { Project } from "@/shared/contracts";
import { isHomeProject, isHomeProjectId } from "@/shared/homeScope";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { openThread } from "@/renderer/actions/threadActions";
import { ThreadProviderIcon } from "@/renderer/components/providers/ThreadProviderIcon";
import { RelativeTime } from "@/renderer/components/common/RelativeTime";
import {
  ProjectRemoteServerChip,
  ProjectSelectorIcon,
  useProjectRemoteServerLookup,
  type ProjectRemoteServerInfo,
} from "@/renderer/components/common/ProjectRemoteServer";
import { TuxIcon } from "@/renderer/components/common/TuxIcon";

export function HomeView() {
  const { t } = useLingui();
  const homeScopeEnabled = useSharedSettings((state) => state.homeScopeEnabled);
  const homeProject = useAppStore((state) => state.projects.find(isHomeProject));
  const projects = useAppStore(
    useShallow((state) =>
      state.projects.filter((project) => !project.disabled && !isHomeProject(project)),
    ),
  );
  const [filterProjectId, setFilterProjectId] = useState<string | null>(null);
  const remoteServerFor = useProjectRemoteServerLookup();
  const openDraft = useAppStore((state) => state.openDraft);

  const workspaces = homeScopeEnabled && homeProject ? [homeProject, ...projects] : projects;
  const activeFilter =
    filterProjectId !== null && workspaces.some((project) => project.id === filterProjectId)
      ? filterProjectId
      : null;

  const recentThreads = useAppStore(
    useShallow((state) => {
      const sorted = state.threads
        .filter(
          (thread) =>
            !thread.done &&
            !thread.archived &&
            (homeScopeEnabled || !isHomeProjectId(thread.projectId)) &&
            (activeFilter === null || thread.projectId === activeFilter),
        )
        .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return activeFilter === null ? sorted.slice(0, 8) : sorted;
    }),
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex min-h-full flex-col px-8 py-8">
        <div className="m-auto grid w-full max-w-[960px] items-start gap-10 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
          {workspaces.length > 0 ? (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                <Trans>Projects</Trans>
              </h2>
              <div className="flex flex-col gap-1">
                {workspaces.map((project) => (
                  <WorkspaceRow
                    key={project.id}
                    project={project}
                    remote={remoteServerFor(project)}
                    selected={activeFilter === project.id}
                    onSelect={() =>
                      setFilterProjectId((current) => (current === project.id ? null : project.id))
                    }
                    onNewThread={() => openDraft(project.id)}
                    newThreadLabel={t`New thread in ${project.name}`}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {recentThreads.length > 0 || activeFilter !== null ? (
            <section className="min-w-0">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                <Trans>Recent threads</Trans>
              </h2>
              {recentThreads.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {recentThreads.map((thread) => {
                    const project = isHomeProjectId(thread.projectId)
                      ? homeProject
                      : projects.find((p) => p.id === thread.projectId);
                    return (
                      <button
                        key={thread.id}
                        className="group flex items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-[var(--row-hover)]"
                        onClick={() => openThread(thread.id)}
                        type="button"
                      >
                        <ThreadProviderIcon thread={thread} className="size-4 shrink-0" />
                        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                          {thread.title}
                        </p>
                        {activeFilter === null && project ? (
                          <span className="ml-3 flex shrink-0 items-center gap-1 text-xs text-muted">
                            <span className="max-w-40 truncate">{project.name}</span>
                            <ProjectRemoteServerChip info={remoteServerFor(project)} size="xs" />
                            {project.location.kind === "wsl" ? (
                              <TuxIcon className="h-2.5 w-auto shrink-0 text-muted/60" />
                            ) : null}
                          </span>
                        ) : null}
                        <RelativeTime
                          iso={thread.updatedAt}
                          className="ml-3 w-[3ch] shrink-0 text-right font-mono text-xs tabular-nums text-muted"
                        />
                        <ArrowRight className="size-3.5 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="px-3 py-2 text-sm text-muted">
                  <Trans>No threads yet.</Trans>
                </p>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function WorkspaceRow(props: {
  project: Project;
  remote: ProjectRemoteServerInfo;
  selected: boolean;
  onSelect: () => void;
  onNewThread: () => void;
  newThreadLabel: string;
}) {
  const { project, remote, selected } = props;
  return (
    <div
      className={`group relative flex items-center rounded-2xl transition-colors ${
        selected ? "bg-[var(--row-active)]" : "hover:bg-[var(--row-hover)]"
      }`}
    >
      <button
        aria-pressed={selected}
        className="flex min-w-0 flex-1 items-center gap-3 py-2 pr-9 pl-3 text-left"
        onClick={props.onSelect}
        type="button"
      >
        <ProjectSelectorIcon project={project} remote={remote} className="size-4" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {isHomeProject(project) ? <Trans>Home</Trans> : project.name}
        </span>
        <ProjectRemoteServerChip info={remote} size="sm" />
        {project.location.kind === "wsl" ? (
          <TuxIcon className="h-3 w-auto shrink-0 text-muted/60" />
        ) : null}
      </button>
      <button
        aria-label={props.newThreadLabel}
        className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-muted opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
        onClick={props.onNewThread}
        type="button"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
