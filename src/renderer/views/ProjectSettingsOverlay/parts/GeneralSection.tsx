import { useState } from "react";
import { FolderOpen } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useProject } from "@/renderer/state/useThread";
import { pickProjectFolder, relocateProject } from "@/renderer/actions/projectActions";
import { renameProjectEverywhere } from "@/renderer/actions/projectGroupActions";
import { Button, Input, PathDisplay } from "@/renderer/components/common";
import { RemoteHostFolderPicker } from "@/renderer/views/SettingsOverlay/parts/RemoteHostFolderPicker";
import { useProjectEnvironmentMachines } from "@/renderer/components/common/ProjectEnvironment";
import { ProjectIconPicker } from "./ProjectIconPicker";
import { projectHostRunsOnThisMachine } from "@/renderer/state/hostLocality";
import {
  PROJECT_SETTINGS_SCROLL_CLASS,
  ProjectScopeHeading,
  SharedValueDiff,
} from "./ProjectEnvironmentScope";

export function GeneralSection(props: { projectId: string }) {
  const { t } = useLingui();
  const project = useProject(props.projectId);
  const [name, setName] = useState(project?.name ?? "");
  const [remoteFolderPickerOpen, setRemoteFolderPickerOpen] = useState(false);
  const iconMachine = useProjectEnvironmentMachines(props.projectId).find(
    (entry) => entry.project.id === props.projectId,
  )?.machine.label;

  if (!project) return null;

  const projectPath =
    project.location.kind === "wsl" ? project.location.linuxPath : project.location.path;

  return (
    <div className={PROJECT_SETTINGS_SCROLL_CLASS}>
      <div className="mx-auto max-w-[720px]">
        <h1 className="mb-6 text-lg font-semibold text-foreground">
          <Trans>General</Trans>
        </h1>

        <div className="space-y-4">
          <ProjectScopeHeading projectId={project.id} scope="shared" />
          <div>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  <Trans>Project name</Trans>
                </p>
                <p className="text-xs text-muted">
                  <Trans>Display name in the sidebar.</Trans>
                </p>
              </div>
              <Input
                aria-label={t`Project name`}
                className="w-[240px] shrink-0"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => {
                  const trimmed = name.trim();
                  if (trimmed && trimmed !== project.name) {
                    renameProjectEverywhere(project.id, trimmed);
                  } else {
                    setName(project.name);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
            </div>
            <SharedValueDiff
              projectId={project.id}
              setting={t`Project name`}
              read={(row) => row.name}
              onApplyEverywhere={() => renameProjectEverywhere(project.id, project.name)}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                <Trans>Project icon</Trans>
              </p>
              <p className="text-xs text-muted">
                <Trans>Shown next to the project name.</Trans>
              </p>
              {project.icon?.startsWith("file:") && iconMachine ? (
                <p className="text-xs text-muted">
                  <Trans>An image from the project folder applies on {iconMachine} only.</Trans>
                </p>
              ) : null}
            </div>
            <ProjectIconPicker project={project} />
          </div>

          <ProjectScopeHeading projectId={project.id} scope="environment" className="pt-2" />
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                <Trans>Project folder</Trans>
              </p>
              <p className="text-xs text-muted">
                <Trans>The repository location on disk. Update it if you moved the folder.</Trans>
              </p>
            </div>
            <Button
              aria-label={t`Change project folder`}
              variant="tertiary"
              className="w-[240px] shrink-0 justify-start gap-2 font-normal"
              onPress={() => {
                // Another machine's folders are browsed on that host; this
                // machine's host uses the native folder dialog.
                if (!projectHostRunsOnThisMachine(project)) {
                  setRemoteFolderPickerOpen(true);
                  return;
                }
                void pickProjectFolder(project).then((path) => {
                  if (path) void relocateProject(project.id, path);
                });
              }}
            >
              <FolderOpen className="size-4 shrink-0 text-muted" />
              <PathDisplay path={projectPath} className="min-w-0 flex-1 text-xs" />
            </Button>
          </div>
        </div>
      </div>
      {remoteFolderPickerOpen && project.remoteServerId ? (
        <RemoteHostFolderPicker
          desktopId={project.remoteServerId}
          title={t`Choose a folder`}
          initialPath={projectPath}
          onClose={() => setRemoteFolderPickerOpen(false)}
          onSelect={(path) => void relocateProject(project.id, path)}
        />
      ) : null}
    </div>
  );
}
