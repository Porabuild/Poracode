import type { Experiment, ExperimentCandidate, ExperimentCrown } from "@/shared/contracts";
import type { SliceCreator } from "./shared";

export interface ExperimentSlice {
  /** Experiment records keyed by experiment id (== the candidate threads' groupId). */
  experiments: Record<string, Experiment>;
  createExperimentRecord: (input: {
    id: string;
    projectId: string;
    title: string;
    prompt: string;
    baseBranch?: string;
    candidates: ExperimentCandidate[];
  }) => void;
  setExperimentCrown: (experimentId: string, crown: ExperimentCrown | undefined) => void;
  setExperimentWinner: (experimentId: string, winnerThreadId: string) => void;
  removeExperiment: (experimentId: string) => void;
}

export const createExperimentSlice: SliceCreator<ExperimentSlice> = (set) => ({
  experiments: {},
  createExperimentRecord: ({ id, projectId, title, prompt, baseBranch, candidates }) =>
    set((state) => {
      const now = new Date().toISOString();
      const experiment: Experiment = {
        id,
        projectId,
        title,
        prompt,
        ...(baseBranch ? { baseBranch } : {}),
        candidates,
        status: "running",
        createdAt: now,
        updatedAt: now,
      };
      return { experiments: { ...state.experiments, [id]: experiment } };
    }),
  setExperimentCrown: (experimentId, crown) =>
    set((state) => {
      const existing = state.experiments[experimentId];
      if (!existing) return {};
      const updatedAt = new Date().toISOString();
      const { crown: _removedCrown, ...withoutCrown } = existing;
      const nextExperiment = crown
        ? { ...existing, crown, updatedAt }
        : { ...withoutCrown, updatedAt };
      return {
        experiments: {
          ...state.experiments,
          [experimentId]: nextExperiment,
        },
      };
    }),
  setExperimentWinner: (experimentId, winnerThreadId) =>
    set((state) => {
      const existing = state.experiments[experimentId];
      if (!existing) return {};
      return {
        experiments: {
          ...state.experiments,
          [experimentId]: {
            ...existing,
            winnerThreadId,
            status: "decided",
            updatedAt: new Date().toISOString(),
          },
        },
      };
    }),
  removeExperiment: (experimentId) =>
    set((state) => {
      if (!(experimentId in state.experiments)) return {};
      const { [experimentId]: _removed, ...experiments } = state.experiments;
      const { [experimentId]: _removedLayout, ...groupLayouts } = state.groupLayouts;
      return {
        experiments,
        groupLayouts,
        ...(state.view.kind === "experiment" && state.view.experimentId === experimentId
          ? { view: { kind: "home" as const } }
          : {}),
      };
    }),
});
