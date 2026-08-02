import { useEffect, useRef } from "react";
import { Button, Tooltip, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  ChevronsDownUp,
  FilePlus,
  FolderOpen,
  FolderPlus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ProjectTreeEntry } from "@/shared/contracts";
import { ContextMenu, PixelLoader } from "@/renderer/components/common";
import { getEntryIconUrl } from "@/renderer/components/common/fileIcons";
import { useScrollFade } from "@/renderer/hooks/useScrollFade";
import { useFindFocusStore } from "@/renderer/state/findFocusStore";
import type { FileEditorRootContext } from "@/renderer/state/fileEditorStore";
import { useIsTabActive, useIsPathOpenInTab } from "@/renderer/state/fileEditorSelectors";
import {
  useIsDropTarget,
  useIsPathLoading,
  useProjectTreeStore,
} from "@/renderer/state/projectTreeStore";
import { InlineDraftRow } from "./parts/InlineDraftRow";
import { TreeEntryRow } from "./parts/TreeEntryRow";
import { useProjectTree } from "./parts/useProjectTree";
import type { TreeDraftState } from "./parts/useProjectTree";

type ProjectTreeRow =
  | { kind: "entry"; entry: ProjectTreeEntry; depth: number }
  | { kind: "draft"; parentPath: string; draft: TreeDraftState; depth: number }
  | { kind: "loading"; parentPath: string; depth: number };

export function ProjectTreeView(props: {
  rootContext: FileEditorRootContext;
  onSelectFile: (path: string) => void;
  onPinFile?: (path: string) => void;
}) {
  const { t } = useLingui();
  const tree = useProjectTree(props);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const treeFocusToken = useFindFocusStore((state) => state.treeFocusToken);
  const lastTreeFocusToken = useRef(treeFocusToken);
  useEffect(() => {
    if (treeFocusToken === lastTreeFocusToken.current) return;
    lastTreeFocusToken.current = treeFocusToken;
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, [treeFocusToken]);
  const rootIsDropTarget = useIsDropTarget("");
  const rootLoading = useIsPathLoading("");
  const { setScrollContainer, scrollRef, scrollFadeStyle } = useScrollFade<HTMLDivElement>({
    maxFadePx: 10,
  });
  const directoryEntries = useProjectTreeStore((s) => s.directoryEntries);
  const expandedPaths = useProjectTreeStore((s) => s.expandedPaths);
  const loadingPaths = useProjectTreeStore((s) => s.loadingPaths);
  const isAnyDirectoryLoaded = useProjectTreeStore(
    (s) => Object.keys(s.directoryEntries).length > 0,
  );
  const rows = flattenProjectTreeRows({
    directoryEntries,
    expandedPaths,
    loadingPaths,
    draft: tree.draft,
  });
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 24,
    overscan: 16,
  });

  return (
    <ContextMenu
      items={[
        ...(props.rootContext.remoteServerId
          ? []
          : [
              {
                id: "reveal-root",
                label: t`Reveal in File Explorer`,
                icon: <FolderOpen className="size-3.5" />,
              },
            ]),
        { id: "new-file", label: t`New File`, icon: <FilePlus className="size-3.5" /> },
        { id: "new-folder", label: t`New Folder`, icon: <FolderPlus className="size-3.5" /> },
        {
          id: "collapse-all",
          label: t`Collapse All`,
          icon: <ChevronsDownUp className="size-3.5" />,
        },
        { id: "refresh", label: t`Refresh`, icon: <RefreshCw className="size-3.5" /> },
      ]}
      onAction={(action) => {
        void tree.handleRootAction(action);
      }}
    >
      <div
        className="flex h-full min-h-0 flex-col bg-inherit"
        onDragOver={(event) => {
          event.preventDefault();
          useProjectTreeStore.getState().setDropTargetPath("");
        }}
        onDragLeave={() => {
          if (useProjectTreeStore.getState().dropTargetPath === "") {
            useProjectTreeStore.getState().setDropTargetPath(null);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          useProjectTreeStore.getState().setDropTargetPath(null);
          const payload = event.dataTransfer.getData("application/poracode-project-tree");
          if (!payload) return;
          try {
            const { path } = JSON.parse(payload) as { path: string };
            void tree
              .handleMovePath(path, "")
              .catch((error) =>
                toast.danger(error instanceof Error ? error.message : String(error)),
              );
          } catch {
            // ignore malformed drops
          }
        }}
      >
        <div className="flex items-center gap-2 border-b border-[color:var(--border)] px-0 py-2">
          <div
            data-poracode-find-scope="tree"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-3xl px-2 py-1.5 text-muted transition-colors hover:bg-[var(--row-hover)] hover:text-foreground focus-within:bg-[var(--row-active)] focus-within:text-foreground"
          >
            <Search className="size-3.5 shrink-0 text-muted" />
            <input
              ref={searchInputRef}
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
              placeholder={t`Search files`}
              value={tree.searchQuery}
              onChange={(event) => tree.setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && tree.searchQuery) {
                  event.preventDefault();
                  tree.setSearchQuery("");
                }
              }}
            />
            {tree.searchQuery && (
              <button
                type="button"
                aria-label={t`Clear search`}
                onClick={() => tree.setSearchQuery("")}
                className="flex size-4 shrink-0 items-center justify-center rounded text-muted hover:bg-[var(--row-hover)] hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
          <Tooltip delay={200}>
            <Tooltip.Trigger>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                onPress={() => void tree.handleRootAction("collapse-all")}
              >
                <ChevronsDownUp className="size-4" />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content placement="bottom">
              <Trans>Collapse all folders</Trans>
            </Tooltip.Content>
          </Tooltip>
        </div>

        <div
          ref={setScrollContainer}
          className={`min-h-0 flex-1 overflow-auto px-0 py-2 ${
            rootIsDropTarget ? "ring-1 ring-inset ring-accent/40" : ""
          }`}
          style={scrollFadeStyle}
        >
          {tree.searchQuery.trim() ? (
            tree.searchLoading ? (
              <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted">
                <PixelLoader size="xs" />
                <Trans>Searching…</Trans>
              </div>
            ) : tree.searchResults.length > 0 ? (
              <div>
                {tree.searchResults.map((entry) => (
                  <SearchResultRow
                    key={entry.path}
                    entry={entry}
                    onOpen={() => tree.openSearchResult(entry)}
                  />
                ))}
              </div>
            ) : (
              <div className="px-2 py-2 text-xs text-muted">
                <Trans>No files match "{tree.searchQuery}".</Trans>
              </div>
            )
          ) : (
            <div>
              {rootLoading && !isAnyDirectoryLoaded ? (
                <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted">
                  <PixelLoader size="xs" />
                  <Trans>Loading…</Trans>
                </div>
              ) : (
                <div className="relative" style={{ height: `${virtualizer.getTotalSize()}px` }}>
                  {virtualizer.getVirtualItems().map((virtualRow) => {
                    const row = rows[virtualRow.index];
                    if (!row) return null;
                    const rowKey =
                      row.kind === "entry" ? row.entry.path : `${row.kind}:${row.parentPath}`;
                    return (
                      <div
                        key={rowKey}
                        className="absolute left-0 top-0 w-full"
                        style={{ transform: `translateY(${virtualRow.start}px)` }}
                      >
                        <ProjectTreeVirtualRow
                          row={row}
                          canReveal={!props.rootContext.remoteServerId}
                          draft={tree.draft}
                          setDraft={tree.setDraft}
                          onSelectFile={(path) => void tree.handleSelectFile(path)}
                          {...(props.onPinFile ? { onPinFile: props.onPinFile } : {})}
                          onToggleDirectory={(path) => void tree.toggleDirectory(path)}
                          onEntryAction={(entry, action) =>
                            void tree.handleEntryAction(entry, action)
                          }
                          onMovePath={tree.handleMovePath}
                          onHandleRename={tree.handleRenameEntry}
                          onHandleCreate={tree.handleCreateEntry}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ContextMenu>
  );
}

function flattenProjectTreeRows(input: {
  directoryEntries: Record<string, ProjectTreeEntry[]>;
  expandedPaths: Record<string, boolean>;
  loadingPaths: Record<string, boolean>;
  draft: TreeDraftState | null;
}): ProjectTreeRow[] {
  const rows: ProjectTreeRow[] = [];

  const visit = (parentPath: string, depth: number) => {
    const draft = input.draft;
    if (draft?.mode === "create" && draft.parentPath === parentPath) {
      rows.push({ kind: "draft", parentPath, draft, depth });
    }
    const entries = input.directoryEntries[parentPath] ?? [];
    if (input.loadingPaths[parentPath] && entries.length === 0) {
      rows.push({ kind: "loading", parentPath, depth });
      return;
    }
    for (const entry of entries) {
      rows.push({ kind: "entry", entry, depth });
      if (entry.type === "directory" && input.expandedPaths[entry.path]) {
        visit(entry.path, depth + 1);
      }
    }
  };

  visit("", 0);
  return rows;
}

function ProjectTreeVirtualRow(props: {
  row: ProjectTreeRow;
  canReveal: boolean;
  draft: TreeDraftState | null;
  setDraft: React.Dispatch<React.SetStateAction<TreeDraftState | null>>;
  onSelectFile: (path: string) => void;
  onPinFile?: (path: string) => void;
  onToggleDirectory: (path: string) => void;
  onEntryAction: (entry: ProjectTreeEntry, action: string) => void;
  onMovePath: (sourcePath: string, nextParentPath: string) => Promise<void>;
  onHandleRename: (path: string, nextName: string) => Promise<void>;
  onHandleCreate: (parentPath: string, type: "file" | "directory", value: string) => Promise<void>;
}) {
  const { row } = props;
  if (row.kind === "loading") {
    return (
      <div
        className="flex items-center gap-1.5 px-2 py-0.5 text-xs text-muted"
        style={{ paddingLeft: `${row.depth * 14 + 8}px` }}
      >
        <PixelLoader size="xs" />
        <Trans>Loading…</Trans>
      </div>
    );
  }
  if (row.kind === "draft") {
    return (
      <InlineDraftRow
        depth={row.depth}
        type={row.draft.type}
        value={row.draft.value}
        onChange={(value) => props.setDraft((state) => (state ? { ...state, value } : state))}
        onCancel={() => props.setDraft(null)}
        onCommit={(value) => {
          void props
            .onHandleCreate(row.parentPath, row.draft.type, value)
            .catch((error) => toast.danger(error instanceof Error ? error.message : String(error)));
        }}
      />
    );
  }
  return (
    <TreeEntryRow
      entry={row.entry}
      canReveal={props.canReveal}
      depth={row.depth}
      draft={props.draft}
      setDraft={props.setDraft}
      onSelectFile={props.onSelectFile}
      {...(props.onPinFile ? { onPinFile: props.onPinFile } : {})}
      onToggleDirectory={props.onToggleDirectory}
      onEntryAction={props.onEntryAction}
      onMovePath={props.onMovePath}
      onHandleRename={props.onHandleRename}
      onHandleCreate={props.onHandleCreate}
      renderChildren={false}
    />
  );
}

function SearchResultRow(props: { entry: ProjectTreeEntry; onOpen: () => void }) {
  const { entry } = props;
  const isSelected = useIsTabActive(entry.path);
  const isOpenInTabRaw = useIsPathOpenInTab(entry.path);
  const isOpenInTab = !isSelected && isOpenInTabRaw;

  const lastSlash = entry.path.lastIndexOf("/");
  const dirPath = lastSlash >= 0 ? entry.path.slice(0, lastSlash) : "";

  return (
    <button
      className={`flex w-full items-center gap-1.5 rounded-md px-2 py-0.5 text-left text-sm text-muted transition-colors hover:bg-[var(--row-hover)] hover:text-foreground ${
        isSelected
          ? "bg-[var(--row-active)] text-foreground"
          : isOpenInTab
            ? "bg-[var(--row-hover)] text-foreground"
            : ""
      }`}
      onClick={props.onOpen}
      title={entry.path}
      type="button"
    >
      <img
        alt=""
        aria-hidden
        className="size-4 shrink-0"
        src={getEntryIconUrl(entry.name, entry.type === "directory")}
      />
      <span className="min-w-0 truncate">{entry.name}</span>
      {dirPath && (
        <span className="min-w-0 flex-1 truncate text-right text-[11px] text-muted/70">
          {dirPath}
        </span>
      )}
    </button>
  );
}
