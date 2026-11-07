import { startTransition } from "react";
import { makeDraftPaneId } from "@/shared/paneId";
import { useAppStore } from "@/renderer/state/appStore";
import { flattenSegments } from "@/renderer/components/composer/serializeMentions";
import { rememberWorkspaceProject } from "@/renderer/state/workspaceStore";
import { useProjectGroupStore } from "@/renderer/state/projectGroups/projectGroupStore";
import { captureProjectDraft } from "@/renderer/state/mountedProjectDrafts";
import { composerDraftStorage } from "@/renderer/state/composerDraftStorage";
import { mergeDraftContent } from "@/renderer/state/projectReferences";
import { isClientDraftAsset } from "@/renderer/state/composerDrafts/clientDraftDatabase";

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
  if (currentProjectId === nextProjectId) return;
  const store = useAppStore.getState();
  const source = store.projects.find((project) => project.id === currentProjectId);
  if (!source || !store.projects.some((project) => project.id === nextProjectId)) return;
  const live = captureProjectDraft(currentProjectId).read();
  const saved = live ?? store.draftContents[currentProjectId];
  const origin = source.remoteServerId ? { remoteServerId: source.remoteServerId } : {};
  const sourceContent =
    saved && (saved.attachments.length > 0 || flattenSegments(saved.segments).trim().length > 0)
      ? saved.attachments.every(
          (attachment) => attachment.source || isClientDraftAsset(attachment.path),
        )
        ? saved
        : {
            ...saved,
            attachments: saved.attachments.map((attachment) =>
              attachment.source || isClientDraftAsset(attachment.path)
                ? attachment
                : { ...attachment, source: origin },
            ),
          }
      : undefined;
  const destination = store.draftContents[nextProjectId];
  const content =
    sourceContent && destination ? mergeDraftContent(sourceContent, destination) : sourceContent;
  if (sourceContent)
    composerDraftStorage()?.transferIdentity("project", currentProjectId, nextProjectId);
  rememberWorkspaceProject(nextProjectId);
  useProjectGroupStore.getState().markProjectUsed(nextProjectId);
  if (content && (content.attachments.length > 0 || flattenSegments(content.segments))) {
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
      composerDraftStorage()?.saveSelection("project", nextProjectId, config);
    }
  }
  store.discardDraftContent(currentProjectId);
  // Embedding surfaces own their local view; the shared draft move above still
  // applies before handing the target back to them.
  if (options.onSelectProject) {
    options.onSelectProject(nextProjectId);
    return;
  }
  const { paneId } = options;
  startTransition(() => {
    if (paneId) {
      store.replacePaneId(paneId, makeDraftPaneId(nextProjectId));
    } else {
      store.openDraft(nextProjectId);
    }
  });
}
