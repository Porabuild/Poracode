import type { Project, Thread } from "@/shared/contracts";
import type {
  FileEditorOverlayMode,
  FileEditorRootContext,
} from "@/renderer/state/fileEditorStore";
import type { FilesPanelContext } from "@/renderer/state/panelStore";
import { resolveFilesRootContext } from "@/renderer/views/MainView/parts/RightPanel/parts/resolveFilesRootContext";
import { isEditorFocusElement } from "./focusedSurface";

/** The visible editor/tree takes precedence over the thread behind an overlay. */
export function resolveSearchScope(input: {
  projects: Project[];
  viewProjectId: string | undefined;
  thread: Pick<Thread, "worktreePath" | "worktreeBranch"> | undefined;
  editorRoot: Pick<FileEditorRootContext, "projectId" | "worktreePath"> | null;
  editorMode: FileEditorOverlayMode | null;
  filesPanel: FilesPanelContext | null;
  origin: Element | null;
}): {
  project: Project | undefined;
  worktreePath: string | undefined;
  worktreeBranch: string | undefined;
} {
  const filesRoot = resolveFilesRootContext(input.filesPanel, input.projects);
  const editorVisible =
    input.editorMode !== null || (input.origin?.isConnected && isEditorFocusElement(input.origin));
  const focusedTree = input.origin?.closest('[data-poracode-find-scope="tree"]');
  const root = editorVisible ? input.editorRoot : focusedTree ? filesRoot : null;
  const projectId = root?.projectId ?? input.viewProjectId ?? filesRoot?.projectId;
  const project = input.projects.find((candidate) => candidate.id === projectId);
  const worktreePath = root
    ? root.worktreePath
    : input.viewProjectId
      ? input.thread?.worktreePath
      : filesRoot?.worktreePath;
  return {
    project,
    worktreePath,
    worktreeBranch:
      worktreePath === input.thread?.worktreePath ? input.thread?.worktreeBranch : undefined,
  };
}
