import { z } from "zod";
import { devicePlatformSchema } from "./deviceWorkspace";

// Additive, explicitly negotiated live media. Snapshot/action v1, remote14 and
// strict host-control2 stay unchanged; old descriptors strip livePreview.
export const DEVICE_PREVIEW_VERSION = 1 as const;
export const DEVICE_PREVIEW_TICKET_PREFIX = "dwp1_";
export const DEVICE_PREVIEW_TICKET_TTL_MS = 30_000;
export const DEVICE_PREVIEW_MAX_INPUT_BYTES = 64 * 1024;
export const DEVICE_PREVIEW_MAX_PACKET_BYTES = 2 * 1024 * 1024;
export const DEVICE_PREVIEW_MAX_BUFFER_BYTES = 4 * 1024 * 1024;
export const DEVICE_PREVIEW_MAX_QUEUED_PACKETS = 64;
export const devicePreviewCreditSchema = z.strictObject({
  type: z.literal("device-preview-credit"),
  version: z.literal(DEVICE_PREVIEW_VERSION),
  bytes: z.int().min(1).max(DEVICE_PREVIEW_MAX_BUFFER_BYTES),
  packets: z.int().min(1).max(DEVICE_PREVIEW_MAX_QUEUED_PACKETS),
});

// Feature-only control envelope. Upstream video packets are unchanged. The
// epoch prevents delayed input from targeting a replacement/rotated surface.
export const devicePreviewInputSchema = z.strictObject({
  version: z.literal(DEVICE_PREVIEW_VERSION),
  epoch: z.uuid(),
  binary: z.boolean(),
  data: z
    .string()
    .min(1)
    .max(48 * 1024),
});
export const devicePreviewGeometrySchema = z.object({
  type: z.literal("device-preview-geometry"),
  version: z.literal(DEVICE_PREVIEW_VERSION),
  epoch: z.uuid(),
});

export const devicePreviewStartSchema = z.strictObject({
  version: z.literal(DEVICE_PREVIEW_VERSION),
  generation: z.uuid(),
});
export type DevicePreviewStart = z.infer<typeof devicePreviewStartSchema>;

export const devicePreviewSchema = z.object({
  version: z.literal(DEVICE_PREVIEW_VERSION),
  id: z.uuid(),
  generation: z.uuid(),
  sessionId: z.uuid(),
  platform: devicePlatformSchema,
  clientDeviceId: z.string().min(1).max(256),
  access: z.enum(["view", "control"]),
  mode: z.literal("h264"),
  expiresAt: z.number().finite(),
});
export type DevicePreview = z.infer<typeof devicePreviewSchema>;

export const devicePreviewRenewSchema = z.strictObject({
  version: z.literal(DEVICE_PREVIEW_VERSION),
  previewId: z.uuid(),
});
export const devicePreviewChannelSchema = z.enum(["ios", "ios-video", "android"]);
export type DevicePreviewChannel = z.infer<typeof devicePreviewChannelSchema>;
export const devicePreviewTicketRequestSchema = devicePreviewRenewSchema.extend({
  channel: devicePreviewChannelSchema,
});
export type DevicePreviewTicketRequest = z.infer<typeof devicePreviewTicketRequestSchema>;
export const devicePreviewTicketSchema = z.object({
  version: z.literal(DEVICE_PREVIEW_VERSION),
  ticket: z.string().regex(/^dwp1_[A-Za-z0-9_-]{43}$/u),
  expiresAt: z.number().finite(),
});
export type DevicePreviewTicket = z.infer<typeof devicePreviewTicketSchema>;

const previewDimension = z.int().min(1).max(16384);
export const devicePreviewSizeSchema = z.object({
  width: previewDimension,
  height: previewDimension,
});
export const devicePreviewIosApiSchema = z.object({
  device: z.string().min(1).max(256),
  url: z.literal("."),
  proxyHelpers: z.literal(true),
  inputAdmission: z.literal(true),
  streamSettings: z.object({ transport: z.literal("http"), codec: z.literal("h264") }),
});
export const devicePreviewIosConfigSchema = devicePreviewSizeSchema.extend({
  orientation: z
    .enum(["portrait", "landscape_left", "portrait_upside_down", "landscape_right"])
    .optional(),
  inputUnavailable: z.boolean().optional(),
});
export const devicePreviewAndroidApiSchema = z.object({
  size: devicePreviewSizeSchema,
  stream: z.object({ transport: z.literal("websocket") }),
});
export const devicePreviewAndroidDevicesSchema = z.object({
  devices: z.array(z.object({ serial: z.string().min(1).max(256) })).length(1),
  defaultSerial: z.string().min(1).max(256),
});

export const devicePreviewQuerySchema = z.strictObject({
  previewId: z.uuid(),
  device: z.string().min(1).max(256).optional(),
});

export function devicePreviewPath(threadId: string, sessionId: string): string {
  return `/api/threads/${encodeURIComponent(threadId)}/devices/${encodeURIComponent(sessionId)}/preview/v1`;
}
