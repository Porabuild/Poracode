import { useState, type ReactNode } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { useShallow } from "zustand/shallow";
import { Trans, useLingui } from "@lingui/react/macro";
import type { Project } from "@/shared/contracts";
import { isHomeProject, isHomeProjectId } from "@/shared/homeScope";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useWorkspaceThreadFilter } from "@/renderer/state/workspaceSelectors";
import { openThread } from "@/renderer/actions/threadActions";
import { ThreadProviderIcon } from "@/renderer/components/providers/ThreadProviderIcon";
import { RelativeTime } from "@/renderer/components/common/RelativeTime";
import { WorkspaceIcon } from "@/renderer/components/workspace/WorkspaceIcon";
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
  const configuredWorkspaces = useSharedSettings((state) => state.workspaces);
  const projects = useAppStore(
    useShallow((state) =>
      state.projects.filter((project) => !project.disabled && !isHomeProject(project)),
    ),
  );
  const [filterProjectId, setFilterProjectId] = useState<string | null>(null);
  const remoteServerFor = useProjectRemoteServerLookup();
  const openDraft = useAppStore((state) => state.openDraft);

  const projectOptions = homeScopeEnabled && homeProject ? [homeProject, ...projects] : projects;
  const activeFilter =
    filterProjectId !== null && projectOptions.some((project) => project.id === filterProjectId)
      ? filterProjectId
      : null;

  const knownWorkspaceIds = new Set(configuredWorkspaces.map((workspace) => workspace.id));
  const projectGroups = configuredWorkspaces
    .map((workspace) => ({
      workspace,
      projects: projects.filter((project) => project.workspaceId === workspace.id),
    }))
    .filter((group) => group.projects.length > 0);
  const unassignedProjects = projects.filter(
    (project) => !project.workspaceId || !knownWorkspaceIds.has(project.workspaceId),
  );

  const isThreadInActiveWorkspace = useWorkspaceThreadFilter();
  const recentThreads = useAppStore(
    useShallow((state) => {
      const sorted = state.threads
        .filter(
          (thread) =>
            !thread.done &&
            !thread.archived &&
            (homeScopeEnabled || !isHomeProjectId(thread.projectId)) &&
            isThreadInActiveWorkspace(thread) &&
            (activeFilter === null || thread.projectId === activeFilter),
        )
        .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return activeFilter === null ? sorted.slice(0, 8) : sorted;
    }),
  );
  const projectRows = (groupProjects: readonly Project[]) =>
    groupProjects.map((project) => (
      <ProjectRow
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
    ));

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex min-h-full flex-col px-8 py-8">
        <div className="m-auto grid w-full max-w-[1080px] items-start gap-12 md:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
          {projectOptions.length > 0 ? (
            <section className="min-w-0">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                <Trans>Projects</Trans>
              </h2>
              <div className="flex flex-col">
                {homeScopeEnabled && homeProject ? (
                  <ProjectRow
                    project={homeProject}
                    remote={remoteServerFor(homeProject)}
                    selected={activeFilter === homeProject.id}
                    onSelect={() =>
                      setFilterProjectId((current) =>
                        current === homeProject.id ? null : homeProject.id,
                      )
                    }
                    onNewThread={() => openDraft(homeProject.id)}
                    newThreadLabel={t`New thread in ${homeProject.name}`}
                  />
                ) : null}
                {configuredWorkspaces.length > 0
                  ? projectGroups.map((group) => (
                      <ProjectGroup
                        key={group.workspace.id}
                        name={group.workspace.name}
                        icon={<WorkspaceIcon icon={group.workspace.icon} className="size-3" />}
                      >
                        {projectRows(group.projects)}
                      </ProjectGroup>
                    ))
                  : projectRows(projects)}
                {configuredWorkspaces.length > 0 && unassignedProjects.length > 0 ? (
                  <ProjectGroup name={t`Unassigned`}>
                    {projectRows(unassignedProjects)}
                  </ProjectGroup>
                ) : null}
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

function ProjectGroup(props: { name: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div role="group" aria-label={props.name} className="mt-3 first:mt-0">
      <h3 className="mb-1 flex items-center gap-1.5 px-3 text-[10px] font-medium uppercase tracking-[0.1em] text-muted/70">
        {props.icon}
        <span className="truncate">{props.name}</span>
      </h3>
      <div className="flex flex-col">{props.children}</div>
    </div>
  );
}

function ProjectRow(props: {
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
        className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5 pr-9 pl-3 text-left"
        onClick={props.onSelect}
        type="button"
      >
        <ProjectSelectorIcon project={project} remote={remote} className="size-3.5" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
          {isHomeProject(project) ? <Trans>Home</Trans> : project.name}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[11px]">
          <ProjectRemoteServerChip info={remote} size="xs" />
          {project.location.kind === "wsl" ? (
            <TuxIcon className="h-2.5 w-auto shrink-0 text-muted/60" />
          ) : null}
        </span>
      </button>
      <button
        aria-label={props.newThreadLabel}
        className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
        onClick={props.onNewThread}
        type="button"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
