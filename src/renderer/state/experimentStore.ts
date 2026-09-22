import { create } from "zustand";
import { useShallow } from "zustand/shallow";
import type { Experiment } from "@/shared/contracts";

/**
 * In-memory projection of the host's canonical experiment store.
 *
 * The durable authority for experiments is the co-located backend host
 * (`GET /api/experiments` + `/api/experiments/{id}/command`, capability
 * `experiments` v1). This store holds a memory-only projection of that state:
 * it NEVER persists through `dbSetState` and never writes a whole-map
 * fallback. (The legacy `dbPersistExperimentState` IPC writer is removed —
 * hop 16.) Every durable change is an explicit host
 * command issued by `rootExperimentAuthority.ts`.
 *
 * The projection is intentionally narrow: `replaceExperiments` installs the
 * canonical host records, `upsertExperiment` installs one confirmed record,
 * and `removeExperiment` drops only a host-confirmed removal. Local optimistic
 * paints (rename) are display-only and are overwritten by the next
 * authoritative projection.
 */

interface ExperimentStore {
  experiments: Record<string, Experiment>;
  addExperiment: (experiment: Experiment) => void;
  upsertExperiment: (experiment: Experiment) => void;
  replaceExperiments: (experiments: Record<string, Experiment>) => void;
  removeExperiment: (experimentId: string) => void;
  removeProjectExperiments: (projectId: string) => void;
}

export const useExperimentStore = create<ExperimentStore>()((set) => ({
  experiments: {},
  addExperiment: (experiment) =>
    set((state) => ({
      experiments: { ...state.experiments, [experiment.id]: experiment },
    })),
  upsertExperiment: (experiment) =>
    set((state) => ({
      experiments: { ...state.experiments, [experiment.id]: experiment },
    })),
  replaceExperiments: (experiments) => set({ experiments }),
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
}));

export function useExperimentCandidateOrder(projectId?: string): ReadonlyMap<string, number> {
  return useExperimentStore(
    useShallow((state) => {
      const order = new Map<string, number>();
      for (const experiment of Object.values(state.experiments)) {
        if (projectId !== undefined && experiment.projectId !== projectId) continue;
        experiment.candidates.forEach((candidate, index) => order.set(candidate.threadId, index));
      }
      return order;
    }),
  );
}

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
