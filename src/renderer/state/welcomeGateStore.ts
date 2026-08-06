import { create } from "zustand";
import { readStoredBoolean } from "@/renderer/utils/localStorage";

/**
 * localStorage flag set once the user has seen (and dismissed) the first-launch
 * welcome overlay. Owned here so the overlay and this background-work gate read
 * a single shared key.
 */
export const WELCOME_SEEN_STORAGE_KEY = "poracode-welcome-seen-v16";

/**
 * Manual isolated test launches should reach the requested surface immediately,
 * without first painting the onboarding overlay. Keep this dev-only so a build
 * environment can never suppress the real first-launch experience.
 */
export function isWelcomeSeen(): boolean {
  const skipForTesting = import.meta.env.DEV && import.meta.env.VITE_PORACODE_SKIP_WELCOME === "1";
  return skipForTesting || readStoredBoolean(WELCOME_SEEN_STORAGE_KEY, false);
}

interface WelcomeGateStore {
  /**
   * True once it is safe to start deferred first-launch background work — most
   * importantly the agent-detection sweep kicked off by `getAgentStatuses`,
   * whose cold process spawns and `agent-detected` re-render churn would
   * otherwise starve the welcome animation's first paint and make it snap
   * straight to its final frame.
   *
   * Seeded through {@link isWelcomeSeen} so returning users and isolated manual
   * test launches are released on the very first render and never delayed. On a
   * genuine first launch it starts `false`; the welcome overlay flips it once
   * the intro animation has settled or the user dismisses it.
   */
  backgroundWorkReleased: boolean;
  releaseBackgroundWork: () => void;
}

export const useWelcomeGateStore = create<WelcomeGateStore>((set) => ({
  backgroundWorkReleased: isWelcomeSeen(),
  releaseBackgroundWork: () =>
    set((prev) => (prev.backgroundWorkReleased ? prev : { backgroundWorkReleased: true })),
}));
