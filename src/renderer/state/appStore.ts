import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";
import type { Thread } from "@/shared/contracts";
import { createDbStorage } from "./dbStorage";
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

          const deduped = dedupeProjects(
            state.projects ?? currentState.projects,
            currentProjectIdentityOptions(),
          );
          const projects = deduped.projects;
          const view = remapProjectView(state.view ?? currentState.view, deduped.duplicateIds);
          const threads = remapThreadProjectIds(
            (state.threads ?? currentState.threads).map((t) => ({
              ...normalizeStoredThreadStatus(t),
              ...(t.archived ? { archivedAt: t.archivedAt ?? t.updatedAt } : {}),
              done: t.done ?? false,
              doneAt: t.done ? (t.doneAt ?? t.updatedAt) : undefined,
            })),
            deduped.duplicateIds,
          );
          const merged = {
            ...currentState,
            ...state,
            projects,
            view,
            threads,
            groupLayouts: remapProjectGroupLayouts(
              state.groupLayouts ?? currentState.groupLayouts,
              deduped.duplicateIds,
            ),
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
        partialize: (state) => {
          const view = state.view;
          const hasRemoteView =
            (view.kind === "draft" &&
              state.projects.some(
                (project) => project.id === view.projectId && project.remoteServerId,
              )) ||
            (view.kind === "thread" &&
              view.panes.some((paneId) =>
                state.threads.some((thread) => thread.id === paneId && thread.remoteServerId),
              ));
          const hasPendingWorktreeView =
            view.kind === "thread" &&
            view.panes.some((paneId) =>
              state.threads.some(
                (thread) => thread.id === paneId && state.provisioningWorktreeThreadIds[thread.id],
              ),
            );
          return {
            projects: state.projects.filter((project) => !project.remoteServerId),
            // Worktree-provisioning rows are renderer-only placeholders. If one
            // survived a restart, `launching` would hydrate as `inactive` and
            // reopening it would launch the agent in the base checkout.
            threads: state.threads.filter(
              (thread) => !thread.remoteServerId && !state.provisioningWorktreeThreadIds[thread.id],
            ),
            view: hasRemoteView || hasPendingWorktreeView ? { kind: "home" as const } : view,
            groupLayouts: state.groupLayouts,
          };
        },
      },
    ),
  ),
);
