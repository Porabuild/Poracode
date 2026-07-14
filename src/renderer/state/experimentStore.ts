import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Experiment, ExperimentCrown } from "@/shared/contracts";
import {
  EXPERIMENT_STORE_KEY,
  EXPERIMENT_STORE_VERSION,
  experimentSchema,
} from "@/shared/contracts";
import { createDbStorage } from "./dbStorage";

interface ExperimentStore {
  experiments: Record<string, Experiment>;
  addExperiment: (experiment: Experiment) => void;
  renameExperiment: (experimentId: string, title: string) => void;
  setExperimentCrown: (experimentId: string, crown: ExperimentCrown) => void;
  decideExperiment: (experimentId: string, winnerThreadId: string) => void;
  removeExperiment: (experimentId: string) => void;
  removeProjectExperiments: (projectId: string) => void;
  reconcileExperiments: (projectIds: ReadonlySet<string>) => void;
}

function parseExperiments(value: unknown): Record<string, Experiment> {
  if (!value || typeof value !== "object") return {};
  const parsed: Record<string, Experiment> = {};
  for (const [id, candidate] of Object.entries(value)) {
    const result = experimentSchema.safeParse(candidate);
    if (result.success && result.data.id === id) parsed[id] = result.data;
  }
  return parsed;
}

export const useExperimentStore = create<ExperimentStore>()(
  persist(
    (set) => ({
      experiments: {},
      addExperiment: (experiment) =>
        set((state) => ({
          experiments: { ...state.experiments, [experiment.id]: experiment },
        })),
      renameExperiment: (experimentId, title) =>
        set((state) => {
          const experiment = state.experiments[experimentId];
          const trimmed = title.trim();
          if (!experiment || !trimmed || trimmed === experiment.title) return state;
          return {
            experiments: {
              ...state.experiments,
              [experimentId]: {
                ...experiment,
                title: trimmed,
                updatedAt: new Date().toISOString(),
              },
            },
          };
        }),
      setExperimentCrown: (experimentId, crown) =>
        set((state) => {
          const experiment = state.experiments[experimentId];
          if (!experiment) return state;
          return {
            experiments: {
              ...state.experiments,
              [experimentId]: {
                ...experiment,
                crown,
                updatedAt: new Date().toISOString(),
              },
            },
          };
        }),
      decideExperiment: (experimentId, winnerThreadId) =>
        set((state) => {
          const experiment = state.experiments[experimentId];
          if (
            !experiment ||
            !experiment.candidates.some((item) => item.threadId === winnerThreadId)
          ) {
            return state;
          }
          return {
            experiments: {
              ...state.experiments,
              [experimentId]: {
                ...experiment,
                winnerThreadId,
                status: "decided",
                updatedAt: new Date().toISOString(),
              },
            },
          };
        }),
      removeExperiment: (experimentId) =>
        set((state) => {
          if (!(experimentId in state.experiments)) return state;
          const { [experimentId]: _removed, ...experiments } = state.experiments;
          return { experiments };
        }),
      removeProjectExperiments: (projectId) =>
        set((state) => {
          const experiments = Object.fromEntries(
            Object.entries(state.experiments).filter(
              ([, experiment]) => experiment.projectId !== projectId,
            ),
          );
          return Object.keys(experiments).length === Object.keys(state.experiments).length
            ? state
            : { experiments };
        }),
      reconcileExperiments: (projectIds) =>
        set((state) => {
          const experiments = Object.fromEntries(
            Object.entries(state.experiments).filter(([, experiment]) =>
              projectIds.has(experiment.projectId),
            ),
          );
          return Object.keys(experiments).length === Object.keys(state.experiments).length
            ? state
            : { experiments };
        }),
    }),
    {
      name: EXPERIMENT_STORE_KEY,
      version: EXPERIMENT_STORE_VERSION,
      storage: createDbStorage(),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as { experiments?: unknown } | undefined;
        return {
          ...currentState,
          experiments: parseExperiments(persisted?.experiments),
        };
      },
      partialize: (state) => ({ experiments: state.experiments }) as ExperimentStore,
    },
  ),
);

export function getRunningExperimentCandidateIds(): Set<string> {
  return new Set(
    Object.values(useExperimentStore.getState().experiments)
      .filter((experiment) => experiment.status === "running")
      .flatMap((experiment) => experiment.candidates.map((candidate) => candidate.threadId)),
  );
}

export function findExperimentByGroupId(groupId: string | undefined): Experiment | undefined {
  if (!groupId) return undefined;
  return useExperimentStore.getState().experiments[groupId];
}

export function findExperimentByThreadId(threadId: string): Experiment | undefined {
  return Object.values(useExperimentStore.getState().experiments).find((experiment) =>
    experiment.candidates.some((candidate) => candidate.threadId === threadId),
  );
}

export function findExperimentByWorktree(
  projectId: string,
  worktreePath: string | undefined,
): Experiment | undefined {
  if (!worktreePath) return undefined;
  return Object.values(useExperimentStore.getState().experiments).find(
    (experiment) =>
      experiment.projectId === projectId &&
      experiment.candidates.some(
        (candidate) =>
          candidate.worktreeState !== "removed" && candidate.worktreePath === worktreePath,
      ),
  );
}
