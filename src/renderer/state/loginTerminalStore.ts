import { create } from "zustand";
import type { ProjectLocation } from "@/shared/contracts";

/**
 * One-shot login terminal session. Owned by `runAgentLoginCommand`,
 * rendered by `<LoginTerminalOverlay />`. The overlay slides over any
 * existing overlay (e.g. Settings) so the user can complete a TUI auth
 * flow without losing their place.
 *
 * `onForceClose` fires when the user dismisses the overlay before the
 * command's own exit (X button / Escape). Callers use it to clear
 * pending-state UI even when no exit code arrives.
 */
export interface LoginTerminalSession {
  shellId: string;
  label: string;
  projectLocation: ProjectLocation;
  /** Drives the overlay header copy. Defaults to "login". */
  purpose?: "login" | "install";
  onForceClose?: () => void;
  /** Set when the command exits non-zero so the overlay can render a failed state. */
  failedExitCode?: number;
}

interface LoginTerminalState {
  active: LoginTerminalSession | null;
  open: (session: LoginTerminalSession) => void;
  close: () => void;
  markFailed: (shellId: string, exitCode: number) => void;
}

export const useLoginTerminalStore = create<LoginTerminalState>((set) => ({
  active: null,
  open: (session) => set({ active: session }),
  close: () => set((state) => (state.active === null ? {} : { active: null })),
  markFailed: (shellId, exitCode) =>
    set((state) =>
      state.active && state.active.shellId === shellId
        ? { active: { ...state.active, failedExitCode: exitCode } }
        : state,
    ),
}));
