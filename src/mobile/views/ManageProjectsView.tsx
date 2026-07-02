import { useState } from "react";
import { Button } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { FolderOpen, FolderPlus, GitBranch, Loader2, Trash2 } from "lucide-react";
import type { Project } from "@/shared/contracts";
import { cloneFolderNameFromUrl } from "@/shared/createProject";
import type { RemoteProjectCommand } from "@/shared/remote";
import { useAsyncOperation } from "@/renderer/hooks/useAsyncOperation";
import { BottomSheet, useSheet } from "../components";
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
  // Removing a project cascade-deletes all its threads on the server, so gate it
  // behind a confirm sheet (mirrors FilesView / GitActionSheet's confirm step).
  const removeConfirm = useSheet<Project>();

  const cloneName = cloneFolderNameFromUrl(cloneUrl);

  return (
    <section className="m-page">
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
            <div key={project.id} className="m-thread-row">
              <span className="m-thread-row__body">
                <span className="m-thread-row__title">{project.name}</span>
                <span className="m-thread-row__meta">
                  <span className="m-thread-row__meta-item">{projectPath(project)}</span>
                </span>
              </span>
              {props.canManage ? (
                <Button
                  isIconOnly
                  size="sm"
                  variant="tertiary"
                  aria-label={t`Remove project`}
                  isDisabled={busy}
                  onPress={() => removeConfirm.open(project)}
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {props.canManage ? (
        <>
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
                  })
                }
              >
                {busy ? <Loader2 className="size-4 m-spin" /> : <GitBranch className="size-4" />}
                <Trans>Clone</Trans>
              </Button>
            </div>
          </div>

          {error ? <p className="m-card__hint m-card__hint--accent">{error}</p> : null}
        </>
      ) : (
        <div className="m-card">
          <p className="m-card__hint">
            <Trans>This connection can view projects but not manage them. Re-pair to enable.</Trans>
          </p>
        </div>
      )}

      {pickerTarget ? (
        <HostFolderPicker
          title={pickerTarget === "clone" ? t`Choose a parent folder` : t`Choose a folder`}
          initialPath={pickerTarget === "clone" ? cloneParent : folderPath}
          onClose={() => setPickerTarget(null)}
          onSelect={(path) => {
            if (pickerTarget === "clone") {
              setCloneParent(path);
            } else {
              setFolderPath(path);
            }
          }}
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
            <button type="button" className="m-sheet-action" onClick={removeConfirm.close}>
              <Trans>Cancel</Trans>
            </button>
            <button
              type="button"
              className="m-sheet-action text-danger"
              disabled={busy}
              onClick={() => {
                const projectId = removeConfirm.target!.id;
                removeConfirm.close();
                run(() => props.onCommand({ kind: "remove", projectId }));
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
