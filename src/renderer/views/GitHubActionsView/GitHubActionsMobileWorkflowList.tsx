import { Trans, useLingui } from "@lingui/react/macro";
import { LoaderCircle, Pin, Play, Workflow } from "lucide-react";
import type { GitHubActionsWorkflow, Project } from "@/shared/contracts";
import { ResponsiveContextMenu } from "@/renderer/components/common/ResponsiveContextMenu";
import { SidebarButton } from "@/renderer/components/common/SidebarButton";
import { GitHubActionsMobileProjectBar } from "./GitHubActionsMobileProjectBar";

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
  const selectedProject = props.projects.find((project) => project.id === props.selectedProjectId);
  const pinned = new Set(props.pinnedWorkflowIds);
  const workflows = [...props.workflows].sort((a, b) => {
    const aPinned = pinned.has(a.id);
    const bPinned = pinned.has(b.id);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

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
        <GitHubActionsMobileProjectBar
          projects={props.projects}
          selectedProject={selectedProject}
          onSelectProject={props.onSelectProject}
        />
      ) : null}
    </section>
  );
}
