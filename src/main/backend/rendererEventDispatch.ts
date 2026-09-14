import type { RendererStreamDeliveryTarget } from "@/shared/backendHostProtocol";
import { isAgentStatusSupervisorEvent, type SupervisorEvent } from "@/shared/ipc";

/** A live recipient resolved for one targeted fallback copy. */
export interface RendererEventDispatchTarget {
  /** Authoritative webContents id of the resolved window. */
  readonly windowId: number;
  /** Sends one envelope to that window. */
  send(event: SupervisorEvent, rendererSequence?: number): void;
}

export interface RendererEventDispatchOptions {
  /** True when `target` addresses a provably stale grant epoch. */
  isStaleDeliveryTarget(target: RendererStreamDeliveryTarget): boolean;
  /** Resolves the exact live window addressed by a target; null when none. */
  resolveTargetWindow(target: RendererStreamDeliveryTarget): RendererEventDispatchTarget | null;
  /** Sends the untargeted shell/legacy envelope to main's own window. */
  sendToShell(event: SupervisorEvent, rendererSequence?: number): void;
  /** Applies main-local native state (sleep blockers) for one event. */
  applyNativeState(event: SupervisorEvent): void;
  /** Forwards a shell agent-status envelope to the quick composer overlay. */
  forwardAgentStatus(event: SupervisorEvent): void;
  /** The quick composer overlay window's webContents id, or null. */
  quickComposerWindowId(): number | null;
}

/**
 * Production dispatcher for supervisor envelopes leaving the backend host.
 *
 * Targeted per-window copies and the sequence-less shell remainder are
 * separate envelopes, so this owns the exactly-once rules that span them:
 *
 * - Native/control state is applied ONLY on the shell/legacy path. Targeted
 *   copies — including the control half a non-shell fallback window keeps, and
 *   especially a stale-generation copy that must apply nothing at all — never
 *   reapply it.
 * - The quick composer overlay consumes agent statuses through exactly ONE
 *   path: the shell forward. While the overlay is a fallback recipient the
 *   planner also targets it a copy of the same control envelope; that copy is
 *   dropped here because the forward already owns that delivery. The two
 *   envelopes are separate messages after IPC serialization, so no main-local
 *   identity can correlate them — instead the path decision is structural. The
 *   forward is never suppressed by a copy (so a dropped or stale copy cannot
 *   lose a status), two identical-payload statuses each deliver because nothing
 *   is deduped, and a directly owned overlay keeps its direct stream (its
 *   transport ignores IPC envelopes while connected). A hidden overlay refetches
 *   on show, exactly as the forward's own visibility gate already documents.
 */
export function createRendererEventDispatcher(
  options: RendererEventDispatchOptions,
): (
  event: SupervisorEvent,
  rendererSequence?: number,
  target?: RendererStreamDeliveryTarget,
) => void {
  return (event, rendererSequence, target) => {
    if (target) {
      // A copy planned for a previous grant epoch (same webContents re-minted
      // by a reload) is stale: drop it instead of applying old-generation data
      // to the window's current identity. Only provably-stale generations are
      // dropped, so an unchanged client never loses a frame to this gate.
      if (options.isStaleDeliveryTarget(target)) return;
      const window = options.resolveTargetWindow(target);
      if (!window) return;
      const quickComposerId = options.quickComposerWindowId();
      if (
        quickComposerId !== null &&
        window.windowId === quickComposerId &&
        isAgentStatusSupervisorEvent(event)
      ) {
        return;
      }
      window.send(event, rendererSequence);
      return;
    }

    options.applyNativeState(event);
    options.sendToShell(event, rendererSequence);
    options.forwardAgentStatus(event);
  };
}
