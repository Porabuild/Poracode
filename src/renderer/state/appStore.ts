import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";
import type { Thread } from "@/shared/contracts";
import { createDbStorage } from "./dbStorage";
import { createAppStorePartializer } from "./appStorePersistence";
import { createDraftSlice } from "./slices/draftSlice";
import { normalizeStoredThreadStatus } from "./slices/helpers";
import { createLaunchSlice } from "./slices/launchSlice";
import { createPaneCacheSlice, keepAlivePatch } from "./slices/paneCacheSlice";
import { createPendingSteerSlice } from "./slices/pendingSteerSlice";
import { createProjectSlice } from "./slices/projectSlice";
import { createRuntimeEventSlice } from "./slices/runtimeEventSlice";
import type { AppStoreState } from "./slices/shared";
import { createSubAgentOverlaySlice } from "./slices/subAgentOverlaySlice";
import { createThreadSlice } from "./slices/threadSlice";
import { createViewSlice } from "./slices/viewSlice";
import { dedupeProjects } from "@/shared/projectIdentity";
import {
  currentProjectIdentityOptions,
  mergeDraftContent,
  mergePendingComposerSeeds,
  remapProjectRecord,
  remapProjectGroupLayouts,
  remapProjectView,
  remapThreadProjectIds,
} from "./projectReferences";

export { makeThreadTitle } from "./slices/helpers";
export type { AppStoreState } from "./slices/shared";
export type { DraftContent, SavedGroupLayout } from "./slices/types";

/**
 * True while a preference still has its boot value, so applying the persisted
 * value cannot clobber a user edit made during hydration. `openHome` writes
 * exactly `{ kind: "home" }`; any richer view is a user decision.
 */
function isPristineView(view: AppStoreState["view"]): boolean {
  return view.kind === "home" && Object.keys(view).length === 1;
}

function isPristineGroupLayouts(groupLayouts: AppStoreState["groupLayouts"]): boolean {
  return Object.keys(groupLayouts).length === 0;
}

export const useAppStore = create<AppStoreState>()(
  subscribeWithSelector(
    persist(
      (...a) => ({
        ...createProjectSlice(...a),
        ...createThreadSlice(...a),
        ...createLaunchSlice(...a),
        ...createDraftSlice(...a),
        ...createViewSlice(...a),
        ...createPaneCacheSlice(...a),
        ...createRuntimeEventSlice(...a),
        ...createPendingSteerSlice(...a),
        ...createSubAgentOverlaySlice(...a),
      }),
      {
        name: "poracode-app-v2",
        version: 5,
        storage: createDbStorage(),
        migrate: (persistedState) => {
          const state = persistedState as Partial<AppStoreState> & { threads?: Thread[] };
          return {
            ...state,
            ...(state.threads
              ? {
                  threads: state.threads.map((thread) =>
                    thread.archived && !thread.archivedAt
                      ? { ...thread, archivedAt: thread.updatedAt }
                      : thread,
                  ),
                }
              : {}),
          };
        },
        merge: (persistedState, currentState) => {
          const state =
            (persistedState as (Partial<AppStoreState> & { threads?: Thread[] }) | undefined) ??
            ({} as Partial<AppStoreState>);
          // Desktop hydration is preferences-only; the host catalog may have
          // arrived while this read was in flight. Browser clients can hydrate
          // their persisted catalog rows.
          const persistedCatalog = state.projects !== undefined || state.threads !== undefined;
          const selectedProjects =
            persistedCatalog && state.projects !== undefined
              ? state.projects
              : currentState.projects;
          const deduped = dedupeProjects(selectedProjects, currentProjectIdentityOptions());
          const projects = deduped.projects;
          const selectedThreads = persistedCatalog
            ? (state.threads ?? currentState.threads).map((thread) => ({
                ...normalizeStoredThreadStatus(thread),
                ...(thread.archived ? { archivedAt: thread.archivedAt ?? thread.updatedAt } : {}),
                done: thread.done ?? false,
                doneAt: thread.done ? (thread.doneAt ?? thread.updatedAt) : undefined,
              }))
            : currentState.threads;
          const threads = remapThreadProjectIds(selectedThreads, deduped.duplicateIds);
          // Preserve user edits made while persisted preferences were loading.
          const selectedView =
            state.view !== undefined && isPristineView(currentState.view)
              ? state.view
              : currentState.view;
          const selectedGroupLayouts =
            state.groupLayouts !== undefined && isPristineGroupLayouts(currentState.groupLayouts)
              ? state.groupLayouts
              : currentState.groupLayouts;
          const merged = {
            ...currentState,
            projects,
            threads,
            view: remapProjectView(selectedView, deduped.duplicateIds),
            groupLayouts: remapProjectGroupLayouts(selectedGroupLayouts, deduped.duplicateIds),
            draftContents: remapProjectRecord(
              state.draftContents ?? currentState.draftContents,
              deduped.duplicateIds,
              mergeDraftContent,
            ),
            pendingDraftWorktreeSelections: remapProjectRecord(
              state.pendingDraftWorktreeSelections ?? currentState.pendingDraftWorktreeSelections,
              deduped.duplicateIds,
            ),
            pendingComposerSeeds: remapProjectRecord(
              state.pendingComposerSeeds ?? currentState.pendingComposerSeeds,
              deduped.duplicateIds,
              mergePendingComposerSeeds,
            ),
            draftContentDiscardRequests: remapProjectRecord(
              state.draftContentDiscardRequests ?? currentState.draftContentDiscardRequests,
              deduped.duplicateIds,
            ),
            lastRuntimeConfigByThreadId: Object.fromEntries(
              threads.map((thread) => [thread.id, thread.config]),
            ),
          };
          // Keep-alive membership is ephemeral; restore it from the selected panes.
          return { ...merged, ...keepAlivePatch(merged, []) };
        },
        partialize: createAppStorePartializer(),
      },
    ),
  ),
);
