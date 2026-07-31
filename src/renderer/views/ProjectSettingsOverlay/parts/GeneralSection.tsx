import { useState } from "react";
import { FolderOpen } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useProject } from "@/renderer/state/useThread";
import {
  relocateProject,
  relocateRemoteProject,
  renameProject,
} from "@/renderer/actions/projectActions";
import { Button, Input, PathDisplay } from "@/renderer/components/common";
import { RemoteHostFolderPicker } from "@/renderer/views/SettingsOverlay/parts/RemoteHostFolderPicker";

export function GeneralSection(props: { projectId: string }) {
  const { t } = useLingui();
  const project = useProject(props.projectId);
  const [name, setName] = useState(project?.name ?? "");
  const [remoteFolderPickerOpen, setRemoteFolderPickerOpen] = useState(false);

  if (!project) return null;

  const projectPath =
    project.location.kind === "wsl" ? project.location.linuxPath : project.location.path;

  return (
    <div className="h-full min-h-0 overflow-y-auto px-6 pb-8 pt-4">
      <div className="mx-auto max-w-[720px]">
        <h1 className="mb-6 text-lg font-semibold text-foreground">
          <Trans>General</Trans>
        </h1>

        <div className="space-y-4">
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
                  renameProject(project.id, trimmed);
                } else {
                  setName(project.name);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          </div>

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
                if (project.remoteServerId) {
                  setRemoteFolderPickerOpen(true);
                  return;
                }
                void relocateProject(project.id);
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
          onSelect={(path) => void relocateRemoteProject(project.id, path)}
        />
      ) : null}
    </div>
  );
}
