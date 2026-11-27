import { useEffect, useEffectEvent, useState } from "react";
import type { Project, ProjectTreeEntry, SearchProjectTreePayload } from "@/shared/contracts";
import { resolveSearchConfig } from "@/shared/searchExclude";
import { readBridge } from "@/renderer/bridge";
import { useHostSetting } from "@/renderer/state/pairedHostSettings";
import { buildFileEditorContext, resolveWorktreeBranch } from "@/renderer/utils/gitHelpers";

export const FILE_SEARCH_LIMIT = 200;
const EMPTY_ENTRIES: ProjectTreeEntry[] = [];

interface CompletedSearch {
  key: string;
  attempt: number;
  entries: ProjectTreeEntry[];
  failed: boolean;
  provisional: boolean;
}

export function useEverythingFileSearch(input: {
  project: Project | undefined;
  worktreePath: string | undefined;
  worktreeBranch: string | undefined;
  query: string;
  enabled: boolean;
}) {
  const host = input.project?.location.remoteServerId;
  const globalUseIgnoreFiles = useHostSetting(host, "searchUseIgnoreFiles");
  const globalExclude = useHostSetting(host, "searchExclude");
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
  const createSearch = useEffectEvent(() => {
    const request = payload!;
    return (provisional: boolean) =>
      readBridge().searchProjectTree({ ...request, ...(provisional ? { provisional: true } : {}) });
  });

  useEffect(() => {
    if (requestKey === null) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      const search = createSearch();
      void (async () => {
        try {
          const publish = (result: Awaited<ReturnType<typeof search>>) => {
            if (cancelled) return;
            setCompleted({
              key: requestKey,
              attempt,
              entries: result.entries.filter((entry) => entry.type === "file"),
              failed: false,
              provisional: result.provisional === true,
            });
          };
          const initial = await search(true);
          if (cancelled) return;
          publish(initial);
          if (initial.provisional) publish(await search(false));
        } catch {
          if (cancelled) return;
          setCompleted((latest) => ({
            key: requestKey,
            attempt,
            entries:
              latest?.key === requestKey && latest.attempt === attempt
                ? latest.entries
                : EMPTY_ENTRIES,
            failed: true,
            provisional: false,
          }));
        }
      })();
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
    loading: requestKey !== null && (current === null || current.provisional),
    failed: current?.failed ?? false,
    retry: () => setAttempt((value) => value + 1),
  };
}
