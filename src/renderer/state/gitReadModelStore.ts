import { create } from "zustand";
import {
  applyGitStatePatch,
  emptyGitStateSnapshot,
  type GitStatePatch,
  type GitStateSnapshot,
} from "@/shared/gitState";

interface GitReadModelActions {
  replaceSnapshot(snapshot: GitStateSnapshot): void;
  applyPatch(patch: GitStatePatch): void;
  reset(): void;
}

interface GitReadModelRuntimeState {
  /** Distinguishes a modern host's valid revision-0 snapshot from no host model. */
  readonly hostAvailable: boolean;
}

export const useGitReadModelStore = create<
  GitStateSnapshot & GitReadModelRuntimeState & GitReadModelActions
>()((set) => ({
  ...emptyGitStateSnapshot(),
  hostAvailable: false,
  replaceSnapshot: (snapshot) =>
    set((current) =>
      snapshot.revision < current.revision ? current : { ...snapshot, hostAvailable: true },
    ),
  applyPatch: (patch) =>
    set((current) => ({
      ...applyGitStatePatch(current, patch),
      hostAvailable: true,
    })),
  reset: () => set({ ...emptyGitStateSnapshot(), hostAvailable: false }),
}));
