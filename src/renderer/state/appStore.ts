import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";
import type { Thread } from "@/shared/contracts";
import { createDbStorage } from "./dbStorage";
import { createDraftSlice } from "./slices/draftSlice";
import { normalizeStoredThreadStatus } from "./slices/helpers";
import { createLaunchSlice } from "./slices/launchSlice";
import { createPaneCacheSlice } from "./slices/paneCacheSlice";
import { createPendingSteerSlice } from "./slices/pendingSteerSlice";
import { createProjectSlice } from "./slices/projectSlice";
import { createRuntimeEventSlice } from "./slices/runtimeEventSlice";
import type { AppStoreState } from "./slices/shared";
import { createSubAgentOverlaySlice } from "./slices/subAgentOverlaySlice";
import { createThreadSlice } from "./slices/threadSlice";
import { createViewSlice } from "./slices/viewSlice";

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
        version: 4,
        storage: createDbStorage(),
        merge: (persistedState, currentState) => {
          const state =
            (persistedState as (Partial<AppStoreState> & { threads?: Thread[] }) | undefined) ??
            ({} as Partial<AppStoreState>);

          const threads = (state.threads ?? currentState.threads).map((t) => ({
            ...normalizeStoredThreadStatus(t),
            done: t.done ?? false,
            doneAt: t.done ? (t.doneAt ?? t.updatedAt) : undefined,
          }));
          return {
            ...currentState,
            ...state,
            threads,
            lastRuntimeConfigByThreadId: Object.fromEntries(
              threads.map((thread) => [thread.id, thread.config]),
            ),
          };
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
          return {
            projects: state.projects.filter((project) => !project.remoteServerId),
            threads: state.threads.filter((thread) => !thread.remoteServerId),
            view: hasRemoteView ? { kind: "home" as const } : view,
            groupLayouts: state.groupLayouts,
          };
        },
      },
    ),
  ),
);
