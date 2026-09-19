import { defineRoute } from "../helpers";
import { healthzResponseSchema, metricsResponseSchema } from "../routeSchemas";
import type { RemoteHttpRouteContract } from "../types";

/**
 * Operability routes (V5 plan item 4.9 rider, landed with the Gate 6 TLS/token
 * lane): `/healthz` is the unauthenticated liveness probe load balancers and
 * supervisors poll, and `/metrics` is the minimal host metrics snapshot. Both
 * are registry contracts so route drift stays typecheck-enforced; `/metrics`
 * additionally enforces a loopback-peer gate in its handler (same posture as
 * the dispatcher's Host-header gate, which already ran by the time a handler
 * executes).
 */
export const opsRoutes: readonly RemoteHttpRouteContract[] = [
  defineRoute({
    id: "healthz",
    method: "GET",
    path: "/healthz",
    // Deliberately no auth: a liveness probe carries no credentials. The body
    // is a fixed literal, so nothing about the host is disclosed (unlike the
    // authenticated environment descriptor).
    auth: "public",
    scopes: [],
    request: { bodyKind: "empty" },
    response: {
      wireKind: "json",
      status: 200,
      jsonSchema: healthzResponseSchema,
    },
  }),
  defineRoute({
    id: "metrics",
    method: "GET",
    path: "/metrics",
    // The handler refuses non-loopback peers. Registry auth stays "public"
    // because the gate is transport-level (the socket's remote address), not a
    // bearer decision; scopes remain [] so the loopback probe never needs a
    // token.
    auth: "public",
    scopes: [],
    request: { bodyKind: "empty" },
    response: {
      wireKind: "json",
      status: 200,
      jsonSchema: metricsResponseSchema,
    },
  }),
];
