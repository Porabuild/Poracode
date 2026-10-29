import { z } from "zod";

// A new, negotiated surface. Remote v14 and host-control v2 stay unchanged:
// old descriptor readers strip the optional capability; no strict host flags,
// persisted settings, history, or scopes are changed. Leases never survive a host restart.
// UI attachments now share their selected access mode without an extra agent
// toggle. The v1 agentAccess field is unchanged; explicit legacy "none" remains
// a refusal. The enabled Devices plugin is independently checked on each MCP use.
export const DEVICE_WORKSPACE_VERSION = 1 as const;
export const DEVICE_FRAME_MAX_BYTES = 256 * 1024;
export const DEVICE_LEASE_TTL_MS = 60_000;

const deviceId = z.string().min(1).max(256);
const point = z.number().finite().min(0).max(1);
export const devicePlatformSchema = z.enum(["ios", "android"]);
// Human-only tools v1 is negotiated per running emulator and pinned to its boot.
// Legacy workspace v1 and agent input remain valid; old readers strip controls,
// while old action readers reject the new discriminator before any effect.
export const DEVICE_CONTROLS_VERSION = 1 as const;
export const deviceControlTypeSchema = z.enum([
  "read",
  "appearance",
  "textSize",
  "orientation",
  "reduceMotion",
  "network",
  "location",
  "permission",
  "openUrl",
  "launchApp",
  "powerOff",
]);
export const devicePermissionSchema = z.enum([
  "camera",
  "microphone",
  "photos",
  "contacts",
  "calendar",
  "location",
  "notifications",
  "motion",
]);
export const deviceControlCapabilitiesSchema = z.object({
  version: z.literal(DEVICE_CONTROLS_VERSION),
  bootId: z.uuid(),
  actions: z.array(deviceControlTypeSchema).max(16),
});
const applicationId = z
  .string()
  .min(3)
  .max(255)
  .regex(/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/u);
export const deviceControlSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("read") }),
  z.strictObject({ type: z.literal("appearance"), value: z.enum(["light", "dark"]) }),
  z.strictObject({
    type: z.literal("textSize"),
    value: z.enum(["small", "standard", "large", "extraLarge"]),
  }),
  z.strictObject({
    type: z.literal("orientation"),
    value: z.enum(["portrait", "landscapeLeft", "upsideDown", "landscapeRight"]),
  }),
  z.strictObject({ type: z.literal("reduceMotion"), enabled: z.boolean() }),
  z.strictObject({ type: z.literal("network"), enabled: z.boolean() }),
  z.strictObject({
    type: z.literal("location"),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  }),
  z.strictObject({
    type: z.literal("permission"),
    applicationId,
    permission: devicePermissionSchema,
    decision: z.enum(["grant", "revoke"]),
  }),
  z.strictObject({
    type: z.literal("openUrl"),
    url: z
      .string()
      .min(1)
      .max(4096)
      .regex(
        /^(?!(?:javascript|data|file|content|intent|about):)[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s]+$/iu,
      ),
  }),
  z.strictObject({ type: z.literal("launchApp"), applicationId }),
  z.strictObject({ type: z.literal("powerOff") }),
]);
export type DeviceControl = z.infer<typeof deviceControlSchema>;
export const deviceControlStateSchema = z.object({
  version: z.literal(DEVICE_CONTROLS_VERSION),
  appearance: z.enum(["light", "dark", "system"]).optional(),
  fontScale: z.number().finite().positive().max(10).optional(),
  reduceMotion: z.boolean().optional(),
  networkEnabled: z.boolean().optional(),
});
export type DeviceControlState = z.infer<typeof deviceControlStateSchema>;

export const deviceTargetSchema = z.object({
  id: deviceId,
  platform: devicePlatformSchema,
  name: z.string().max(256),
  state: z.enum(["running", "stopped", "starting"]),
  input: z.boolean(),
  accessibility: z.boolean(),
  controls: deviceControlCapabilitiesSchema.optional(),
});
export type DeviceTarget = z.infer<typeof deviceTargetSchema>;

export const deviceInventorySchema = z.object({
  version: z.literal(DEVICE_WORKSPACE_VERSION),
  generation: z.uuid(),
  platforms: z
    .array(
      z.object({
        platform: devicePlatformSchema,
        status: z.enum([
          "ready",
          "unsupported_host",
          "missing_sdk",
          "missing_xcode",
          "missing_idb",
          "unavailable",
        ]),
        diagnostic: z.string().max(2000).optional(),
      }),
    )
    .max(2),
  devices: z.array(deviceTargetSchema).max(128),
});
export type DeviceInventory = z.infer<typeof deviceInventorySchema>;

export const deviceAttachSchema = z.strictObject({
  version: z.literal(DEVICE_WORKSPACE_VERSION),
  generation: z.uuid(),
  deviceId,
  access: z.enum(["view", "control"]),
  agentAccess: z.enum(["none", "view", "control"]),
});
export type DeviceAttach = z.infer<typeof deviceAttachSchema>;
export const deviceSessionSchema = z.object({
  version: z.literal(DEVICE_WORKSPACE_VERSION),
  generation: z.uuid(),
  id: z.uuid(),
  threadId: z.string().min(1),
  device: deviceTargetSchema,
  access: z.enum(["view", "control"]),
  agentAccess: z.enum(["none", "view", "control"]),
  expiresAt: z.number(),
});
export type DeviceSession = z.infer<typeof deviceSessionSchema>;

export const deviceFrameSchema = z.object({
  version: z.literal(DEVICE_WORKSPACE_VERSION),
  id: z.uuid(),
  capturedAt: z.number(),
  mimeType: z.literal("image/jpeg"),
  base64: z.string().max(Math.ceil(DEVICE_FRAME_MAX_BYTES / 3) * 4),
  width: z.int().positive().max(2048),
  height: z.int().positive().max(2048),
});
export type DeviceFrame = z.infer<typeof deviceFrameSchema>;
export const deviceInspectionSchema = z.object({
  version: z.literal(DEVICE_WORKSPACE_VERSION),
  format: z.enum(["android-uiautomator-xml", "ios-idb-json"]),
  text: z.string().max(128_000),
});
export type DeviceInspection = z.infer<typeof deviceInspectionSchema>;

export const deviceInputSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("tap"), frameId: z.uuid(), x: point, y: point }),
  z.strictObject({
    kind: z.literal("swipe"),
    frameId: z.uuid(),
    x: point,
    y: point,
    endX: point,
    endY: point,
    durationMs: z.int().min(100).max(2000),
  }),
  z.strictObject({ kind: z.literal("text"), text: z.string().min(1).max(2000) }),
  z.strictObject({ kind: z.literal("key"), key: z.enum(["home", "back", "enter", "backspace"]) }),
]);
export type DeviceInput = z.infer<typeof deviceInputSchema>;
export const deviceActionSchema = z.discriminatedUnion("kind", [
  ...deviceInputSchema.options,
  z.strictObject({ kind: z.literal("start") }),
]);
export type DeviceAction = z.infer<typeof deviceActionSchema>;
// Keep deviceActionSchema closed for existing agent grants. Human tools are
// admitted only through the authenticated action route and an advertised boot.
export const deviceHumanActionSchema = z.discriminatedUnion("kind", [
  ...deviceActionSchema.options,
  z.strictObject({
    kind: z.literal("control"),
    version: z.literal(DEVICE_CONTROLS_VERSION),
    control: deviceControlSchema,
  }),
]);
export type DeviceHumanAction = z.infer<typeof deviceHumanActionSchema>;
export const deviceActionResultSchema = z.object({
  version: z.literal(DEVICE_WORKSPACE_VERSION),
  delivered: z.literal(true),
  controls: deviceControlStateSchema.optional(),
});
