import { useRef, useState, type CSSProperties } from "react";
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
import { useLongPress } from "@/renderer/hooks/useLongPress";
import { screenStateTransition } from "../navHelpers";
import { useGuardedInputKeyboard } from "../useGuardedInputKeyboard";
import { HighlightedEditor } from "../HighlightedEditor";
import { BottomSheet, Fab, useSheet } from "../components";
import { parentPath, useFileTree } from "./useFileTree";
import { useOpenFile } from "./useOpenFile";

export interface FilesTarget {
  readonly project: Project;
  readonly projectLocation: ProjectLocation;
  readonly rootLabel: string;
  readonly worktreePath?: string | undefined;
}

function locationKey(location: ProjectLocation): string {
  if (location.kind === "wsl") return `${location.kind}:${location.distro}:${location.linuxPath}`;
  return `${location.kind}:${location.path}`;
}

function fileStatusMessage(status: AbsoluteFileReadStatus) {
  if (status === "missing") return <Trans>File no longer exists on disk.</Trans>;
  if (status === "binary") return <Trans>Binary files can't be edited here.</Trans>;
  if (status === "too_large") return <Trans>This file is too large for the built-in editor.</Trans>;
  return <Trans>This file uses an unsupported encoding.</Trans>;
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

  const tree = useFileTree({
    projectLocation: props.target.projectLocation,
    rootKey,
    refreshSignal: props.refreshSignal,
    ...(props.onRefreshingChange ? { onRefreshingChange: props.onRefreshingChange } : {}),
  });
  const {
    expandedPaths,
    loadingPaths,
    query,
    setQuery,
    searchResults,
    searching,
    rows,
    rootLoading,
    toggleDirectory,
    revealFolder,
    createEntry,
    renameEntry,
    deleteEntry,
    openSearchResult,
  } = tree;

  const openFileHook = useOpenFile({
    projectLocation: props.target.projectLocation,
    rootKey,
    ...(props.initialFilePath !== undefined ? { initialFilePath: props.initialFilePath } : {}),
    ...(props.initialFolderPath !== undefined
      ? { initialFolderPath: props.initialFolderPath }
      : {}),
    ...(props.initialLineNumber !== undefined
      ? { initialLineNumber: props.initialLineNumber }
      : {}),
    ...(props.initialOpenKey !== undefined ? { initialOpenKey: props.initialOpenKey } : {}),
    ...(props.onImmersiveChange ? { onImmersiveChange: props.onImmersiveChange } : {}),
    revealFolder,
  });
  const { openFile, isDirty, saving, openPath, saveOpenFile, closeEditor, setOpenFileContent } =
    openFileHook;

  // The bottom search bar sits at the screen edge; a natively tap-focused
  // input there makes iOS pan the whole layout viewport. Run the composer's
  // guarded-focus choreography: intercept the tap, raise the keyboard through
  // the hidden primer when it's closed, lift the bar by the (remembered or
  // measured) keyboard height, then focus the real input with preventScroll.
  // `--m-keyboard-offset` drives the CSS transform on `.m-files-controls`.
  const searchBarRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // The bar unmounts behind the fullscreen editor; re-key so the hook re-wires
  // its listeners onto the fresh node when the tree view returns.
  const { liftOffset: searchLift } = useGuardedInputKeyboard(
    searchBarRef,
    searchInputRef,
    openFile ? null : `tree:${rootKey}`,
  );
  const entrySheet = useSheet<ProjectTreeEntry>();

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
                onChange={(next) => setOpenFileContent(openFile.path, next)}
              />
            ) : (
              <div className="m-files-status">{fileStatusMessage(openFile.status)}</div>
            )}
            {!openFile.readOnly && openFile.status === "ready" && !openFile.isLoading ? (
              <Fab
                label={t`Save`}
                disabled={!isDirty || saving}
                onPress={() => void saveOpenFile()}
                icon={saving ? <Loader2 className="size-5 m-spin" /> : <Save className="size-5" />}
              />
            ) : null}
          </div>
        ) : (
          <div className="m-files-tree">
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
                      onPress={() => void openSearchResult(entry, openPath)}
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
                        screenStateTransition("push", () => void openPath(row.entry.path));
                      }
                    }}
                    onActions={() => entrySheet.open(row.entry)}
                  />
                ))
              )}
            </div>
            <div
              className="m-files-controls"
              style={{ "--m-keyboard-offset": `${searchLift}px` } as CSSProperties}
            >
              <div className="m-files-search" ref={searchBarRef}>
                <Search className="size-4 shrink-0 text-muted" />
                <input
                  ref={searchInputRef}
                  value={query}
                  placeholder={t`Search files`}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query ? (
                  <button type="button" aria-label={t`Clear search`} onClick={() => setQuery("")}>
                    <X className="size-4" />
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                className="m-files-action"
                aria-label={t`New file`}
                onClick={() => void createEntry("file", openPath)}
              >
                <FilePlus2 className="size-5" />
              </button>
              <button
                type="button"
                className="m-files-action"
                aria-label={t`New folder`}
                onClick={() => void createEntry("directory", openPath)}
              >
                <FolderPlus className="size-5" />
              </button>
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
  const isDirectory = props.entry.type === "directory";
  const longPressHandlers = useLongPress(props.onActions);
  return (
    <button
      type="button"
      className="m-file-row"
      style={{ paddingLeft: `${props.depth * 0.875 + 0.625}rem` }}
      onClick={props.onPress}
      {...longPressHandlers}
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
