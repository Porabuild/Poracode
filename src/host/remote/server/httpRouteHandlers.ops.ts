import { RemoteHttpError } from "../auth";
import { writeJson } from "./httpResponses";
import type { HttpRouteHandlerTable } from "./httpRouteHandlers.shared";
import { isDirectLoopbackPeer } from "./security";

/** Operability HTTP route handlers (contract `opsRoutes`). */
export const OPS_ROUTE_HANDLERS: Pick<HttpRouteHandlerTable, "healthz" | "metrics"> = {
  // Operability routes (V5 plan item 4.9 rider). `healthz` discloses a fixed
  // literal only — a liveness probe authenticates nothing and learns nothing.
  healthz: ({ res }) => {
    writeJson(res, 200, { ok: true });
  },

  // `metrics` answers only loopback peers (the minimal posture gate: the
  // dispatcher's Host-header allowlist already ran; this adds the socket's
  // remote-address check). Anything non-loopback is a flat 403 before any
  // metric value is computed.
  metrics: ({ ctx, req, res }) => {
    if (!isDirectLoopbackPeer(req)) {
      throw new RemoteHttpError(
        "metrics_loopback_only",
        "Metrics are only served to loopback clients.",
        403,
      );
    }
    const memory = process.memoryUsage();
    writeJson(res, 200, {
      process: {
        uptimeSeconds: Math.floor(process.uptime()),
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
      },
      remote: {
        activeWebSocketClients: ctx.clients.size,
        eventBufferEntries: ctx.eventBuffer.length,
        lastEventSeq: ctx.seq,
      },
    });
  },
};
