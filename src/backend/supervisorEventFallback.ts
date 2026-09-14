import type { RendererStreamDeliveryTarget } from "@/shared/backendHostProtocol";
import type { LiveEventInterests } from "@/shared/liveEventInterests";
import { isBulkRuntimeContentEvent } from "@/shared/liveEventInterests";
import type { RuntimeEvent } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import type { RendererStreamFallbackWindow } from "./RendererStreamOwnership";

/**
 * Backend-authoritative desktop fallback plan for one supervisor event.
 *
 * `legacy` reproduces the pre-ownership behavior exactly: the full (filtered)
 * event crosses to main once, carrying its stream sequence, so windows dedupe
 * by sequence as they always have. This is the mode before main's first
 * per-window table push — a stale main that never pushes keeps the legacy
 * full-relay behavior.
 *
 * `targeted` is the steady state: bulk content crosses only as per-window
 * copies addressed to windows that actually need the desktop-IPC fallback and
 * subscribe to the event's threads; the untargeted `shellEvent` carries the
 * control remainder for main's own consumers (sleep state, agent statuses,
 * native events) and NEVER a sequence, so applying it cannot advance any
 * window's cursor past bulk it has not received.
 */
export type DesktopRelayPlan =
  | { mode: "legacy"; shellEvent: SupervisorEvent | null; copies: [] }
  | {
      mode: "targeted";
      /** Per-window fallback copies; the relay sends them before the shell remainder. */
      copies: RendererStreamFallbackCopy[];
      /** Control-only remainder for main's shell consumers, or null. */
      shellEvent: SupervisorEvent | null;
    };

export interface RendererStreamFallbackCopy {
  target: RendererStreamDeliveryTarget;
  /** The event filtered down to what THIS window subscribes to. */
  event: SupervisorEvent;
}

function isBulkRuntimeEvent(event: RuntimeEvent): boolean {
  return isBulkRuntimeContentEvent(event);
}

/**
 * Splits a supervisor event into bulk (renderer-rebuildable stream content)
 * and control (shell/native state) halves. Returns null halves instead of
 * empty envelopes so callers never emit empty batches. Mixed batches split:
 * the control half may still reach main untargeted, while the bulk half can
 * only ever cross as targeted per-window copies. The classifier is the shared
 * `isBulkRuntimeContentEvent` predicate, so renaming an envelope cannot
 * reclassify its content past this boundary.
 */
export function splitSupervisorEvent(event: SupervisorEvent): {
  bulk: SupervisorEvent | null;
  controls: SupervisorEvent | null;
} {
  if (event.type === "thread-output") {
    return event.data.length > 0
      ? { bulk: event, controls: null }
      : { bulk: null, controls: event };
  }
  if (event.type === "thread-runtime-event") {
    return isBulkRuntimeEvent(event.event)
      ? { bulk: event, controls: null }
      : { bulk: null, controls: event };
  }
  if (event.type === "thread-runtime-events") {
    const bulk = event.events.filter(isBulkRuntimeEvent);
    const controls = event.events.filter((entry) => !isBulkRuntimeEvent(entry));
    return {
      bulk: bulk.length > 0 ? { ...event, events: bulk } : null,
      controls: controls.length > 0 ? { ...event, events: controls } : null,
    };
  }
  if (event.type === "thread-runtime-events-multi") {
    const bulkBatches = event.batches
      .map((batch) => ({ ...batch, events: batch.events.filter(isBulkRuntimeEvent) }))
      .filter((batch) => batch.events.length > 0);
    const controlBatches = event.batches
      .map((batch) => ({
        ...batch,
        events: batch.events.filter((entry) => !isBulkRuntimeEvent(entry)),
      }))
      .filter((batch) => batch.events.length > 0);
    return {
      bulk: bulkBatches.length > 0 ? { ...event, batches: bulkBatches } : null,
      controls: controlBatches.length > 0 ? { ...event, batches: controlBatches } : null,
    };
  }
  return { bulk: null, controls: event };
}

/** Every thread the event touches, for bootstrap fail-open augmentation. */
function collectEventThreadIds(event: SupervisorEvent): string[] {
  switch (event.type) {
    case "thread-output":
    case "thread-runtime-event":
    case "thread-runtime-events":
    case "thread-reset":
    case "thread-exited":
      return [event.threadId];
    case "thread-runtime-events-multi":
      return event.batches.map((batch) => batch.threadId);
    default:
      return [];
  }
}

/**
 * Narrows an event to one window's subscription, treating terminal-bootstrap
 * retained threads as wanted (fail-open for the first output of a shell the
 * window is about to attach to). Retention is request-attributed: only the
 * authenticated requesting window is widened — an unrelated fallback window
 * never receives another window's retained bootstrap output. Retention never
 * widens runtime delivery: augmentation only extends terminal thread ids,
 * which the interest filter consults for terminal content exclusively.
 */
export function filterEventForWindow(
  event: SupervisorEvent,
  window: { windowId: number; interests: LiveEventInterests },
  filterForInterests: (
    event: SupervisorEvent,
    interests: LiveEventInterests,
  ) => SupervisorEvent | null,
  isBootstrapRetainedFor: (windowId: number, threadId: string) => boolean,
): SupervisorEvent | null {
  const touchedThreads = collectEventThreadIds(event);
  const bootstrapThreads = touchedThreads.filter((threadId) =>
    isBootstrapRetainedFor(window.windowId, threadId),
  );
  const interests: LiveEventInterests =
    bootstrapThreads.length > 0
      ? {
          terminalThreadIds: [
            ...new Set([...window.interests.terminalThreadIds, ...bootstrapThreads]),
          ],
          runtimeThreadIds: window.interests.runtimeThreadIds,
          allRuntimeEvents: window.interests.allRuntimeEvents,
        }
      : window.interests;
  return filterForInterests(event, interests);
}

export interface DesktopRelayPlannerInput {
  event: SupervisorEvent;
  /** False only before main's first per-window table push (legacy full relay). */
  ownershipArmed: boolean;
  /** Windows currently without a live, acked direct owner. */
  fallbackWindows: readonly RendererStreamFallbackWindow[];
  /**
   * Request-attributed terminal-bootstrap retention: true only for the window
   * whose authenticated start request retained the thread (fail-open interest
   * for its first output). Originless starts widen no window.
   */
  isTerminalBootstrapRetainedFor(windowId: number, threadId: string): boolean;
  /** Narrow an event to a window's own interests (shared interest filter). */
  filterEventForInterests(
    event: SupervisorEvent,
    interests: LiveEventInterests,
  ): SupervisorEvent | null;
  /** The existing union-interest router filter for the shell remainder. */
  filterShellEvent(event: SupervisorEvent): SupervisorEvent | null;
}

/**
 * Decides what crosses backend-to-main for one supervisor event. The event is
 * narrowed per fallback window to what that window subscribes to — a targeted
 * copy carries exactly what the window's own direct stream would have
 * delivered, ordered before the sequence-less shell remainder. The shell
 * remainder holds the split's control half only, so bulk content can cross
 * solely inside targeted copies for windows that need the IPC fallback.
 *
 * The one window that consumes the shell remainder (main's own) receives its
 * controls exactly once through that remainder, so its copy carries the bulk
 * half only; every other fallback window has no other path for controls and
 * keeps them in its copy.
 */
export function planDesktopRelay(input: DesktopRelayPlannerInput): DesktopRelayPlan {
  if (!input.ownershipArmed) {
    return { mode: "legacy", shellEvent: input.filterShellEvent(input.event), copies: [] };
  }
  const { bulk, controls } = splitSupervisorEvent(input.event);
  const copies: RendererStreamFallbackCopy[] = [];
  for (const window of input.fallbackWindows) {
    const source = window.receivesShellRemainder ? bulk : input.event;
    if (!source) continue;
    const filtered = filterEventForWindow(
      source,
      window,
      input.filterEventForInterests,
      input.isTerminalBootstrapRetainedFor,
    );
    if (filtered) {
      copies.push({
        target: { windowId: window.windowId, generation: window.generation },
        event: filtered,
      });
    }
  }
  const shellEvent = controls ? input.filterShellEvent(controls) : null;
  return { mode: "targeted", copies, shellEvent };
}
