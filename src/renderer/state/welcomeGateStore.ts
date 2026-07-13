import { create } from "zustand";
import { readStoredBoolean } from "@/renderer/utils/localStorage";

/**
 * localStorage flag set once the user has seen (and dismissed) the first-launch
 * welcome overlay. Owned here so the overlay and this background-work gate read
 * a single shared key.
 */
export const WELCOME_SEEN_STORAGE_KEY = "poracode-welcome-seen-v16";

interface WelcomeGateStore {
  /**
   * True once it is safe to start deferred first-launch background work — most
   * importantly the agent-detection sweep kicked off by `getAgentStatuses`,
   * whose cold process spawns and `agent-detected` re-render churn would
   * otherwise starve the welcome animation's first paint and make it snap
   * straight to its final frame.
   *
   * Seeded from {@link WELCOME_SEEN_STORAGE_KEY} so returning users (who never
   * see the welcome overlay) are released on the very first render and never
   * delayed. On a genuine first launch it starts `false`; the welcome overlay
   * flips it once the intro animation has settled or the user dismisses it.
   */
  backgroundWorkReleased: boolean;
  releaseBackgroundWork: () => void;
}

export const useWelcomeGateStore = create<WelcomeGateStore>((set) => ({
  backgroundWorkReleased: readStoredBoolean(WELCOME_SEEN_STORAGE_KEY, false),
  releaseBackgroundWork: () =>
    set((prev) => (prev.backgroundWorkReleased ? prev : { backgroundWorkReleased: true })),
}));
