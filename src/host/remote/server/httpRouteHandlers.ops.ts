import { RemoteHttpError } from "../auth";
import { writeJson } from "./httpResponses";
import type { HttpRouteHandlerTable } from "./httpRouteHandlers.shared";
import { isDirectLoopbackPeer, resolvedTrustedProxies } from "./security";

/** Operability HTTP route handlers (contract `opsRoutes`). */
export const OPS_ROUTE_HANDLERS: Pick<HttpRouteHandlerTable, "healthz" | "metrics"> = {
  // Operability routes (V5 plan item 4.9 rider). `healthz` discloses a fixed
  // literal only — a liveness probe authenticates nothing and learns nothing.
  healthz: ({ res }) => {
    writeJson(res, 200, { ok: true });
  },

  // `metrics` answers only loopback peers (the minimal posture gate: the
  // dispatcher's Host-header allowlist already ran; this adds the shared
  // direct-peer locality check — loopback socket with no relay hop marker, no
  // configured trusted-proxy socket, and no proxy-forwarding headers, since a
  // proxied dial arrives from loopback too). Anything not a direct local peer
  // is a flat 403 before any metric value is computed.
  metrics: async ({ ctx, req, res }) => {
    if (!isDirectLoopbackPeer(req, resolvedTrustedProxies(ctx.options))) {
      throw new RemoteHttpError(
        "metrics_loopback_only",
        "Metrics are only served to loopback clients.",
        403,
      );
    }
    const memory = process.memoryUsage();
    // On-demand admission snapshot: read through the supervisor client's
    // bounded existing-IPC peek, which never forks a stopped supervisor. The
    // field is omitted for a cold/unknown/older supervisor so an unavailable
    // count is never fabricated as zero; the usage it carries counts logical
    // supervisor execution slots, not OS processes or RSS.
    const admission = await ctx.options.peekResourceAdmissionStatus?.();
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
      ...(admission?.kind === "available" ? { hostResourceAdmission: admission.status } : {}),
    });
  },
};
