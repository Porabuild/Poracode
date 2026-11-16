import { z } from "zod";

/**
 * Wire version shared with native/computer-use-helper/src/protocol/version.rs.
 *
 * Version 4 adds Locked Computer Use: the optional `hello.lockedUse` block and
 * the `locked_use_begin` / `locked_use_end` / `locked_use_status` actions. The
 * new hello field is optional, so a version 3 hello still validates; the host
 * still requires an exact version match before it uses the helper at all.
 * Optional dimDisplay is additive within v4 and defaults off in the helper.
 */
export const COMPUTER_USE_HELPER_PROTOCOL_VERSION = 4;

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

/**
 * Locked Computer Use facts the helper reports in `hello` (protocol 4+).
 * `supported` is macOS; `signed` means the helper and its parent process carry
 * the same Developer ID team, which the unlock plug-in requires.
 */
export const computerUseLockedUseHelloSchema = z.object({
  supported: z.boolean(),
  signed: z.boolean(),
  paused: z.boolean(),
  active: z.boolean(),
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
  /**
   * True when the console session's screen is locked. Foreground operations are
   * refused with `screen_locked`; on macOS the desktop also exposes no window
   * content or controls, so captures are blank and the accessibility tree is
   * only an app proxy. Optional so an older helper binary still validates.
   */
  screenLocked: z.boolean().optional(),
  /** Locked Computer Use state. Optional so an older helper binary still validates. */
  lockedUse: computerUseLockedUseHelloSchema.optional(),
  notes: z.array(z.string()),
});

export const COMPUTER_USE_LOCKED_USE_BEGIN_OUTCOMES = [
  "unlocked",
  "not_locked",
  "already_active",
  "paused",
  "unavailable",
  "failed",
] as const;

export const COMPUTER_USE_LOCKED_USE_END_REASONS = [
  "turn_end",
  "disabled",
  "idle",
  "shutdown",
  "host_request",
] as const;

/** `locked_use_begin` input. Overlay strings default to the helper's own copy. */
export const computerUseLockedUseBeginInputSchema = z.object({
  threadId: z.string().min(1),
  overlayTitle: z.string().optional(),
  overlaySubtitle: z.string().optional(),
  /** Additive opt-in; omitted by older hosts means no brightness changes. */
  dimDisplay: z.boolean().optional(),
  maxSessionMs: z.number().int().positive().optional(),
});

/**
 * `locked_use_begin` result. `stage` explains `unavailable` (for example
 * `unsigned_build`, `plugin_not_installed`) and `failed` (for example
 * `guard_failed`, `still_locked`); it stays a free string so a newer helper's
 * stage still parses.
 */
export const computerUseLockedUseBeginResultSchema = z.object({
  outcome: z.enum(COMPUTER_USE_LOCKED_USE_BEGIN_OUTCOMES),
  stage: z.string().optional(),
  approvalId: z.string().optional(),
});

export const computerUseLockedUseEndInputSchema = z.object({
  reason: z.enum(COMPUTER_USE_LOCKED_USE_END_REASONS),
});

export const computerUseLockedUseEndResultSchema = z.object({
  outcome: z.enum(["relocked", "inactive"]),
});

export const computerUseLockedUseStatusSchema = z.object({
  supported: z.boolean(),
  signed: z.boolean(),
  paused: z.boolean(),
  active: z.boolean(),
  screenLocked: z.boolean(),
  lastEnd: z.object({ reason: z.string(), atMs: z.number() }).optional(),
});

export type ComputerUseHelperCapabilities = z.infer<typeof computerUseHelperCapabilitiesSchema>;
export type ComputerUseHelperHello = z.infer<typeof computerUseHelperHelloSchema>;
export type ComputerUseLockedUseBeginOutcome =
  (typeof COMPUTER_USE_LOCKED_USE_BEGIN_OUTCOMES)[number];
export type ComputerUseLockedUseEndReason = (typeof COMPUTER_USE_LOCKED_USE_END_REASONS)[number];
export type ComputerUseLockedUseBeginInput = z.infer<typeof computerUseLockedUseBeginInputSchema>;
export type ComputerUseLockedUseBeginResult = z.infer<typeof computerUseLockedUseBeginResultSchema>;
export type ComputerUseLockedUseEndInput = z.infer<typeof computerUseLockedUseEndInputSchema>;
export type ComputerUseLockedUseEndResult = z.infer<typeof computerUseLockedUseEndResultSchema>;
export type ComputerUseLockedUseStatus = z.infer<typeof computerUseLockedUseStatusSchema>;
