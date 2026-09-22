import {
  ENVIRONMENT_MANAGEMENT_SCOPES,
  ENVIRONMENT_READ_SCOPES,
  ENVIRONMENT_USE_SCOPES,
} from "@/shared/environments";
import { auditEvent, noAudit } from "../../auditKinds";
import {
  remoteEnvironmentAdoptLegacyBodySchema,
  remoteEnvironmentCreateBodySchema,
  remoteEnvironmentExpectedRevisionBodySchema,
  remoteEnvironmentListResultSchema,
  remoteEnvironmentPairingResultSchema,
  remoteEnvironmentResultSchema,
  remoteEnvironmentTrustAcceptBodySchema,
  remoteEnvironmentTrustProbeResultSchema,
  remoteEnvironmentUpdateBodySchema,
} from "../environmentSchemas";
import { defineRoute, remoteOkResponseSchema } from "../helpers";
import type { RemoteHttpRouteContract } from "../types";
import { remoteWebSocketTicketResultSchema } from "../../protocol";

/**
 * C1 management route contracts (ADR §5, amended for the runtime-exposed
 * trust probe/accept and legacy adoption operations).
 *
 * Scopes are the existing protocol-v12 scopes reused exactly as
 * `@/shared/environments` declares them:
 * - read projections: `session:read`;
 * - use (connect/disconnect/pairing/WS ticket): `session:operate` +
 *   `ports:forward`;
 * - manage (create/update/delete/trust/migrate/upgrade): `projects:manage` +
 *   `session:operate` + `ports:forward`.
 *
 * The route ids are the dispatcher handler keys. A host whose composition has
 * no environment runtime must fail these routes closed; the descriptor
 * capability is never advertised for a half-wired host.
 */
export const ENVIRONMENT_MANAGEMENT_ROUTE_IDS = [
  "environment-list",
  "environment-create",
  "environment-get",
  "environment-update",
  "environment-delete",
  "environment-connect",
  "environment-disconnect",
  "environment-pairing",
  "environment-upgrade",
  "environment-websocket-ticket",
  "environment-trust-probe",
  "environment-trust-accept",
  "environment-adopt-legacy",
] as const;

export type EnvironmentManagementRouteId = (typeof ENVIRONMENT_MANAGEMENT_ROUTE_IDS)[number];

export const environmentManagementRoutes: readonly RemoteHttpRouteContract[] = [
  defineRoute({
    id: "environment-list",
    method: "GET",
    path: "/api/environments",
    auth: "bearer",
    scopes: ENVIRONMENT_READ_SCOPES,
    audit: noAudit("read"),
    request: { bodyKind: "empty" },
    response: {
      wireKind: "json",
      status: 200,
      jsonSchema: remoteEnvironmentListResultSchema,
    },
  }),
  defineRoute({
    id: "environment-create",
    method: "POST",
    path: "/api/environments",
    auth: "bearer",
    scopes: ENVIRONMENT_MANAGEMENT_SCOPES,
    audit: auditEvent("mutate"),
    request: { bodyKind: "json", jsonSchema: remoteEnvironmentCreateBodySchema },
    response: {
      wireKind: "json",
      status: 200,
      jsonSchema: remoteEnvironmentResultSchema,
    },
  }),
  defineRoute({
    id: "environment-get",
    method: "GET",
    path: "/api/environments/{environmentId}",
    auth: "bearer",
    scopes: ENVIRONMENT_READ_SCOPES,
    audit: noAudit("read"),
    request: { bodyKind: "empty" },
    response: {
      wireKind: "json",
      status: 200,
      jsonSchema: remoteEnvironmentResultSchema,
    },
  }),
  defineRoute({
    id: "environment-update",
    method: "POST",
    path: "/api/environments/{environmentId}",
    auth: "bearer",
    scopes: ENVIRONMENT_MANAGEMENT_SCOPES,
    audit: auditEvent("mutate"),
    request: { bodyKind: "json", jsonSchema: remoteEnvironmentUpdateBodySchema },
    response: {
      wireKind: "json",
      status: 200,
      jsonSchema: remoteEnvironmentResultSchema,
    },
  }),
  defineRoute({
    id: "environment-delete",
    method: "POST",
    path: "/api/environments/{environmentId}/delete",
    auth: "bearer",
    scopes: ENVIRONMENT_MANAGEMENT_SCOPES,
    audit: auditEvent("mutate"),
    request: { bodyKind: "json", jsonSchema: remoteEnvironmentExpectedRevisionBodySchema },
    response: {
      wireKind: "json",
      status: 200,
      jsonSchema: remoteOkResponseSchema,
    },
  }),
  defineRoute({
    id: "environment-connect",
    method: "POST",
    path: "/api/environments/{environmentId}/connect",
    auth: "bearer",
    scopes: ENVIRONMENT_USE_SCOPES,
    audit: auditEvent("mutate"),
    request: { bodyKind: "empty" },
    response: {
      wireKind: "json",
      status: 200,
      jsonSchema: remoteEnvironmentResultSchema,
    },
  }),
  defineRoute({
    id: "environment-disconnect",
    method: "POST",
    path: "/api/environments/{environmentId}/disconnect",
    auth: "bearer",
    scopes: ENVIRONMENT_USE_SCOPES,
    audit: auditEvent("mutate"),
    request: { bodyKind: "empty" },
    response: {
      wireKind: "json",
      status: 200,
      jsonSchema: remoteEnvironmentResultSchema,
    },
  }),
  defineRoute({
    id: "environment-pairing",
    method: "POST",
    path: "/api/environments/{environmentId}/pairing",
    auth: "bearer",
    scopes: ENVIRONMENT_USE_SCOPES,
    audit: auditEvent("mutate"),
    request: { bodyKind: "empty" },
    response: {
      wireKind: "json",
      status: 200,
      jsonSchema: remoteEnvironmentPairingResultSchema,
    },
  }),
  defineRoute({
    id: "environment-upgrade",
    method: "POST",
    path: "/api/environments/{environmentId}/upgrade",
    auth: "bearer",
    scopes: ENVIRONMENT_MANAGEMENT_SCOPES,
    audit: auditEvent("mutate"),
    request: { bodyKind: "json", jsonSchema: remoteEnvironmentExpectedRevisionBodySchema },
    response: {
      wireKind: "json",
      status: 200,
      jsonSchema: remoteEnvironmentResultSchema,
    },
  }),
  defineRoute({
    id: "environment-websocket-ticket",
    method: "POST",
    path: "/api/environments/{environmentId}/websocket-ticket",
    auth: "bearer",
    scopes: ENVIRONMENT_USE_SCOPES,
    audit: auditEvent("mutate"),
    request: { bodyKind: "empty" },
    response: {
      wireKind: "json",
      status: 200,
      jsonSchema: remoteWebSocketTicketResultSchema,
    },
  }),
  defineRoute({
    id: "environment-trust-probe",
    method: "POST",
    path: "/api/environments/{environmentId}/trust-probe",
    auth: "bearer",
    scopes: ENVIRONMENT_MANAGEMENT_SCOPES,
    audit: auditEvent("mutate"),
    request: { bodyKind: "empty" },
    response: {
      wireKind: "json",
      status: 200,
      jsonSchema: remoteEnvironmentTrustProbeResultSchema,
    },
  }),
  defineRoute({
    id: "environment-trust-accept",
    method: "POST",
    path: "/api/environments/{environmentId}/trust-accept",
    auth: "bearer",
    scopes: ENVIRONMENT_MANAGEMENT_SCOPES,
    audit: auditEvent("mutate"),
    request: { bodyKind: "json", jsonSchema: remoteEnvironmentTrustAcceptBodySchema },
    response: {
      wireKind: "json",
      status: 200,
      jsonSchema: remoteEnvironmentResultSchema,
    },
  }),
  defineRoute({
    id: "environment-adopt-legacy",
    method: "POST",
    path: "/api/environments/{environmentId}/adopt-legacy",
    auth: "bearer",
    scopes: ENVIRONMENT_MANAGEMENT_SCOPES,
    audit: auditEvent("mutate"),
    request: { bodyKind: "json", jsonSchema: remoteEnvironmentAdoptLegacyBodySchema },
    response: {
      wireKind: "json",
      status: 200,
      jsonSchema: remoteEnvironmentResultSchema,
    },
  }),
];
