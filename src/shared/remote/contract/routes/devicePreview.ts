import {
  devicePreviewAndroidApiSchema,
  devicePreviewAndroidDevicesSchema,
  devicePreviewIosApiSchema,
  devicePreviewIosConfigSchema,
  devicePreviewQuerySchema,
  devicePreviewRenewSchema,
  devicePreviewSchema,
  devicePreviewStartSchema,
  devicePreviewTicketRequestSchema,
  devicePreviewTicketSchema,
} from "../../../devicePreview";
import { noAudit } from "../../auditKinds";
import { defineRoute, remoteOkResponseSchema } from "../helpers";
import type { RemoteHttpRouteContract } from "../types";

const root = "/api/threads/{threadId}/devices/{sessionId}/preview/v1";

// This is an enumerated facade, not a proxy to the Hub dashboard or its APIs.
// Media is a viewing capability. The separate WS bridge admits typed input
// only against the lease's control consent on each message.
export const devicePreviewRoutes: readonly RemoteHttpRouteContract[] = [
  defineRoute({
    id: "device-preview-open",
    method: "POST",
    path: root,
    auth: "bearer",
    scopes: ["session:read"],
    audit: noAudit("ephemeral device preview"),
    request: { bodyKind: "json", jsonSchema: devicePreviewStartSchema },
    response: { wireKind: "json", status: 200, jsonSchema: devicePreviewSchema },
  }),
  defineRoute({
    id: "device-preview-renew",
    method: "POST",
    path: `${root}/renew`,
    auth: "bearer",
    scopes: ["session:read"],
    audit: noAudit("device preview renewal"),
    request: { bodyKind: "json", jsonSchema: devicePreviewRenewSchema },
    response: { wireKind: "json", status: 200, jsonSchema: devicePreviewSchema },
  }),
  defineRoute({
    id: "device-preview-close",
    method: "POST",
    path: `${root}/close`,
    auth: "bearer",
    scopes: ["session:read"],
    audit: noAudit("owned device preview retirement"),
    request: { bodyKind: "json", jsonSchema: devicePreviewRenewSchema },
    response: { wireKind: "json", status: 200, jsonSchema: remoteOkResponseSchema },
  }),
  defineRoute({
    id: "device-preview-websocket-ticket",
    method: "POST",
    path: `${root}/websocket-ticket`,
    auth: "bearer",
    scopes: ["session:read"],
    audit: noAudit("one-use device preview ticket"),
    request: { bodyKind: "json", jsonSchema: devicePreviewTicketRequestSchema },
    response: { wireKind: "json", status: 200, jsonSchema: devicePreviewTicketSchema },
  }),
  defineRoute({
    id: "device-preview-android-api",
    method: "GET",
    path: `${root}/vendor/serve-emu/api`,
    queryParameters: ["previewId", "device"],
    queryCodecs: [
      { name: "previewId", kind: "string", optional: false, repeated: false },
      { name: "device", kind: "string", optional: true, repeated: false },
    ],
    auth: "bearer",
    scopes: ["session:read"],
    audit: noAudit("bound device video metadata"),
    request: { bodyKind: "empty", querySchema: devicePreviewQuerySchema },
    response: { wireKind: "json", status: 200, jsonSchema: devicePreviewAndroidApiSchema },
  }),
  defineRoute({
    id: "device-preview-android-devices",
    method: "GET",
    path: `${root}/vendor/serve-emu/api/devices`,
    queryParameters: ["previewId", "device"],
    queryCodecs: [
      { name: "previewId", kind: "string", optional: false, repeated: false },
      { name: "device", kind: "string", optional: true, repeated: false },
    ],
    auth: "bearer",
    scopes: ["session:read"],
    audit: noAudit("bound device identity"),
    request: { bodyKind: "empty", querySchema: devicePreviewQuerySchema },
    response: { wireKind: "json", status: 200, jsonSchema: devicePreviewAndroidDevicesSchema },
  }),
  defineRoute({
    id: "device-preview-ios-api",
    method: "GET",
    path: `${root}/vendor/serve-sim/api`,
    queryParameters: ["previewId", "device"],
    queryCodecs: [
      { name: "previewId", kind: "string", optional: false, repeated: false },
      { name: "device", kind: "string", optional: true, repeated: false },
    ],
    auth: "bearer",
    scopes: ["session:read"],
    audit: noAudit("bound simulator preview metadata"),
    request: { bodyKind: "empty", querySchema: devicePreviewQuerySchema },
    response: { wireKind: "json", status: 200, jsonSchema: devicePreviewIosApiSchema },
  }),
  defineRoute({
    id: "device-preview-ios-config",
    method: "GET",
    path: `${root}/vendor/serve-sim/helper/{deviceId}/config`,
    queryParameters: ["previewId", "device"],
    queryCodecs: [
      { name: "previewId", kind: "string", optional: false, repeated: false },
      { name: "device", kind: "string", optional: true, repeated: false },
    ],
    auth: "bearer",
    scopes: ["session:read"],
    audit: noAudit("bound simulator geometry"),
    request: { bodyKind: "empty", querySchema: devicePreviewQuerySchema },
    response: { wireKind: "json", status: 200, jsonSchema: devicePreviewIosConfigSchema },
  }),
  defineRoute({
    id: "device-preview-ios-video",
    method: "GET",
    path: `${root}/vendor/serve-sim/helper/{deviceId}/stream.avcc`,
    queryParameters: ["previewId", "device"],
    queryCodecs: [
      { name: "previewId", kind: "string", optional: false, repeated: false },
      { name: "device", kind: "string", optional: true, repeated: false },
    ],
    auth: "bearer",
    scopes: ["session:read"],
    audit: noAudit("ephemeral simulator video stream"),
    request: { bodyKind: "empty", querySchema: devicePreviewQuerySchema },
    response: { wireKind: "binary", status: 200, contentType: "application/octet-stream" },
  }),
];
