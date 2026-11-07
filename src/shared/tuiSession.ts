import { z } from "zod";

/**
 * Persisted TUI owner session (`<profile>/tui/session.json`, mode 0600). One
 * dedicated client entry per profile instead of a fresh pairing per launch.
 * Bump TUI_SESSION_VERSION when the persisted shape changes; unknown versions
 * are ignored (the CLI falls back to a fresh pairing) rather than rewritten.
 */
export const TUI_SESSION_VERSION = 1;
export const TUI_SESSION_FILE_NAME = "session.json";
export const TUI_SESSION_LOCK_NAME = "session.lock";
/** Child exit code meaning "saved session rejected — re-pair and relaunch". */
export const TUI_REPAIR_EXIT_CODE = 77;

export const tuiSessionSchema = z.strictObject({
  version: z.literal(TUI_SESSION_VERSION),
  endpoint: z.string().url(),
  // The access-session id from the pairing exchange — the exact entry a fresh
  // re-pair revokes. Absent on sessions persisted before this field existed.
  sessionId: z.string().min(1).optional(),
  certFingerprint: z.string().min(1).optional(),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  refreshExpiresAtMs: z.number().int().positive(),
});
export type TuiSession = z.infer<typeof tuiSessionSchema>;

export function parseTuiSession(value: unknown): TuiSession | undefined {
  const parsed = tuiSessionSchema.safeParse(value);
  if (!parsed.success) return undefined;
  return parsed.data.refreshExpiresAtMs > Date.now() ? parsed.data : undefined;
}
