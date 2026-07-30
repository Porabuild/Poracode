import { useEffect, useState } from "react";
import type { Project, ProjectTreeEntry } from "@/shared/contracts";
import { resolveSearchConfig } from "@/shared/searchExclude";
import { readBridge } from "@/renderer/bridge";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { buildFileEditorContext, resolveWorktreeBranch } from "@/renderer/utils/gitHelpers";

interface FileSearchState {
  entries: ProjectTreeEntry[];
  loading: boolean;
  failed: boolean;
}

const EMPTY_STATE: FileSearchState = { entries: [], loading: false, failed: false };

export function useEverythingFileSearch(input: {
  project: Project | undefined;
  worktreePath: string | undefined;
  worktreeBranch: string | undefined;
  query: string;
  enabled: boolean;
}): FileSearchState {
  const globalUseIgnoreFiles = useSharedSettings((state) => state.searchUseIgnoreFiles);
  const globalExclude = useSharedSettings((state) => state.searchExclude);
  const [state, setState] = useState<FileSearchState>(EMPTY_STATE);

  useEffect(() => {
    const trimmed = input.query.trim();
    if (!input.enabled || !input.project || !trimmed) {
      setState(EMPTY_STATE);
      return;
    }

    const project = input.project;
    const context = buildFileEditorContext(
      project,
      input.worktreePath,
      input.worktreePath
        ? resolveWorktreeBranch(project.id, input.worktreePath, input.worktreeBranch)
        : undefined,
    );
    const searchConfig = resolveSearchConfig({
      globalUseIgnoreFiles,
      globalExclude,
      projectUseIgnoreFiles: project.searchSettings?.useIgnoreFiles,
      projectExclude: project.searchSettings?.exclude,
    });
    let cancelled = false;
    setState({ entries: [], loading: true, failed: false });

    const handle = window.setTimeout(() => {
      void readBridge()
        .searchProjectTree({
          projectLocation: context.projectLocation,
          query: trimmed,
          limit: 80,
          entryType: "file",
          searchConfig,
        })
        .then((result) => {
          if (cancelled) return;
          setState({
            entries: result.entries,
            loading: false,
            failed: false,
          });
        })
        .catch(() => {
          if (!cancelled) setState({ entries: [], loading: false, failed: true });
        });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [
    input.enabled,
    input.project,
    input.query,
    input.worktreeBranch,
    input.worktreePath,
    globalExclude,
    globalUseIgnoreFiles,
  ]);

  return state;
}
