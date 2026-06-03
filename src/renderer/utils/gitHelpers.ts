import { toast } from "@heroui/react";
import type { Project } from "@/shared/contracts";
import { buildWorktreeLocation } from "@/shared/worktree";
import { readBridge } from "@/renderer/bridge";
import { captureRendererException } from "@/renderer/diagnostics/sentry";
import { useAppStore } from "@/renderer/state/appStore";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { useGitStore } from "@/renderer/state/gitStore";
import type { FileEditorRootContext } from "@/renderer/state/fileEditorStore";

interface GitDiffEditorRequest {
  staged: boolean;
  status: string;
}

type OpenFileInEditorOptions =
  | number
  | { lineNumber?: number; markdownPreview?: boolean; gitDiff?: GitDiffEditorRequest };

export const GIT_FETCH_PRIORITY_INTERVAL_MS = 180_000;
export const GIT_FETCH_BACKGROUND_INTERVAL_MS = 720_000;
export const STALE_THREAD_SWEEP_INTERVAL_MS = 5 * 60_000;

export function resolveWorktreeBranch(
  projectId: string,
  worktreePath: string,
  fallbackBranch?: string,
): string | undefined {
  const storeBranch = useAppStore
    .getState()
    .threads.find(
      (thread) =>
        thread.projectId === projectId &&
        thread.worktreePath === worktreePath &&
        thread.worktreeBranch,
    )?.worktreeBranch;
  if (storeBranch) return storeBranch;

  const gitBranch = useGitStore
    .getState()
    .worktrees[projectId]?.find((worktree) => worktree.path === worktreePath)?.branch;
  if (gitBranch) return gitBranch;

  return fallbackBranch;
}

export function buildFileEditorContext(
  project: Project,
  worktreePath?: string,
  worktreeBranch?: string,
): FileEditorRootContext {
  if (!worktreePath) {
    return {
      projectId: project.id,
      projectName: project.name,
      projectLocation: project.location,
      rootLabel: project.name,
    };
  }

  return {
    projectId: project.id,
    projectName: project.name,
    projectLocation: buildWorktreeLocation(project.location, worktreePath),
    rootLabel: worktreeBranch ?? worktreePath.split(/[/\\]/).pop() ?? project.name,
    worktreePath,
  };
}

export function compareFilesByDirThenName(a: { path: string }, b: { path: string }): number {
  const aSlash = a.path.lastIndexOf("/");
  const bSlash = b.path.lastIndexOf("/");
  const aDir = aSlash === -1 ? "" : a.path.substring(0, aSlash);
  const bDir = bSlash === -1 ? "" : b.path.substring(0, bSlash);
  const dirCmp = aDir.localeCompare(bDir, undefined, { sensitivity: "base" });
  if (dirCmp !== 0) return dirCmp;
  const aName = a.path.substring(aSlash + 1);
  const bName = b.path.substring(bSlash + 1);
  return aName.localeCompare(bName, undefined, { sensitivity: "base" });
}

export function shouldOpenGitDiffEditor(status: string): boolean {
  return status === "M";
}

export async function openFileInEditor(
  project: Project,
  worktreePath: string | undefined,
  worktreeBranch: string | undefined,
  path: string,
  options?: OpenFileInEditorOptions,
): Promise<void> {
  const fileEditor = useFileEditorStore.getState();
  const targetContext = buildFileEditorContext(project, worktreePath, worktreeBranch);
  const currentRoot = fileEditor.rootContext;
  const isSameContext =
    currentRoot?.projectId === targetContext.projectId &&
    currentRoot?.worktreePath === targetContext.worktreePath;
  if (!isSameContext) {
    fileEditor.setRootContext(targetContext);
  }
  const openOptions = typeof options === "number" ? { lineNumber: options } : options;
  let gitDiff: { diff: string } | undefined;
  if (openOptions?.gitDiff && shouldOpenGitDiffEditor(openOptions.gitDiff.status)) {
    try {
      const result = await readBridge().getGitDiff({
        projectLocation: targetContext.projectLocation,
        filePath: path,
        staged: openOptions.gitDiff.staged,
      });
      gitDiff = { diff: result.diff };
    } catch (error) {
      captureRendererException(error, { featureArea: "git" });
    }
  }
  const editorOptions = {
    ...(openOptions?.lineNumber !== undefined ? { lineNumber: openOptions.lineNumber } : {}),
    ...(openOptions?.markdownPreview !== undefined
      ? { markdownPreview: openOptions.markdownPreview }
      : {}),
    ...(gitDiff ? { gitDiff } : {}),
  };
  try {
    await fileEditor.openFile(path, "modal", false, editorOptions);
  } catch (error) {
    captureRendererException(error, { featureArea: "file-editor" });
    toast.danger(error instanceof Error ? error.message : String(error));
  }
}

export function autoDetectSetupScript(project: Project) {
  void readBridge()
    .detectSetupScript({ projectLocation: project.location })
    .then((result) => {
      if (result.setupScript) {
        useAppStore.getState().updateProjectScripts(project.id, {
          setupScript: result.setupScript,
          actions: [],
        });
      }
    })
    .catch((error: unknown) => {
      captureRendererException(error, { featureArea: "project-setup" });
    });
}
