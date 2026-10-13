import { useEffect, useEffectEvent, useState } from "react";
import type { Project, ProjectTreeEntry, SearchProjectTreePayload } from "@/shared/contracts";
import { resolveSearchConfig } from "@/shared/searchExclude";
import { readBridge } from "@/renderer/bridge";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { buildFileEditorContext, resolveWorktreeBranch } from "@/renderer/utils/gitHelpers";

export const FILE_SEARCH_LIMIT = 200;
const EMPTY_ENTRIES: ProjectTreeEntry[] = [];

interface CompletedSearch {
  key: string;
  attempt: number;
  entries: ProjectTreeEntry[];
  failed: boolean;
}

export function useEverythingFileSearch(input: {
  project: Project | undefined;
  worktreePath: string | undefined;
  worktreeBranch: string | undefined;
  query: string;
  enabled: boolean;
}) {
  const globalUseIgnoreFiles = useSharedSettings((state) => state.searchUseIgnoreFiles);
  const globalExclude = useSharedSettings((state) => state.searchExclude);
  const [completed, setCompleted] = useState<CompletedSearch | null>(null);
  const [attempt, setAttempt] = useState(0);
  const query = input.query.trim();
  const project = input.project;
  const context = project
    ? buildFileEditorContext(
        project,
        input.worktreePath,
        input.worktreePath
          ? resolveWorktreeBranch(project.id, input.worktreePath, input.worktreeBranch)
          : undefined,
      )
    : undefined;
  const payload: SearchProjectTreePayload | undefined =
    input.enabled && context && query
      ? {
          projectLocation: context.projectLocation,
          query,
          limit: FILE_SEARCH_LIMIT,
          entryType: "file",
          searchConfig: resolveSearchConfig({
            globalUseIgnoreFiles,
            globalExclude,
            projectUseIgnoreFiles: project?.searchSettings?.useIgnoreFiles,
            projectExclude: project?.searchSettings?.exclude,
          }),
        }
      : undefined;
  const requestKey = payload ? JSON.stringify([project?.id, payload]) : null;
  const search = useEffectEvent(() => readBridge().searchProjectTree(payload!));

  useEffect(() => {
    if (requestKey === null) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void search()
        .then((result) => {
          if (cancelled) return;
          setCompleted({
            key: requestKey,
            attempt,
            // Older hosts ignore the additive entryType field.
            entries: result.entries.filter((entry) => entry.type === "file"),
            failed: false,
          });
        })
        .catch(() => {
          if (!cancelled)
            setCompleted({ key: requestKey, attempt, entries: EMPTY_ENTRIES, failed: true });
        });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [requestKey, attempt]);

  // Gate during render: a query, scope, or config change must never expose a
  // previous request's files for the frame before the effect cleans up.
  const current =
    requestKey !== null && completed?.key === requestKey && completed.attempt === attempt
      ? completed
      : null;
  return {
    entries: current?.entries ?? EMPTY_ENTRIES,
    loading: requestKey !== null && current === null,
    failed: current?.failed ?? false,
    retry: () => setAttempt((value) => value + 1),
  };
}
