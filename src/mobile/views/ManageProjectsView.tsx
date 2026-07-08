import { useState } from "react";
import { Button, toast } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { FolderOpen, FolderPlus, GitBranch, Loader2, Trash2 } from "lucide-react";
import type { Project } from "@/shared/contracts";
import { cloneFolderNameFromUrl } from "@/shared/createProject";
import type { RemoteProjectCommand } from "@/shared/remote";
import { useAsyncOperation } from "@/renderer/hooks/useAsyncOperation";
import { useLongPress } from "@/renderer/hooks/useLongPress";
import { Fab, BottomSheet, EmptyState, FullScreenDrawer, useSheet } from "../components";
import { HostFolderPicker } from "./HostFolderPicker";

export interface ManageProjectsViewProps {
  readonly projects: readonly Project[];
  /** Whether the paired connection holds the `projects:manage` scope. */
  readonly canManage: boolean;
  readonly onCommand: (command: RemoteProjectCommand) => Promise<void>;
}

function projectPath(project: Project): string {
  return "path" in project.location ? project.location.path : project.location.uncPath;
}

/** The flat card from ThreadRow. There is no primary tap action for a project,
 * so the remove flow hangs off a long-press (same gesture as thread rows)
 * instead of a visible trash button. */
function ProjectRow(props: { readonly project: Project; readonly onMenu: (() => void) | null }) {
  const { project } = props;
  const longPressHandlers = useLongPress(props.onMenu);
  return (
    <div className="m-thread-row" {...longPressHandlers}>
      <FolderOpen className="size-4 shrink-0 text-muted" />
      <span className="m-thread-row__body">
        <span className="m-thread-row__title">{project.name}</span>
        <span className="m-thread-row__meta">
          <span className="m-thread-row__meta-item">{projectPath(project)}</span>
        </span>
      </span>
    </div>
  );
}

/**
 * PWA "Projects" screen: add an existing folder, clone a repo, or remove a
 * project on the connected desktop/server. Mirrors the desktop's Remote Servers
 * panel; both go through the `projects:manage` remote command.
 */
export function ManageProjectsView(props: ManageProjectsViewProps) {
  const { t } = useLingui();
  const [folderPath, setFolderPath] = useState("");
  const [cloneParent, setCloneParent] = useState("");
  const [cloneUrl, setCloneUrl] = useState("");
  const [pickerTarget, setPickerTarget] = useState<"folder" | "clone" | null>(null);
  const { busy, error, run } = useAsyncOperation();
  // The add-a-folder / clone forms now live in a full-screen drawer opened from
  // the FAB, so the list isn't buried under a permanent form.
  const addDrawer = useSheet<true>();
  // Removing a project cascade-deletes all its threads on the server, so gate it
  // behind a confirm sheet (mirrors FilesView / GitActionSheet's confirm step).
  const removeConfirm = useSheet<Project>();

  const cloneName = cloneFolderNameFromUrl(cloneUrl);

  const pickerConfig =
    pickerTarget === "clone"
      ? { title: t`Choose a parent folder`, initialPath: cloneParent, onSelect: setCloneParent }
      : pickerTarget === "folder"
        ? { title: t`Choose a folder`, initialPath: folderPath, onSelect: setFolderPath }
        : null;

  return (
    <section className={props.canManage ? "m-page m-page--fab" : "m-page"}>
      <div className="m-page-head">
        <div>
          <h1>
            <Trans>Projects</Trans>
          </h1>
          <p>
            <Plural value={props.projects.length} one="# project" other="# projects" />
          </p>
        </div>
      </div>

      {props.projects.length > 0 ? (
        <div className="m-thread-list">
          {props.projects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              onMenu={props.canManage && !busy ? () => removeConfirm.open(project) : null}
            />
          ))}
        </div>
      ) : props.canManage ? (
        <EmptyState
          icon={<FolderOpen className="size-5" />}
          title={<Trans>No projects yet</Trans>}
          hint={<Trans>Tap + to add a folder or clone a repository on your desktop.</Trans>}
        />
      ) : (
        <EmptyState
          icon={<FolderOpen className="size-5" />}
          title={<Trans>No projects</Trans>}
          hint={
            <Trans>This connection can view projects but not manage them. Re-pair to enable.</Trans>
          }
        />
      )}

      {props.canManage ? (
        <Fab label={t`Add a project`} onPress={() => addDrawer.open(true)} />
      ) : null}

      {props.canManage && addDrawer.target ? (
        <FullScreenDrawer
          title={t`Add a project`}
          label={t`Add a project`}
          closeLabel={t`Close add project`}
          closing={addDrawer.closing}
          onClose={addDrawer.close}
        >
          <div className="m-card">
            <h2 className="m-card__title">
              <FolderPlus className="size-4" />
              <Trans>Add an existing folder</Trans>
            </h2>
            <div className="m-form">
              <div className="m-field">
                <span className="m-field__label">
                  <Trans>Folder on the server</Trans>
                </span>
                <button
                  type="button"
                  className="m-field-picker"
                  onClick={() => setPickerTarget("folder")}
                >
                  <FolderOpen className="size-4 shrink-0 text-muted" />
                  <span className={folderPath ? "truncate" : "truncate text-muted"}>
                    {folderPath || t`Choose a folder…`}
                  </span>
                </button>
              </div>
              <Button
                className="m-form__submit text-foreground"
                size="sm"
                variant="tertiary"
                isDisabled={busy || !folderPath.trim()}
                onPress={() =>
                  run(async () => {
                    await props.onCommand({ kind: "add-existing", path: folderPath.trim() });
                    setFolderPath("");
                    addDrawer.close();
                  })
                }
              >
                <FolderPlus className="size-4" />
                <Trans>Add</Trans>
              </Button>
            </div>
          </div>

          <div className="m-card">
            <h2 className="m-card__title">
              <GitBranch className="size-4" />
              <Trans>Clone a repository</Trans>
            </h2>
            <div className="m-form">
              <div className="m-field">
                <span className="m-field__label">
                  <Trans>Parent folder on the server</Trans>
                </span>
                <button
                  type="button"
                  className="m-field-picker"
                  onClick={() => setPickerTarget("clone")}
                >
                  <FolderOpen className="size-4 shrink-0 text-muted" />
                  <span className={cloneParent ? "truncate" : "truncate text-muted"}>
                    {cloneParent || t`Choose a folder…`}
                  </span>
                </button>
              </div>
              <label className="m-field">
                <span className="m-field__label">
                  <Trans>Repository URL</Trans>
                </span>
                <input
                  value={cloneUrl}
                  aria-label={t`Repository URL`}
                  placeholder="https://github.com/owner/repo.git"
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(event) => setCloneUrl(event.currentTarget.value)}
                />
              </label>
              <Button
                className="m-form__submit text-foreground"
                size="sm"
                variant="tertiary"
                isDisabled={busy || !cloneParent.trim() || !cloneName}
                onPress={() =>
                  run(async () => {
                    await props.onCommand({
                      kind: "clone",
                      parentPath: cloneParent.trim(),
                      name: cloneName,
                      source: { kind: "url", url: cloneUrl.trim() },
                    });
                    setCloneUrl("");
                    setCloneParent("");
                    addDrawer.close();
                  })
                }
              >
                {busy ? <Loader2 className="size-4 m-spin" /> : <GitBranch className="size-4" />}
                <Trans>Clone</Trans>
              </Button>
            </div>
          </div>

          {error ? <p className="m-card__hint m-card__hint--accent">{error}</p> : null}
        </FullScreenDrawer>
      ) : null}

      {pickerConfig ? (
        <HostFolderPicker
          title={pickerConfig.title}
          initialPath={pickerConfig.initialPath}
          onClose={() => setPickerTarget(null)}
          onSelect={pickerConfig.onSelect}
        />
      ) : null}

      {removeConfirm.target ? (
        <BottomSheet
          label={t`Remove ${removeConfirm.target.name}`}
          closeLabel={t`Cancel removing project`}
          closing={removeConfirm.closing}
          onClose={removeConfirm.close}
        >
          <div className="m-sheet-head">
            <span className="truncate">{removeConfirm.target.name}</span>
          </div>
          <div className="m-sheet-list">
            <p className="m-git-empty">
              <Trans>
                Remove <strong>{removeConfirm.target.name}</strong> and permanently delete all of
                its threads? This cannot be undone.
              </Trans>
            </p>
            <button
              type="button"
              className="m-sheet-action text-danger"
              disabled={busy}
              onClick={() => {
                const projectId = removeConfirm.target!.id;
                removeConfirm.close();
                // The drawer that renders `run`'s captured error is closed during
                // the remove flow, so a failure would be silent — surface it as a
                // toast (same message handling as useAsyncOperation).
                void props
                  .onCommand({ kind: "remove", projectId })
                  .catch((removeError: unknown) => {
                    toast.danger(
                      removeError instanceof Error ? removeError.message : String(removeError),
                    );
                  });
              }}
            >
              <Trash2 className="size-4" />
              <Trans>Remove project</Trans>
            </button>
          </div>
        </BottomSheet>
      ) : null}
    </section>
  );
}
