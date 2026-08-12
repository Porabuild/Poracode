import { useState } from "react";
import { Button, Input, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { BottomSheet } from "@/renderer/components/common/BottomSheet";
import { useAsyncOperation } from "@/renderer/hooks/useAsyncOperation";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import {
  isRemoteProjectSynced,
  selectableRemoteProjects,
} from "@/renderer/state/remoteServers/projectSync";
import type { RemoteServerRecord } from "@/renderer/state/remoteServers/types";
import { cloneFolderNameFromUrl } from "@/shared/createProject";
import type { Project } from "@/shared/contracts";
import { MobileHostFolderPicker } from "./MobileHostFolderPicker";

function projectPath(project: Project): string {
  return "path" in project.location ? project.location.path : project.location.uncPath;
}

function MobileAddProjectSheet(props: {
  readonly desktopId: string;
  readonly onClose: () => void;
}) {
  const { t } = useLingui();
  const runProjectCommand = useRemoteServersStore((state) => state.runProjectCommand);
  const { busy, error, run } = useAsyncOperation();
  const [mode, setMode] = useState<"folder" | "create" | "clone" | null>(null);
  const [folderPath, setFolderPath] = useState("");
  const [createParent, setCreateParent] = useState("");
  const [createName, setCreateName] = useState("");
  const [cloneParent, setCloneParent] = useState("");
  const [cloneUrl, setCloneUrl] = useState("");
  const [pickerTarget, setPickerTarget] = useState<"folder" | "create" | "clone" | null>(null);
  const cloneName = cloneFolderNameFromUrl(cloneUrl);

  const submit = (operation: () => Promise<void>) =>
    run(async () => {
      await operation();
      props.onClose();
    });

  const folderButton = (value: string, label: string, target: typeof pickerTarget) => (
    <button
      type="button"
      className="flex min-h-11 w-full items-center gap-2 rounded-2xl border border-default-200 bg-default-50 px-3 text-left text-xs"
      aria-label={label}
      onClick={() => setPickerTarget(target)}
    >
      <FolderOpen className="size-4 shrink-0 text-muted" />
      <span className={`min-w-0 flex-1 truncate ${value ? "" : "text-muted"}`}>
        {value || t`Choose a folder…`}
      </span>
    </button>
  );

  return (
    <>
      <BottomSheet label={t`Add a project`} onClose={props.onClose}>
        <div className="m-sheet-head">
          <span>{t`Add a project`}</span>
          {mode ? (
            <button
              type="button"
              className="flex size-11 items-center justify-center rounded-full text-muted"
              aria-label={t`Back`}
              onClick={() => setMode(null)}
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        {mode === null ? (
          <div className="m-sheet-list">
            <button type="button" className="m-sheet-action" onClick={() => setMode("folder")}>
              <FolderPlus className="size-4" />
              <Trans>Add an existing folder</Trans>
            </button>
            <button type="button" className="m-sheet-action" onClick={() => setMode("create")}>
              <FilePlus className="size-4" />
              <Trans>Start from scratch</Trans>
            </button>
            <button type="button" className="m-sheet-action" onClick={() => setMode("clone")}>
              <GitBranch className="size-4" />
              <Trans>Clone a repository</Trans>
            </button>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-0.5 pb-1">
            {mode === "folder" ? (
              <>
                {folderButton(folderPath, t`Folder path on the server`, "folder")}
                <Button
                  fullWidth
                  variant="tertiary"
                  className="!rounded-2xl"
                  isDisabled={busy || !folderPath.trim()}
                  onPress={() =>
                    submit(() =>
                      runProjectCommand(props.desktopId, {
                        kind: "add-existing",
                        path: folderPath.trim(),
                      }),
                    )
                  }
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <FolderPlus className="size-4" />
                  )}
                  <Trans>Add</Trans>
                </Button>
              </>
            ) : mode === "create" ? (
              <>
                {folderButton(createParent, t`Parent folder`, "create")}
                <Input
                  aria-label={t`Project name`}
                  placeholder={t`Project name`}
                  value={createName}
                  className="w-full !rounded-2xl"
                  onChange={(event) => setCreateName(event.currentTarget.value)}
                />
                <Button
                  fullWidth
                  variant="tertiary"
                  className="!rounded-2xl"
                  isDisabled={busy || !createParent.trim() || !createName.trim()}
                  onPress={() =>
                    submit(() =>
                      runProjectCommand(props.desktopId, {
                        kind: "create",
                        parentPath: createParent.trim(),
                        name: createName.trim(),
                      }),
                    )
                  }
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <FilePlus className="size-4" />
                  )}
                  <Trans>Create</Trans>
                </Button>
              </>
            ) : (
              <>
                {folderButton(cloneParent, t`Parent folder`, "clone")}
                <Input
                  aria-label={t`Repository URL`}
                  placeholder="https://github.com/owner/repo.git"
                  inputMode="url"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  value={cloneUrl}
                  className="w-full !rounded-2xl"
                  onChange={(event) => setCloneUrl(event.currentTarget.value)}
                />
                <Button
                  fullWidth
                  variant="tertiary"
                  className="!rounded-2xl"
                  isDisabled={busy || !cloneParent.trim() || !cloneName}
                  onPress={() =>
                    submit(() =>
                      runProjectCommand(props.desktopId, {
                        kind: "clone",
                        parentPath: cloneParent.trim(),
                        name: cloneName,
                        source: { kind: "url", url: cloneUrl.trim() },
                      }),
                    )
                  }
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <GitBranch className="size-4" />
                  )}
                  <Trans>Clone</Trans>
                </Button>
              </>
            )}
            {error ? <p className="text-xs text-danger">{error}</p> : null}
          </div>
        )}
      </BottomSheet>

      {pickerTarget ? (
        <MobileHostFolderPicker
          desktopId={props.desktopId}
          title={pickerTarget === "folder" ? t`Choose a folder` : t`Choose a parent folder`}
          initialPath={
            pickerTarget === "folder"
              ? folderPath
              : pickerTarget === "create"
                ? createParent
                : cloneParent
          }
          onClose={() => setPickerTarget(null)}
          onSelect={
            pickerTarget === "folder"
              ? setFolderPath
              : pickerTarget === "create"
                ? setCreateParent
                : setCloneParent
          }
        />
      ) : null}
    </>
  );
}

export function MobileRemoteProjectsSheet(props: {
  readonly server: RemoteServerRecord;
  readonly projects: readonly Project[];
  readonly isOnline: boolean;
  readonly onClose: () => void;
}) {
  const { t } = useLingui();
  const excluded = useRemoteServersStore(
    (state) => state.excludedProjectIds[props.server.desktopId],
  );
  const setRemoteProjectSynced = useRemoteServersStore((state) => state.setRemoteProjectSynced);
  const runProjectCommand = useRemoteServersStore((state) => state.runProjectCommand);
  const projects = selectableRemoteProjects(props.projects);
  const canManage = props.server.scopes.includes("projects:manage");
  const [actionProject, setActionProject] = useState<Project | null>(null);
  const [removeProject, setRemoveProject] = useState<Project | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const projectList =
    projects.length > 0 ? (
      <div className="m-sheet-list">
        {projects.map((project) => {
          const synced = isRemoteProjectSynced(project.id, excluded);
          return (
            <button
              key={project.id}
              type="button"
              className="m-thread-row"
              aria-label={project.name}
              onClick={() => setActionProject(project)}
            >
              <Folder className={`size-4 shrink-0 ${synced ? "text-muted" : "text-muted/40"}`} />
              <span className="m-thread-row__body">
                <span className="m-thread-row__title" data-done={!synced || undefined}>
                  {project.name}
                </span>
                <span className="m-thread-row__meta">
                  <span className="m-thread-row__meta-item">{projectPath(project)}</span>
                  {!synced ? (
                    <span className="m-thread-row__meta-item shrink-0">
                      <Trans>Not synced</Trans>
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    ) : (
      <div className="m-empty py-8">
        <span className="m-empty__icon">
          <FolderOpen className="size-5" />
        </span>
        <strong>
          <Trans>No projects on this server.</Trans>
        </strong>
        {canManage && props.isOnline ? (
          <p>
            <Trans>Tap + to add a folder or clone a repository on your desktop.</Trans>
          </p>
        ) : null}
      </div>
    );

  const availabilityMessage = !props.isOnline ? (
    <p className="px-3 pt-2 text-xs text-muted">
      <Trans>Reconnect the server to add projects.</Trans>
    </p>
  ) : !canManage ? (
    <p className="px-3 pt-2 text-xs text-muted">
      <Trans>This connection can view projects but not manage them. Re-pair to enable.</Trans>
    </p>
  ) : null;

  return (
    <>
      <BottomSheet fullScreen label={t`Projects`} onClose={props.onClose}>
        <div className="m-sheet-head">
          <span>{t`Projects`}</span>
          {canManage && props.isOnline ? (
            <button
              type="button"
              className="flex size-11 items-center justify-center rounded-full text-muted"
              aria-label={t`Add a project`}
              onClick={() => setAddOpen(true)}
            >
              <Plus className="size-5" />
            </button>
          ) : null}
        </div>
        {projectList}
        {availabilityMessage}
      </BottomSheet>

      {actionProject ? (
        <BottomSheet label={actionProject.name} onClose={() => setActionProject(null)}>
          <div className="m-sheet-head">
            <span className="truncate">{actionProject.name}</span>
          </div>
          <div className="m-sheet-list">
            <button
              type="button"
              className="m-sheet-action"
              onClick={() => {
                const synced = isRemoteProjectSynced(actionProject.id, excluded);
                setRemoteProjectSynced(props.server.desktopId, actionProject.id, !synced);
                setActionProject(null);
              }}
            >
              {isRemoteProjectSynced(actionProject.id, excluded) ? (
                <X className="size-4" />
              ) : (
                <Plus className="size-4" />
              )}
              {isRemoteProjectSynced(actionProject.id, excluded)
                ? t`Exclude from sync`
                : t`Include in sync`}
            </button>
            {canManage ? (
              <button
                type="button"
                className="m-sheet-action text-danger"
                disabled={!props.isOnline}
                onClick={() => {
                  setRemoveProject(actionProject);
                  setActionProject(null);
                }}
              >
                <Trash2 className="size-4" />
                <Trans>Remove project</Trans>
              </button>
            ) : null}
          </div>
        </BottomSheet>
      ) : null}

      {removeProject ? (
        <BottomSheet
          label={t`Remove ${removeProject.name}`}
          closeLabel={t`Cancel removing project`}
          onClose={() => setRemoveProject(null)}
        >
          <div className="m-sheet-head">
            <span className="truncate">{removeProject.name}</span>
          </div>
          <div className="m-sheet-list">
            <p className="px-3 py-2 text-xs leading-5 text-muted">
              <Trans>
                Remove <strong>{removeProject.name}</strong> and permanently delete all of its
                threads? This cannot be undone.
              </Trans>
            </p>
            <button
              type="button"
              className="m-sheet-action text-danger"
              onClick={() => {
                const projectId = removeProject.id;
                setRemoveProject(null);
                void runProjectCommand(props.server.desktopId, { kind: "remove", projectId }).catch(
                  (removeError: unknown) =>
                    toast.danger(
                      removeError instanceof Error ? removeError.message : String(removeError),
                    ),
                );
              }}
            >
              <Trash2 className="size-4" />
              <Trans>Remove project</Trans>
            </button>
          </div>
        </BottomSheet>
      ) : null}

      {addOpen ? (
        <MobileAddProjectSheet
          desktopId={props.server.desktopId}
          onClose={() => setAddOpen(false)}
        />
      ) : null}
    </>
  );
}
