import { useState } from "react";
import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Check, ChevronUp, LoaderCircle, Pin, Play, Workflow } from "lucide-react";
import type { GitHubActionsWorkflow, Project } from "@/shared/contracts";
import { ResponsiveContextMenu } from "@/renderer/components/common/ResponsiveContextMenu";
import {
  ProjectSelectorIcon,
  useProjectRemoteServerLookup,
} from "@/renderer/components/common/ProjectRemoteServer";
import { ResponsiveMenuSurface } from "@/renderer/components/common/ResponsiveMenuSurface";
import { SidebarButton } from "@/renderer/components/common/SidebarButton";

export function GitHubActionsMobileWorkflowList(props: {
  projects: Project[];
  selectedProjectId: string | null;
  workflows: GitHubActionsWorkflow[];
  pinnedWorkflowIds: number[];
  loading: boolean;
  onSelectProject: (projectId: string) => void;
  onSelectWorkflow: (workflowId: number) => void;
  onRunWorkflow: (workflowId: number) => void;
  onTogglePin: (workflowId: number) => void;
}) {
  const { t } = useLingui();
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const remoteServerFor = useProjectRemoteServerLookup();
  const selectedProject = props.projects.find((project) => project.id === props.selectedProjectId);
  const selectedRemote = remoteServerFor(selectedProject);
  const pinned = new Set(props.pinnedWorkflowIds);
  const workflows = [...props.workflows].sort((a, b) => {
    const aPinned = pinned.has(a.id);
    const bPinned = pinned.has(b.id);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  function selectProject(projectId: string) {
    setProjectPickerOpen(false);
    props.onSelectProject(projectId);
  }

  return (
    <section className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="m-page-content min-h-0 flex-1 overflow-y-auto px-5 pt-0 pb-[calc(var(--m-floating-control-height)+1.75rem+env(safe-area-inset-bottom))]">
        {props.loading && workflows.length === 0 ? (
          <div className="flex justify-center py-12 text-muted">
            <LoaderCircle className="size-5 animate-spin" />
          </div>
        ) : workflows.length === 0 ? (
          <div className="py-12 text-center text-muted">
            <Workflow className="mx-auto mb-3 size-8" />
            <p className="text-sm font-medium text-foreground">
              <Trans>No active workflows found.</Trans>
            </p>
          </div>
        ) : (
          <nav aria-label={t`Workflows`}>
            {workflows.map((workflow) => {
              const isPinned = pinned.has(workflow.id);
              return (
                <ResponsiveContextMenu
                  key={workflow.id}
                  label={workflow.name}
                  items={[
                    {
                      id: "run",
                      label: t`Run workflow`,
                      icon: <Play className="size-4" />,
                    },
                    {
                      id: "toggle-pin",
                      label: isPinned ? t`Unpin workflow` : t`Pin workflow`,
                      icon: <Pin className={`size-4 ${isPinned ? "fill-current" : ""}`} />,
                    },
                  ]}
                  onAction={(key) => {
                    if (key === "run") props.onRunWorkflow(workflow.id);
                    if (key === "toggle-pin") props.onTogglePin(workflow.id);
                  }}
                >
                  <SidebarButton
                    className="poracode-sidebar-thread-row"
                    size="xs"
                    icon={null}
                    label={
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate font-medium">{workflow.name}</span>
                        <span className="truncate font-mono text-[10px] text-muted">
                          {workflow.path}
                        </span>
                      </span>
                    }
                    suffix={
                      isPinned ? (
                        <Pin className="size-3.5 shrink-0 fill-current text-accent" />
                      ) : null
                    }
                    onPress={() => props.onSelectWorkflow(workflow.id)}
                  />
                </ResponsiveContextMenu>
              );
            })}
          </nav>
        )}
      </div>

      {selectedProject ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-10 flex justify-center px-4">
          <ResponsiveMenuSurface
            isOpen={projectPickerOpen}
            onOpenChange={setProjectPickerOpen}
            label={t`Project`}
            trigger={
              <Button
                variant="ghost"
                className="m-floating-selector pointer-events-auto px-4 text-sm"
                aria-label={t`Project`}
                aria-expanded={projectPickerOpen}
                onPress={() => setProjectPickerOpen(true)}
              >
                <ProjectSelectorIcon project={selectedProject} remote={selectedRemote} />
                <span className="min-w-0 truncate font-medium">{selectedProject.name}</span>
                {selectedRemote.serverName ? (
                  <span className="min-w-0 shrink truncate text-xs text-muted">
                    {selectedRemote.serverName}
                  </span>
                ) : null}
                <ChevronUp className="size-4 shrink-0 text-muted" />
              </Button>
            }
          >
            <div className="m-sheet-list">
              {props.projects.map((project) => {
                const remote = remoteServerFor(project);
                const selected = project.id === selectedProject.id;
                return (
                  <button
                    key={project.id}
                    type="button"
                    className="m-sheet-action"
                    aria-pressed={selected || undefined}
                    onClick={() => selectProject(project.id)}
                  >
                    <ProjectSelectorIcon project={project} remote={remote} />
                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                    {remote.serverName ? (
                      <span className="max-w-28 shrink-0 truncate text-xs text-muted/60">
                        {remote.serverName}
                      </span>
                    ) : null}
                    {selected ? <Check className="size-4 shrink-0 text-accent" /> : null}
                  </button>
                );
              })}
            </div>
          </ResponsiveMenuSurface>
        </div>
      ) : null}
    </section>
  );
}
