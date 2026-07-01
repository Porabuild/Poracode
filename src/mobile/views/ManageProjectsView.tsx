import { useState } from "react";
import { Button } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { FolderPlus, GitBranch, Loader2, Trash2 } from "lucide-react";
import type { Project } from "@/shared/contracts";
import { cloneFolderNameFromUrl } from "@/shared/createProject";
import type { RemoteProjectCommand } from "@/shared/remote";
import { useAsyncOperation } from "@/renderer/hooks/useAsyncOperation";

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
  const { busy, error, run } = useAsyncOperation();

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
                  onPress={() =>
                    run(() => props.onCommand({ kind: "remove", projectId: project.id }))
                  }
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
              <label className="m-field">
                <span className="m-field__label">
                  <Trans>Folder path on the server</Trans>
                </span>
                <input
                  value={folderPath}
                  aria-label={t`Folder path`}
                  placeholder="/home/me/projects/app"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(event) => setFolderPath(event.currentTarget.value)}
                />
              </label>
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
              <label className="m-field">
                <span className="m-field__label">
                  <Trans>Parent folder on the server</Trans>
                </span>
                <input
                  value={cloneParent}
                  aria-label={t`Parent folder`}
                  placeholder="/home/me/projects"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(event) => setCloneParent(event.currentTarget.value)}
                />
              </label>
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
    </section>
  );
}
