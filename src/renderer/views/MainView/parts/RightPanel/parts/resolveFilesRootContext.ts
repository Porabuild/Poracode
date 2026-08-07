import type { Project } from "@/shared/contracts";
import type { FileEditorRootContext } from "@/renderer/state/fileEditorStore";
import type { FilesPanelContext } from "@/renderer/state/panelStore";
import { buildFileEditorContext } from "@/renderer/utils/gitHelpers";

/** Resolve the files-panel store context into a live file editor root context. */
export function resolveFilesRootContext(
  context: FilesPanelContext | null,
  projects: Project[],
): FileEditorRootContext | null {
  if (!context) return null;
  const project = projects.find((p) => p.id === context.projectId);
  if (!project) return null;
  return {
    ...buildFileEditorContext(project, context.worktreePath),
    rootLabel: context.rootLabel,
  };
}
