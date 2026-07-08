import { useEffect, useMemo, useState } from "react";
import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { ProjectLocation, ProjectTreeEntry } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { screenStateTransition } from "../navHelpers";

interface TreeRow {
  readonly entry: ProjectTreeEntry;
  readonly depth: number;
}

function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

export function parentPath(path: string): string {
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

function toastError(error: unknown): void {
  toast.danger(error instanceof Error ? error.message : String(error));
}

export interface FileTreeApi {
  readonly expandedPaths: Record<string, boolean>;
  readonly loadingPaths: Record<string, boolean>;
  readonly query: string;
  readonly setQuery: (query: string) => void;
  readonly searchResults: ProjectTreeEntry[];
  readonly searching: boolean;
  readonly rows: TreeRow[];
  readonly rootLoading: boolean;
  readonly toggleDirectory: (path: string) => Promise<void>;
  readonly revealFolder: (path: string) => Promise<void>;
  readonly createEntry: (
    type: "file" | "directory",
    openPath: (path: string) => Promise<boolean>,
  ) => Promise<void>;
  readonly renameEntry: (entry: ProjectTreeEntry, nextName: string) => Promise<void>;
  readonly deleteEntry: (entry: ProjectTreeEntry) => Promise<void>;
  readonly openSearchResult: (
    entry: ProjectTreeEntry,
    openPath: (path: string) => Promise<boolean>,
  ) => Promise<void>;
}

/**
 * The Files tab's file-tree state machine: directory listing/loading,
 * expansion state, search, and refresh. `createEntry` and `openSearchResult`
 * take the sibling open-file hook's `openPath` as a call-time argument (not a
 * hook prop), so the two hooks don't need a fixed construction order.
 */
export function useFileTree(props: {
  readonly projectLocation: ProjectLocation;
  readonly rootKey: string;
  /** Bumped by the shell's refresh button to reload the tree root. */
  readonly refreshSignal: number;
  readonly onRefreshingChange?: (refreshing: boolean) => void;
}): FileTreeApi {
  const { t } = useLingui();
  const [directoryEntries, setDirectoryEntries] = useState<Record<string, ProjectTreeEntry[]>>({});
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({ "": true });
  const [loadingPaths, setLoadingPaths] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProjectTreeEntry[]>([]);
  const [searching, setSearching] = useState(false);

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
        projectLocation: props.projectLocation,
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

  async function createEntry(
    type: "file" | "directory",
    openPath: (path: string) => Promise<boolean>,
  ) {
    const label = type === "file" ? t`New file name` : t`New folder name`;
    const rawName = window.prompt(label);
    const name = rawName?.trim();
    if (!name) return;
    const path = joinPath("", name);
    try {
      await readBridge().createProjectEntry({
        projectLocation: props.projectLocation,
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
        projectLocation: props.projectLocation,
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
        projectLocation: props.projectLocation,
        path: entry.path,
      });
      resetSearch();
      await reloadParent(entry.path);
    } catch (error) {
      toastError(error);
    }
  }

  async function toggleDirectory(path: string) {
    const isExpanded = expandedPaths[path] ?? false;
    if (!isExpanded && !(path in directoryEntries)) {
      await loadDirectory(path);
    }
    setExpandedPaths((current) => ({ ...current, [path]: !isExpanded }));
  }

  async function openSearchResult(
    entry: ProjectTreeEntry,
    openPath: (path: string) => Promise<boolean>,
  ) {
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
    screenStateTransition("push", () => void openPath(entry.path));
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

  useEffect(() => {
    setDirectoryEntries({});
    setExpandedPaths({ "": true });
    setLoadingPaths({});
    setQuery("");
    setSearchResults([]);
    void loadDirectory("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rootKey captures the target project/worktree identity
  }, [props.rootKey]);

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
          projectLocation: props.projectLocation,
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
  }, [query, props.rootKey]);

  // The shell's shared refresh button bumps refreshSignal; skip the initial 0.
  useEffect(() => {
    if (props.refreshSignal > 0) void loadDirectory("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- driven only by the signal
  }, [props.refreshSignal]);

  useEffect(() => {
    props.onRefreshingChange?.(Boolean(loadingPaths[""]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mirror root-load busy state up
  }, [loadingPaths[""]]);

  const rows = useMemo(
    () => flattenRows(directoryEntries, expandedPaths),
    [directoryEntries, expandedPaths],
  );
  const rootLoading = Boolean(loadingPaths[""]) && rows.length === 0;

  return {
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
  };
}
