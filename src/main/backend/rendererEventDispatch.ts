import { isAgentStatusSupervisorEvent, type SupervisorEvent } from "@/shared/ipc";

export interface RendererEventDispatchOptions {
  /** Sends the sequenced desktop event to main's own window. */
  sendToShell(event: SupervisorEvent, rendererSequence?: number): void;
  /** Applies main-local native state (sleep blockers) for one event. */
  applyNativeState(event: SupervisorEvent): void;
  /** Forwards an agent-status envelope to the quick composer overlay. */
  forwardAgentStatus(event: SupervisorEvent): void;
}

/**
 * Production dispatcher for supervisor envelopes leaving the backend host
 * (V5 plan 2.5): every event crosses the desktop-IPC channel once, untargeted
 * and sequenced. Main applies its own native state, relays the event to its
 * window, and keeps the quick composer overlay's agent statuses on the single
 * shell-forward delivery path (a hidden overlay refetches on show).
 */
export function createRendererEventDispatcher(
  options: RendererEventDispatchOptions,
): (event: SupervisorEvent, rendererSequence?: number) => void {
  return (event, rendererSequence) => {
    options.applyNativeState(event);
    options.sendToShell(event, rendererSequence);
    if (isAgentStatusSupervisorEvent(event)) options.forwardAgentStatus(event);
  };
}
