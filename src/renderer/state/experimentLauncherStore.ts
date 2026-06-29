import { create } from "zustand";
import type { PromptSegment, ThreadConfig } from "@/shared/contracts";

interface ExperimentLauncherSeedCandidate {
  agentKind: string;
  config?: ThreadConfig;
  model?: string;
}

interface ExperimentLauncherState {
  open: boolean;
  projectId: string | null;
  initialPrompt: string;
  initialSegments: PromptSegment[];
  initialCandidate: ExperimentLauncherSeedCandidate | null;
  /** Bumped on every open so the modal can remount and re-seed its form. */
  sessionId: number;
  openLauncher: (input: {
    projectId: string;
    prompt?: string;
    segments?: PromptSegment[];
    candidate?: ExperimentLauncherSeedCandidate;
  }) => void;
  close: () => void;
}

export const useExperimentLauncherStore = create<ExperimentLauncherState>((set) => ({
  open: false,
  projectId: null,
  initialPrompt: "",
  initialSegments: [],
  initialCandidate: null,
  sessionId: 0,
  openLauncher: ({ projectId, prompt, segments, candidate }) =>
    set((state) => ({
      open: true,
      projectId,
      initialPrompt: prompt ?? "",
      initialSegments: segments ?? [],
      initialCandidate: candidate ?? null,
      sessionId: state.sessionId + 1,
    })),
  close: () =>
    set({
      open: false,
      projectId: null,
      initialPrompt: "",
      initialSegments: [],
      initialCandidate: null,
    }),
}));
