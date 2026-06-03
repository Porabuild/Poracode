import { ArrowRight, FolderOpen, House, Plus } from "lucide-react";
import { useShallow } from "zustand/shallow";
import { isHomeProject, isHomeProjectId } from "@/shared/homeScope";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { openThread } from "@/renderer/actions/threadActions";
import { ThreadProviderIcon } from "@/renderer/components/providers";
import { RelativeTime } from "@/renderer/components/common/RelativeTime";

export function HomeView() {
  const homeScopeEnabled = useSharedSettings((state) => state.homeScopeEnabled);
  const homeProject = useAppStore((state) => state.projects.find(isHomeProject));
  const projects = useAppStore(
    useShallow((state) =>
      state.projects.filter((project) => !project.disabled && !isHomeProject(project)),
    ),
  );
  const recentThreads = useAppStore(
    useShallow((state) =>
      state.threads
        .filter(
          (t) => !t.done && !t.archived && (homeScopeEnabled || !isHomeProjectId(t.projectId)),
        )
        .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 8),
    ),
  );
  const openDraft = useAppStore((state) => state.openDraft);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-full min-h-0 flex-col px-8 py-8">
        <div className="mx-auto flex h-full w-full max-w-[560px] flex-col">
          <div className="flex flex-1 flex-col justify-center">
            <div className="flex w-full flex-col gap-8">
              {(homeScopeEnabled && homeProject) || projects.length > 0 ? (
                <section>
                  <div className="flex flex-col gap-1">
                    {homeScopeEnabled && homeProject ? (
                      <button
                        className="group flex items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-[var(--row-hover)]"
                        onClick={() => openDraft(homeProject.id)}
                        type="button"
                      >
                        <House className="size-4 shrink-0 text-muted" />
                        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                          Home
                        </p>
                        <Plus className="size-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                      </button>
                    ) : null}
                    {projects.map((project) => (
                      <button
                        key={project.id}
                        className="group flex items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-[var(--row-hover)]"
                        onClick={() => openDraft(project.id)}
                        type="button"
                      >
                        <FolderOpen className="size-4 shrink-0 text-muted" />
                        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                          {project.name}
                        </p>
                        <Plus className="size-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {recentThreads.length > 0 ? (
                <section>
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    Recent threads
                  </h2>
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
                          {project ? (
                            <span className="ml-3 shrink-0 text-xs text-muted">{project.name}</span>
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
                </section>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
