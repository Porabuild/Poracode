import type { Project } from "@/shared/contracts";
import { dedupeProjects, projectIdentityKey } from "@/shared/projectIdentity";
import { remapPaneId } from "@/shared/projectReferences";
import { useAppStore } from "./appStore";
import { useExperimentStore } from "./experimentStore";
import { usePanelStore } from "./panelStore";
import { transferMountedProjectDrafts } from "./mountedProjectDrafts";
import {
  currentProjectIdentityOptions,
  mergePendingComposerSeeds,
  remapProjectGroupLayouts,
  remapProjectRecord,
  remapProjectView,
  remapThreadProjectIds,
} from "./projectReferences";

/** Apply an authoritative project snapshot and transfer every reference to repaired IDs. */
export function applyProjectStateSnapshot(projects: Project[]): void {
  const options = currentProjectIdentityOptions();
  const deduped = dedupeProjects(projects, options);
  const canonicalByIdentity = new Map(
    deduped.projects.map((project) => [projectIdentityKey(project, options), project]),
  );
  const projectIds = new Set(deduped.projects.map((project) => project.id));
  for (const previous of useAppStore.getState().projects) {
    if (projectIds.has(previous.id)) continue;
    const canonical = canonicalByIdentity.get(projectIdentityKey(previous, options));
    if (canonical) deduped.duplicateIds.set(previous.id, canonical.id);
  }
  const duplicateIds = deduped.duplicateIds;
  const draftContents = transferMountedProjectDrafts(
    useAppStore.getState().draftContents,
    duplicateIds,
  );
  useAppStore.setState((state) => ({
    projects: deduped.projects,
    threads: remapThreadProjectIds(state.threads, duplicateIds),
    view: remapProjectView(state.view, duplicateIds),
    focusedPaneId: state.focusedPaneId ? remapPaneId(state.focusedPaneId, duplicateIds) : null,
    groupLayouts: remapProjectGroupLayouts(state.groupLayouts, duplicateIds),
    draftContents,
    pendingDraftWorktreeSelections: remapProjectRecord(
      state.pendingDraftWorktreeSelections,
      duplicateIds,
    ),
    pendingComposerSeeds: remapProjectRecord(
      state.pendingComposerSeeds,
      duplicateIds,
      mergePendingComposerSeeds,
    ),
    draftContentDiscardRequests: remapProjectRecord(
      state.draftContentDiscardRequests,
      duplicateIds,
    ),
  }));
  useExperimentStore.getState().remapProjectIds(duplicateIds);
  usePanelStore.setState((state) => ({
    projectSettingsId: state.projectSettingsId
      ? (duplicateIds.get(state.projectSettingsId) ?? state.projectSettingsId)
      : null,
    gitReviewContext: remapPanelProjectId(state.gitReviewContext, duplicateIds),
    prReviewContext: remapPanelProjectId(state.prReviewContext, duplicateIds),
    githubActionsContext: remapPanelProjectId(state.githubActionsContext, duplicateIds),
    filesPanelContext: remapPanelProjectId(state.filesPanelContext, duplicateIds),
  }));
  useExperimentStore.getState().reconcileExperiments(projectIds);
}

function remapPanelProjectId<T extends { projectId?: string }>(
  context: T | null,
  duplicateIds: ReadonlyMap<string, string>,
): T | null {
  if (!context?.projectId) return context;
  const projectId = duplicateIds.get(context.projectId);
  return projectId ? { ...context, projectId } : context;
}
