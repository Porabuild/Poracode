import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  File,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader2,
  MoreHorizontal,
  Pencil,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type {
  AbsoluteFileReadStatus,
  Project,
  ProjectLocation,
  ProjectTreeEntry,
} from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { HighlightedEditor } from "../HighlightedEditor";
import { BottomSheet, useSheet } from "../components";

export interface FilesTarget {
  readonly project: Project;
  readonly projectLocation: ProjectLocation;
  readonly rootLabel: string;
  readonly worktreePath?: string | undefined;
}

interface OpenFileState {
  readonly path: string;
  readonly status: AbsoluteFileReadStatus;
  readonly modifiedAtMs: number;
  readonly content: string;
  readonly savedContent: string;
  readonly isLoading: boolean;
  readonly readOnly: boolean;
}

interface TreeRow {
  readonly entry: ProjectTreeEntry;
  readonly depth: number;
}

function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

function locationKey(location: ProjectLocation): string {
  if (location.kind === "wsl") return `${location.kind}:${location.distro}:${location.linuxPath}`;
  return `${location.kind}:${location.path}`;
}

function parentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function ancestorPaths(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  const ancestors: string[] = [];
  for (let i = 1; i <= parts.length; i += 1) {
    ancestors.push(parts.slice(0, i).join("/"));
  }
  return ancestors;
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

function flattenRows(
  directoryEntries: Record<string, ProjectTreeEntry[]>,
  expandedPaths: Record<string, boolean>,
): TreeRow[] {
  const rows: TreeRow[] = [];
  const visit = (directoryPath: string, depth: number) => {
    for (const entry of directoryEntries[directoryPath] ?? []) {
      rows.push({ entry, depth });
      if (entry.type === "directory" && expandedPaths[entry.path]) {
        visit(entry.path, depth + 1);
      }
    }
  };
  visit("", 0);
  return rows;
}

function fileStatusMessage(status: AbsoluteFileReadStatus) {
  if (status === "missing") return <Trans>File no longer exists on disk.</Trans>;
  if (status === "binary") return <Trans>Binary files can't be edited here.</Trans>;
  if (status === "too_large") return <Trans>This file is too large for the built-in editor.</Trans>;
  return <Trans>This file uses an unsupported encoding.</Trans>;
}

function toastError(error: unknown): void {
  toast.danger(error instanceof Error ? error.message : String(error));
}

function buildOpenFile(
  path: string,
  result: {
    readonly status: AbsoluteFileReadStatus;
    readonly modifiedAtMs?: number;
    readonly content?: string;
  },
  readOnly: boolean,
): OpenFileState {
  const content = result.status === "ready" ? (result.content ?? "") : "";
  return {
    path,
    status: result.status,
    modifiedAtMs: result.modifiedAtMs ?? 0,
    content,
    savedContent: content,
    isLoading: false,
    readOnly,
  };
}

/**
 * The "Files" tab of the unified workspace panel: a project/worktree file tree
 * with search and a lightweight inline editor. Like the Changes pane it owns no
 * top chrome — the root label, refresh control and back button live in the
 * {@link WorkspaceView} shell — and reports its busy/immersive (a file is open)
 * state up so the shell can drive the shared header.
 */
export function FilesView(props: {
  readonly target: FilesTarget;
  /** Bumped by the shell's refresh button to reload the tree root. */
  readonly refreshSignal: number;
  readonly initialFilePath?: string | undefined;
  readonly initialFolderPath?: string | undefined;
  readonly initialLineNumber?: number | undefined;
  /** Changes when the shell asks this already-mounted pane to open the same path again. */
  readonly initialOpenKey?: string | undefined;
  readonly onRefreshingChange?: (refreshing: boolean) => void;
  /** True while the inline editor is open (the shell hides its chrome then). */
  readonly onImmersiveChange?: (immersive: boolean) => void;
}) {
  const { t } = useLingui();
  const rootKey = `${props.target.project.id}:${props.target.worktreePath ?? ""}:${locationKey(
    props.target.projectLocation,
  )}`;
  const [directoryEntries, setDirectoryEntries] = useState<Record<string, ProjectTreeEntry[]>>({});
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({ "": true });
  const [loadingPaths, setLoadingPaths] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProjectTreeEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const [openFile, setOpenFile] = useState<OpenFileState | null>(null);
  const [saving, setSaving] = useState(false);
  const appliedInitialTargetRef = useRef<string | null>(null);
  const entrySheet = useSheet<ProjectTreeEntry>();

  const isDirty =
    openFile?.status === "ready" &&
    !openFile.readOnly &&
    !openFile.isLoading &&
    openFile.content !== openFile.savedContent;

  function setPathLoading(path: string, value: boolean) {
    setLoadingPaths((current) => {
      const next = { ...current };
      if (value) next[path] = true;
      else delete next[path];
      return next;
    });
  }

  async function loadDirectory(directoryPath: string) {
    setPathLoading(directoryPath, true);
    try {
      const result = await readBridge().listProjectTree({
        projectLocation: props.target.projectLocation,
        directoryPath,
      });
      setDirectoryEntries((current) => ({
        ...current,
        [result.directoryPath]: result.entries,
      }));
    } catch (error) {
      toastError(error);
    } finally {
      setPathLoading(directoryPath, false);
    }
  }

  async function reloadParent(path: string) {
    await loadDirectory(parentPath(path));
  }

  function resetSearch() {
    setQuery("");
    setSearchResults([]);
  }

  async function createEntry(type: "file" | "directory") {
    const label = type === "file" ? t`New file name` : t`New folder name`;
    const rawName = window.prompt(label);
    const name = rawName?.trim();
    if (!name) return;
    const path = joinPath("", name);
    try {
      await readBridge().createProjectEntry({
        projectLocation: props.target.projectLocation,
        path,
        type,
      });
      resetSearch();
      await loadDirectory("");
      if (type === "file") await openPath(path);
      else {
        setExpandedPaths((current) => ({ ...current, [path]: true }));
        await loadDirectory(path);
      }
    } catch (error) {
      toastError(error);
    }
  }

  async function renameEntry(entry: ProjectTreeEntry, nextName: string) {
    try {
      await readBridge().renameProjectEntry({
        projectLocation: props.target.projectLocation,
        path: entry.path,
        nextName,
      });
      resetSearch();
      await reloadParent(entry.path);
    } catch (error) {
      toastError(error);
    }
  }

  async function deleteEntry(entry: ProjectTreeEntry) {
    try {
      await readBridge().deleteProjectEntry({
        projectLocation: props.target.projectLocation,
        path: entry.path,
      });
      resetSearch();
      await reloadParent(entry.path);
    } catch (error) {
      toastError(error);
    }
  }

  function confirmDiscard(): boolean {
    if (!openFile || !isDirty) return true;
    const path = openFile.path;
    return window.confirm(t`Discard unsaved changes in ${path}?`);
  }

  function closeEditor() {
    if (!confirmDiscard()) return;
    setOpenFile(null);
  }

  async function openPath(path: string) {
    if (!confirmDiscard()) return;
    const absolute = isAbsolutePath(path);
    setOpenFile({
      path,
      status: "ready",
      modifiedAtMs: 0,
      content: "",
      savedContent: "",
      isLoading: true,
      readOnly: absolute,
    });
    try {
      if (absolute) {
        const result = await readBridge().readAbsoluteFile({
          projectLocation: props.target.projectLocation,
          absolutePath: path,
        });
        setOpenFile(buildOpenFile(path, result, true));
        return;
      }

      const result = await readBridge().readProjectFile({
        projectLocation: props.target.projectLocation,
        path,
      });
      setOpenFile(buildOpenFile(result.path, result, false));
    } catch (error) {
      setOpenFile(null);
      toast.danger(error instanceof Error ? error.message : t`Unable to open file`);
    }
  }

  async function toggleDirectory(path: string) {
    const isExpanded = expandedPaths[path] ?? false;
    if (!isExpanded && !(path in directoryEntries)) {
      await loadDirectory(path);
    }
    setExpandedPaths((current) => ({ ...current, [path]: !isExpanded }));
  }

  async function openSearchResult(entry: ProjectTreeEntry) {
    setQuery("");
    setSearchResults([]);
    const parent = parentPath(entry.path);
    setExpandedPaths((current) => ({
      ...current,
      [parent]: true,
      ...(entry.type === "directory" ? { [entry.path]: true } : {}),
    }));
    await loadDirectory(parent);
    if (entry.type === "directory") {
      await loadDirectory(entry.path);
      return;
    }
    await openPath(entry.path);
  }

  async function revealFolder(path: string) {
    const ancestors = ancestorPaths(path);
    setQuery("");
    setSearchResults([]);
    setExpandedPaths((current) => ({
      ...current,
      ...Object.fromEntries(ancestors.map((ancestor) => [ancestor, true])),
    }));
    await loadDirectory(parentPath(path));
    await loadDirectory(path);
  }

  async function saveOpenFile() {
    if (!openFile || openFile.status !== "ready" || openFile.readOnly || !isDirty || saving) {
      return;
    }
    setSaving(true);
    try {
      const result = await readBridge().writeProjectFile({
        projectLocation: props.target.projectLocation,
        path: openFile.path,
        content: openFile.content,
        baseModifiedAtMs: openFile.modifiedAtMs,
      });
      setOpenFile((current) =>
        current?.path === openFile.path
          ? {
              ...current,
              modifiedAtMs: result.modifiedAtMs,
              savedContent: current.content,
            }
          : current,
      );
    } catch (error) {
      toastError(error);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    setDirectoryEntries({});
    setExpandedPaths({ "": true });
    setLoadingPaths({});
    setQuery("");
    setSearchResults([]);
    setOpenFile(null);
    void loadDirectory("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rootKey captures the target project/worktree identity
  }, [rootKey]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const handle = window.setTimeout(() => {
      void readBridge()
        .searchProjectTree({
          projectLocation: props.target.projectLocation,
          query: trimmed,
          limit: 80,
        })
        .then((result) => {
          if (!cancelled) setSearchResults(result.entries);
        })
        .catch(() => {
          if (!cancelled) setSearchResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 140);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rootKey captures the target project/worktree identity
  }, [query, rootKey]);

  // The shell's shared refresh button bumps refreshSignal; skip the initial 0.
  useEffect(() => {
    if (props.refreshSignal > 0) void loadDirectory("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- driven only by the signal
  }, [props.refreshSignal]);

  useEffect(() => {
    const targetKey = props.initialFilePath
      ? `${rootKey}:file:${props.initialFilePath}:${props.initialLineNumber ?? ""}:${
          props.initialOpenKey ?? ""
        }`
      : props.initialFolderPath
        ? `${rootKey}:folder:${props.initialFolderPath}`
        : null;
    if (!targetKey || appliedInitialTargetRef.current === targetKey) return;
    appliedInitialTargetRef.current = targetKey;
    if (props.initialFilePath) {
      void openPath(props.initialFilePath);
    } else if (props.initialFolderPath) {
      void revealFolder(props.initialFolderPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open the route-provided path once per target key
  }, [
    rootKey,
    props.initialFilePath,
    props.initialFolderPath,
    props.initialLineNumber,
    props.initialOpenKey,
  ]);

  useEffect(() => {
    props.onRefreshingChange?.(Boolean(loadingPaths[""]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mirror root-load busy state up
  }, [loadingPaths[""]]);

  useEffect(() => {
    props.onImmersiveChange?.(openFile !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the open/closed transition matters
  }, [openFile?.path ?? null]);

  const rows = useMemo(
    () => flattenRows(directoryEntries, expandedPaths),
    [directoryEntries, expandedPaths],
  );
  const rootLoading = loadingPaths[""] && rows.length === 0;

  return (
    <div className="m-ws-pane">
      <div className="m-files-body">
        {openFile ? (
          <div className="m-files-editor">
            <header className="m-files-editor__head">
              <button
                className="m-back"
                type="button"
                aria-label={t`Back to files`}
                onClick={closeEditor}
              >
                <ChevronLeft className="size-5" />
              </button>
              <span className="m-files-editor__path" title={openFile.path}>
                {openFile.path}
                {isDirty ? " *" : ""}
              </span>
              <button
                type="button"
                className="m-files-save"
                disabled={!isDirty || saving || openFile.isLoading}
                onClick={() => void saveOpenFile()}
              >
                {saving ? <Loader2 className="size-4 m-spin" /> : <Save className="size-4" />}
                <span>{t`Save`}</span>
              </button>
            </header>
            {openFile.isLoading ? (
              <div className="m-files-status">
                <Loader2 className="size-5 m-spin" />
                <Trans>Loading…</Trans>
              </div>
            ) : openFile.status === "ready" ? (
              <HighlightedEditor
                value={openFile.content}
                path={openFile.path}
                {...(openFile.path === props.initialFilePath && props.initialLineNumber
                  ? { initialLineNumber: props.initialLineNumber }
                  : {})}
                {...(openFile.readOnly ? { readOnly: true } : {})}
                onChange={(next) =>
                  setOpenFile((current) =>
                    current?.path === openFile.path ? { ...current, content: next } : current,
                  )
                }
              />
            ) : (
              <div className="m-files-status">{fileStatusMessage(openFile.status)}</div>
            )}
          </div>
        ) : (
          <div className="m-files-tree">
            <div className="m-files-search">
              <Search className="size-3.5 shrink-0 text-muted" />
              <input
                value={query}
                placeholder={t`Search files`}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query ? (
                <button type="button" aria-label={t`Clear search`} onClick={() => setQuery("")}>
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
            <div className="m-files-toolbar">
              <button type="button" onClick={() => void createEntry("file")}>
                <FilePlus2 className="size-4" />
                <span>{t`New file`}</span>
              </button>
              <button type="button" onClick={() => void createEntry("directory")}>
                <FolderPlus className="size-4" />
                <span>{t`New folder`}</span>
              </button>
            </div>
            <div className="m-files-list">
              {query.trim() ? (
                searching ? (
                  <div className="m-files-status m-files-status--inline">
                    <Loader2 className="size-4 m-spin" />
                    <Trans>Loading…</Trans>
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((entry) => (
                    <FileRow
                      key={entry.path}
                      entry={entry}
                      depth={0}
                      expanded={false}
                      loading={false}
                      onPress={() => void openSearchResult(entry)}
                      onActions={() => entrySheet.open(entry)}
                    />
                  ))
                ) : (
                  <div className="m-files-empty">
                    <Trans>No files match "{query.trim()}".</Trans>
                  </div>
                )
              ) : rootLoading ? (
                <div className="m-files-status m-files-status--inline">
                  <Loader2 className="size-4 m-spin" />
                  <Trans>Loading…</Trans>
                </div>
              ) : (
                rows.map((row) => (
                  <FileRow
                    key={row.entry.path}
                    entry={row.entry}
                    depth={row.depth}
                    expanded={expandedPaths[row.entry.path] ?? false}
                    loading={loadingPaths[row.entry.path] ?? false}
                    onPress={() => {
                      if (row.entry.type === "directory") {
                        void toggleDirectory(row.entry.path);
                      } else {
                        void openPath(row.entry.path);
                      }
                    }}
                    onActions={() => entrySheet.open(row.entry)}
                  />
                ))
              )}
            </div>
            {entrySheet.target ? (
              <FileActionsSheet
                entry={entrySheet.target}
                closing={entrySheet.closing}
                onRename={(nextName) => void renameEntry(entrySheet.target!, nextName)}
                onDelete={() => void deleteEntry(entrySheet.target!)}
                onClose={entrySheet.close}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function FileRow(props: {
  readonly entry: ProjectTreeEntry;
  readonly depth: number;
  readonly expanded: boolean;
  readonly loading: boolean;
  readonly onPress: () => void;
  readonly onActions: () => void;
}) {
  const { t } = useLingui();
  const isDirectory = props.entry.type === "directory";
  return (
    <div className="m-file-row-shell">
      <button
        type="button"
        className="m-file-row"
        style={{ paddingLeft: `${props.depth * 0.875 + 0.625}rem` }}
        onClick={props.onPress}
      >
        <span className="m-file-row__chevron">
          {isDirectory && props.entry.hasChildren ? (
            props.loading ? (
              <Loader2 className="size-3.5 m-spin" />
            ) : (
              <ChevronRight className={`size-3.5 ${props.expanded ? "rotate-90" : ""}`} />
            )
          ) : null}
        </span>
        {isDirectory ? (
          props.expanded ? (
            <FolderOpen className="size-4 shrink-0 text-accent" />
          ) : (
            <Folder className="size-4 shrink-0 text-muted" />
          )
        ) : (
          <File className="size-4 shrink-0 text-muted" />
        )}
        <span className="m-file-row__name">{props.entry.name}</span>
        {props.entry.path !== props.entry.name ? (
          <span className="m-file-row__path">{parentPath(props.entry.path)}</span>
        ) : null}
      </button>
      <button
        type="button"
        className="m-file-row__action"
        aria-label={t`Actions for ${props.entry.name}`}
        onClick={props.onActions}
      >
        <MoreHorizontal className="size-4" />
      </button>
    </div>
  );
}

function FileActionsSheet(props: {
  readonly entry: ProjectTreeEntry;
  readonly closing?: boolean;
  readonly onRename: (nextName: string) => void;
  readonly onDelete: () => void;
  readonly onClose: () => void;
}) {
  const { t } = useLingui();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function rename() {
    const rawName = window.prompt(t`Rename to`, props.entry.name);
    const nextName = rawName?.trim();
    if (!nextName || nextName === props.entry.name) return;
    props.onRename(nextName);
    props.onClose();
  }

  return (
    <BottomSheet
      label={t`File actions`}
      closeLabel={t`Close file actions`}
      closing={props.closing}
      onClose={props.onClose}
    >
      <div className="m-sheet-head">
        <span className="truncate">{props.entry.name}</span>
      </div>
      {confirmingDelete ? (
        <div className="m-sheet-list">
          <p className="m-git-empty">
            <Trans>
              Delete <strong>{props.entry.name}</strong>? This cannot be undone.
            </Trans>
          </p>
          <button type="button" className="m-sheet-action" onClick={props.onClose}>
            <Trans>Cancel</Trans>
          </button>
          <button
            type="button"
            className="m-sheet-action text-danger"
            onClick={() => {
              props.onDelete();
              props.onClose();
            }}
          >
            <Trash2 className="size-4" />
            <Trans>Delete</Trans>
          </button>
        </div>
      ) : (
        <div className="m-sheet-list">
          <button type="button" className="m-sheet-action" onClick={rename}>
            <Pencil className="size-4" />
            <Trans>Rename</Trans>
          </button>
          <button
            type="button"
            className="m-sheet-action text-danger"
            onClick={() => setConfirmingDelete(true)}
          >
            <Trash2 className="size-4" />
            <Trans>Delete</Trans>
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
