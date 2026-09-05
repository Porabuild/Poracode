import { z } from "zod";

/** Wire version shared with native/computer-use-helper/src/protocol/version.rs. */
export const COMPUTER_USE_HELPER_PROTOCOL_VERSION = 2;

export const computerUsePermissionStateSchema = z.enum([
  "granted",
  "denied",
  "unknown",
  "not_required",
]);

export const computerUseHelperCapabilitiesSchema = z.object({
  backgroundPointer: z.boolean(),
  backgroundKeyboard: z.boolean(),
  backgroundChords: z.boolean(),
  accessibilityTree: z.boolean(),
  elementActions: z.boolean(),
  occludedCapture: z.boolean(),
  foregroundInput: z.boolean(),
  launchApp: z.boolean(),
  stableWindowIds: z.boolean(),
});

export const computerUseHelperHelloSchema = z.object({
  protocolVersion: z.number().int().positive(),
  minClientProtocolVersion: z.number().int().positive(),
  helperVersion: z.string().min(1),
  platform: z.enum(["win32", "darwin", "linux"]),
  arch: z.string().min(1),
  displayServer: z.enum(["x11", "wayland"]).nullable(),
  capabilities: computerUseHelperCapabilitiesSchema,
  permissions: z.object({
    accessibility: computerUsePermissionStateSchema,
    screenRecording: computerUsePermissionStateSchema,
  }),
  notes: z.array(z.string()),
});

export type ComputerUseHelperCapabilities = z.infer<typeof computerUseHelperCapabilitiesSchema>;
export type ComputerUseHelperHello = z.infer<typeof computerUseHelperHelloSchema>;
