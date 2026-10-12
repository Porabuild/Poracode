import {
  buildReplayableEvent,
  buildRuntimeEvent,
  FIXTURE_TERMINAL_ID,
  FIXTURE_THREAD_ID,
} from "./labFixtures.ts";
import {
  broadcastDesktopEvent,
  broadcastRaw,
  broadcastServer,
  broadcastTerminalOutput,
} from "./labWsRouter.ts";
import { createWireLabRuntime } from "./wireLabRuntime.ts";
import type { EmitRequest } from "./types.ts";
import type { WireLab } from "./wireLab.ts";

/** Deliver one control-plane frame request through the running lab. The
 * desktop-internal stream is admission-gated (loopback-origin upgrade
 * opt-in), so only opted-in sessions may observe that frame; ordinary native
 * sockets never see one. */
export function emitLabRequest(lab: WireLab, request: EmitRequest): void {
  const runtime = createWireLabRuntime(lab);
  switch (request.kind) {
    case "event": {
      const type = request.eventType ?? String(request.event?.type ?? "thread-state");
      const event = request.event ?? buildReplayableEvent(type, request.threadId);
      lab.publishEvent(event);
      return;
    }
    case "runtime": {
      const threadId = request.threadId ?? FIXTURE_THREAD_ID;
      const runtimeEvent = request.runtimeEvent ?? buildRuntimeEvent("content.delta", threadId);
      lab.publishEvent({
        type: "thread-runtime-event",
        threadId,
        event: runtimeEvent,
      });
      return;
    }
    case "terminal-output": {
      broadcastTerminalOutput(
        runtime,
        request.terminalId ?? FIXTURE_TERMINAL_ID,
        request.data ?? "",
      );
      return;
    }
    case "resync-required": {
      broadcastServer(runtime, {
        type: "resync-required",
        seq: lab.ring.seq,
        reason: request.reason ?? "Injected resync.",
      });
      return;
    }
    case "desktop-event": {
      broadcastDesktopEvent(runtime, request.desktopEvent ?? { type: "thread-state" });
      return;
    }
    case "malformed": {
      broadcastRaw(runtime, "{not-json");
      lab.ledger.observeWebSocketServer("malformed");
      return;
    }
    case "unknown": {
      broadcastRaw(runtime, JSON.stringify({ type: "lab-unknown-envelope", payload: {} }));
      lab.ledger.observeWebSocketServer("lab-unknown-envelope");
    }
  }
}
