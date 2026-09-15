import type { SupervisorEvent } from "@/shared/ipc";
import type { BackendRendererStream } from "./BackendRendererStream";
import type { RendererStreamDelivery } from "./supervisorEventRelay";

/**
 * Gate 4 §5.4 (F10): per-renderer congestion isolation for supervisor-event
 * publication.
 *
 * A slow renderer exhausts ONLY its own bounded delivery/recovery budget in
 * {@link BackendRendererStream} (per-client budget doubling to 1 MiB, then a
 * 1013 close with a generation-fenced recovery barrier through the ordered
 * desktop-IPC fallback). Renderer congestion is deliberately NOT forwarded
 * upstream as supervisor-wide output backpressure: that signal makes the
 * supervisor shed rebuildable terminal output at the source for EVERY
 * client, so one stalled window would discard terminal output for healthy
 * windows too.
 *
 * Previous wiring derived `isBackpressured()` — true while ANY ready renderer
 * holds unacknowledged bytes past the high watermark — and forwarded it to
 * `BackendHostCore.setSupervisorOutputBackpressured`, which is exactly the
 * cross-client feedback this lane removes. The per-client bounds stay; only
 * the global feedback is gone. `setSupervisorOutputBackpressured` itself is
 * retained for its genuine owners — nothing here calls it.
 */
export function createRendererEventPublication(deps: {
  /** Current stream; null while the backend host is (re)constructing it. */
  getStream(): Pick<BackendRendererStream, "publish"> | null | undefined;
}): (event: SupervisorEvent) => RendererStreamDelivery | undefined {
  return (event) => deps.getStream()?.publish(event);
}
