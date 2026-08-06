import { useState } from "react";
import { Button, Surface, Tooltip } from "@heroui/react";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import type { Workspace } from "@/shared/contracts";
import { isHomeProject } from "@/shared/homeScope";
import {
  createWorkspace,
  deleteWorkspace,
  renameWorkspace,
  workspaceDeletionFallback,
} from "@/renderer/actions/workspaceActions";
import { ConfirmDialog } from "@/renderer/components/common/ConfirmDialog";
import { OptionMenu } from "@/renderer/components/common/OptionMenu";
import { WorkspaceIcon } from "@/renderer/components/workspace/WorkspaceIcon";
import { WorkspaceNameDialog } from "@/renderer/components/workspace/WorkspaceNameDialog";
import {
  WORKSPACE_UNFILED_KEY,
  workspaceMenuKey,
} from "@/renderer/components/workspace/workspaceMenuKeys";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useActiveWorkspaceId } from "@/renderer/state/workspaceStore";
import { SettingsPage } from "./SettingsForm";

type NameDialogState = { mode: "create" } | { mode: "rename"; workspace: Workspace };

export function WorkspacesSettings() {
  const { t } = useLingui();
  const workspaces = useSharedSettings((state) => state.workspaces);
  const activeWorkspaceId = useActiveWorkspaceId();
  const allProjects = useAppStore((state) => state.projects);
  // Home is synthetic and belongs to every workspace, so it isn't assignable.
  const projects = allProjects.filter((project) => !isHomeProject(project));

  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null);
  const [deleting, setDeleting] = useState<Workspace | null>(null);

  // One grouped pass instead of a filter per row.
  const projectCounts = new Map<string, number>();
  for (const project of projects) {
    if (project.workspaceId) {
      projectCounts.set(project.workspaceId, (projectCounts.get(project.workspaceId) ?? 0) + 1);
    }
  }
  const deleteFallback = deleting ? workspaceDeletionFallback(deleting.id) : undefined;
  const isLastWorkspace = workspaces.length <= 1;

  const workspaceOptions = [
    ...workspaces.map((workspace) => ({
      id: workspaceMenuKey(workspace.id),
      label: workspace.name,
      icon: <WorkspaceIcon icon={workspace.icon} className="size-4 shrink-0 text-muted" />,
    })),
    {
      id: WORKSPACE_UNFILED_KEY,
      label: t`All workspaces`,
      icon: <Layers className="size-4 shrink-0 text-muted" />,
    },
  ];

  return (
    <SettingsPage
      title={t`Workspaces`}
      description={
        <Trans>
          Group projects so the sidebar, schedules, and pull requests only show one set at a time.
          Switch between them at the bottom of the sidebar.
        </Trans>
      }
      bodyClassName=""
      actions={
        <Button size="sm" variant="secondary" onPress={() => setNameDialog({ mode: "create" })}>
          <Plus className="size-4" />
          <Trans>Add workspace</Trans>
        </Button>
      }
    >
      <Surface variant="secondary" className="divide-y divide-[var(--hairline)] rounded-xl">
        {workspaces.map((workspace) => (
          <div key={workspace.id} className="flex items-center gap-3 px-4 py-3">
            <WorkspaceIcon icon={workspace.icon} className="size-4 shrink-0 text-muted" />
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="truncate text-sm font-medium text-foreground">
                {workspace.name}
                {workspace.id === activeWorkspaceId ? (
                  <span className="ms-2 text-xs font-normal text-muted">
                    <Trans>Active</Trans>
                  </span>
                ) : null}
              </p>
              <p className="truncate text-xs text-muted">
                <Plural
                  value={projectCounts.get(workspace.id) ?? 0}
                  one="# project"
                  other="# projects"
                />
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Tooltip delay={150}>
                <Tooltip.Trigger>
                  <Button
                    variant="ghost"
                    size="sm"
                    isIconOnly
                    aria-label={t`Rename workspace`}
                    onPress={() => setNameDialog({ mode: "rename", workspace })}
                  >
                    <Pencil className="size-4" />
                  </Button>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  <Trans>Rename workspace</Trans>
                </Tooltip.Content>
              </Tooltip>
              <Tooltip delay={150}>
                <Tooltip.Trigger>
                  <Button
                    variant="ghost"
                    size="sm"
                    isIconOnly
                    aria-label={t`Delete workspace`}
                    // The last workspace has nowhere to hand its projects to.
                    isDisabled={isLastWorkspace}
                    onPress={() => setDeleting(workspace)}
                  >
                    <Trash2 className="size-4 text-danger" />
                  </Button>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  {isLastWorkspace ? (
                    <Trans>Keep at least one workspace</Trans>
                  ) : (
                    <Trans>Delete workspace</Trans>
                  )}
                </Tooltip.Content>
              </Tooltip>
            </div>
          </div>
        ))}
      </Surface>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-foreground">
        <Trans>Projects</Trans>
      </h2>
      {projects.length === 0 ? (
        <p className="text-sm text-muted">
          <Trans>No projects yet.</Trans>
        </p>
      ) : (
        <Surface variant="secondary" className="divide-y divide-[var(--hairline)] rounded-xl">
          {projects.map((project) => (
            <div key={project.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
              </div>
              <OptionMenu
                value={
                  project.workspaceId
                    ? workspaceMenuKey(project.workspaceId)
                    : WORKSPACE_UNFILED_KEY
                }
                options={workspaceOptions}
                placeholder={t`Workspace`}
                onChange={(next) => {
                  const workspaceId =
                    next === WORKSPACE_UNFILED_KEY
                      ? undefined
                      : workspaces.find((w) => workspaceMenuKey(w.id) === next)?.id;
                  useAppStore.getState().setProjectWorkspace(project.id, workspaceId);
                }}
              />
            </div>
          ))}
        </Surface>
      )}

      <WorkspaceNameDialog
        isOpen={nameDialog !== null}
        mode={nameDialog?.mode ?? "create"}
        {...(nameDialog?.mode === "rename" ? { initialName: nameDialog.workspace.name } : {})}
        onSubmit={(name) => {
          if (nameDialog?.mode === "rename") renameWorkspace(nameDialog.workspace.id, name);
          else createWorkspace(name);
        }}
        onClose={() => setNameDialog(null)}
      />
      <ConfirmDialog
        isOpen={deleting !== null}
        title={t`Delete workspace?`}
        body={
          deleting && deleteFallback ? (
            <Trans>
              Projects in {deleting.name} move to {deleteFallback.name}. No project is deleted.
            </Trans>
          ) : null
        }
        confirmLabel={t`Delete`}
        onConfirm={() => {
          if (deleting) deleteWorkspace(deleting.id);
          setDeleting(null);
        }}
        onClose={() => setDeleting(null)}
      />
    </SettingsPage>
  );
}
