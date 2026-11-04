import { z } from "zod";

/**
 * Derived Locked Computer Use status (macOS only). Nothing here is stored: the
 * host reads the installed plug-in, the `system.login.screensaver` rule, the
 * installer's state file, and the helper's `locked_use_status` each time.
 */
export const lockedComputerUseStatusSchema = z.object({
  /** macOS host. Everything else is false on other platforms. */
  platformSupported: z.boolean(),
  /** Plug-in bundle, login rule, and state file all present for this user. */
  installed: z.boolean(),
  /** Some but not all of the installed pieces exist; reinstalling repairs it. */
  needsRepair: z.boolean(),
  /** The helper and the app are signed by the same Developer ID team. */
  signed: z.boolean(),
  /** Local input ended a session; paused until the user unlocks manually. */
  paused: z.boolean(),
  /** A locked-use session is running right now. */
  active: z.boolean(),
});
export type LockedComputerUseStatus = z.infer<typeof lockedComputerUseStatusSchema>;

export const UNSUPPORTED_LOCKED_COMPUTER_USE_STATUS: LockedComputerUseStatus = {
  platformSupported: false,
  installed: false,
  needsRepair: false,
  signed: false,
  paused: false,
  active: false,
};

/**
 * Why an install or uninstall did not complete. The installer's exit codes map
 * to `usage` (2), `unsupported_rule` (3), `verification_failed` (4, rolled
 * back), and `not_root` (5); `cancelled` is the administrator prompt being
 * dismissed.
 */
export const LOCKED_COMPUTER_USE_ERROR_CODES = [
  "unsupported_platform",
  "unsigned_build",
  "installer_missing",
  "cancelled",
  "usage",
  "unsupported_rule",
  "verification_failed",
  "not_root",
  "busy",
  "failed",
] as const;
export type LockedComputerUseErrorCode = (typeof LOCKED_COMPUTER_USE_ERROR_CODES)[number];

export const lockedComputerUseActionResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), status: lockedComputerUseStatusSchema }),
  z.object({
    ok: z.literal(false),
    error: z.enum(LOCKED_COMPUTER_USE_ERROR_CODES),
    status: lockedComputerUseStatusSchema,
  }),
]);
export type LockedComputerUseActionResult = z.infer<typeof lockedComputerUseActionResultSchema>;
