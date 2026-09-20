import { type SupervisorEvent } from "@/shared/ipc";

export interface RendererEventDispatchOptions {
  /** Applies main-local native state (sleep blockers) for one event. */
  applyNativeState(event: SupervisorEvent): void;
}

/**
 * Production dispatcher for supervisor envelopes leaving the backend host
 * (V6 B.6): live envelopes no longer cross desktop IPC. Main only applies
 * native sleep-blocker state. Renderer windows observe agent status and
 * thread output over their own loopback HTTP+WS session.
 */
export function createRendererEventDispatcher(
  options: RendererEventDispatchOptions,
): (event: SupervisorEvent, rendererSequence?: number) => void {
  return (event) => {
    options.applyNativeState(event);
  };
}
