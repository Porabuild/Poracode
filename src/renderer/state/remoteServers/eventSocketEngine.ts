import type { ClientEngineHost } from "@/renderer/state/remote/engine";

/**
 * The remote-socket engine is shared by every paired-server session in this
 * window, so exactly ONE overflow listener is registered for the module and
 * the latest session re-points it. A stale session's sink is inert: its
 * handler checks `isCurrent()` before touching any socket. Overflow resets
 * the engine, so every session with an in-flight `decodeRemote` also sees a
 * typed rejection and resyncs through the per-frame catch — the sink only
 * covers overflow with no locally pending decode.
 */
let engineOverflowSink: (() => void) | null = null;
let engineOverflowBoundTo: ClientEngineHost | null = null;

export function bindRemoteEngineOverflowListener(engine: ClientEngineHost, sink: () => void): void {
  engineOverflowSink = sink;
  if (engineOverflowBoundTo === engine) return;
  engineOverflowBoundTo = engine;
  engine.addOverflowListener(() => engineOverflowSink?.());
}
