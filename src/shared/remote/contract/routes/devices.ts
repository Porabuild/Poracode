import {
  deviceActionResultSchema,
  deviceHumanActionSchema,
  deviceAttachSchema,
  deviceFrameSchema,
  deviceInspectionSchema,
  deviceInventorySchema,
  deviceSessionSchema,
} from "../../../deviceWorkspace";
import { auditEvent, noAudit } from "../../auditKinds";
import { defineRoute, remoteOkResponseSchema } from "../helpers";
import type { RemoteHttpRouteContract } from "../types";

// No new implicit scopes: viewers may attach/read/detach; control grants and
// actions additionally require session:operate at the host, before any effect.
export const deviceRoutes: readonly RemoteHttpRouteContract[] = [
  defineRoute({
    id: "device-inventory",
    method: "GET",
    path: "/api/devices",
    auth: "bearer",
    scopes: ["session:read"],
    audit: noAudit("device inventory"),
    request: { bodyKind: "empty" },
    response: { wireKind: "json", status: 200, jsonSchema: deviceInventorySchema },
  }),
  defineRoute({
    id: "device-attach",
    method: "POST",
    path: "/api/threads/{threadId}/devices",
    auth: "bearer",
    scopes: ["session:read"],
    audit: auditEvent("mutate"),
    request: { bodyKind: "json", jsonSchema: deviceAttachSchema },
    response: { wireKind: "json", status: 200, jsonSchema: deviceSessionSchema },
  }),
  defineRoute({
    id: "device-frame",
    method: "GET",
    path: "/api/threads/{threadId}/devices/{sessionId}/frame",
    auth: "bearer",
    scopes: ["session:read"],
    audit: noAudit("ephemeral device frame"),
    request: { bodyKind: "empty" },
    response: { wireKind: "json", status: 200, jsonSchema: deviceFrameSchema },
  }),
  defineRoute({
    id: "device-inspect",
    method: "GET",
    path: "/api/threads/{threadId}/devices/{sessionId}/accessibility",
    auth: "bearer",
    scopes: ["session:read"],
    audit: noAudit("ephemeral device accessibility"),
    request: { bodyKind: "empty" },
    response: { wireKind: "json", status: 200, jsonSchema: deviceInspectionSchema },
  }),
  defineRoute({
    id: "device-action",
    method: "POST",
    requiresCurrentProtocol: true,
    path: "/api/threads/{threadId}/devices/{sessionId}/actions",
    auth: "bearer",
    scopes: ["session:operate"],
    audit: auditEvent("mutate"),
    request: { bodyKind: "json", jsonSchema: deviceHumanActionSchema },
    response: { wireKind: "json", status: 200, jsonSchema: deviceActionResultSchema },
  }),
  defineRoute({
    id: "device-detach",
    method: "POST",
    path: "/api/threads/{threadId}/devices/{sessionId}/detach",
    auth: "bearer",
    scopes: ["session:read"],
    audit: auditEvent("mutate"),
    request: { bodyKind: "empty" },
    response: { wireKind: "json", status: 200, jsonSchema: remoteOkResponseSchema },
  }),
];
