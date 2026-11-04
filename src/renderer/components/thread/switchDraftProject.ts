import { startTransition } from "react";
import { makeDraftPaneId } from "@/shared/paneId";
import { useAppStore } from "@/renderer/state/appStore";
import { flattenSegments } from "@/renderer/components/composer/serializeMentions";
import { rememberWorkspaceProject } from "@/renderer/state/workspaceStore";
import { useProjectGroupStore } from "@/renderer/state/projectGroups/projectGroupStore";

export interface SwitchDraftProjectOptions {
  /** When provided, switching replaces this pane id instead of changing the top-level draft view. */
  paneId?: string | undefined;
  /** Keeps project selection local to an embedding surface such as Quick Composer. */
  onSelectProject?: ((projectId: string) => void) | undefined;
}

/**
 * Move the new-thread draft to another project row — another project, or the
 * same logical project on another environment. Typed content and the chosen
 * agent/model travel with the draft.
 */
export function switchDraftProject(
  currentProjectId: string,
  nextProjectId: string,
  options: SwitchDraftProjectOptions = {},
): void {
  if (nextProjectId === currentProjectId) return;
  rememberWorkspaceProject(nextProjectId);
  useProjectGroupStore.getState().markProjectUsed(nextProjectId);
  if (options.onSelectProject) {
    options.onSelectProject(nextProjectId);
    return;
  }
  const store = useAppStore.getState();
  const content = store.draftContents[currentProjectId];
  if (content && flattenSegments(content.segments)) {
    store.saveDraftContent(nextProjectId, content);
    const sourceConfig = store.projects.find(
      (project) => project.id === currentProjectId,
    )?.lastDraftConfig;
    const targetConfig = store.projects.find(
      (project) => project.id === nextProjectId,
    )?.lastDraftConfig;
    if (sourceConfig) {
      const config = {
        ...targetConfig,
        agentKind: sourceConfig.agentKind,
        model: sourceConfig.model,
      };
      for (const field of [
        "effort",
        "contextSize",
        "fast",
        "thinking",
        "selectionBinding",
      ] as const) {
        delete config[field];
        if (sourceConfig[field] !== undefined) {
          Object.assign(config, { [field]: sourceConfig[field] });
        }
      }
      store.updateProjectDraftConfig(nextProjectId, config);
    }
  }
  store.discardDraftContent(currentProjectId);
  const { paneId } = options;
  startTransition(() => {
    if (paneId) {
      store.replacePaneId(paneId, makeDraftPaneId(nextProjectId));
    } else {
      store.openDraft(nextProjectId);
    }
  });
}
