import { z } from "zod";

/**
 * Forge-side changes the host observed an agent make: a successful `git push`,
 * a pull/merge request command (`gh pr`, `glab mr`, `tea pr`, `az repos pr`, ...),
 * or a forge MCP tool such as `create_pull_request`.
 */
export const FORGE_ACTIVITY_ACTIONS = [
  "push",
  "create",
  "update",
  "ready",
  "draft",
  "merge",
  "auto-merge",
  "close",
  "reopen",
  "review",
  "comment",
] as const;
export type ForgeActivityAction = (typeof FORGE_ACTIVITY_ACTIONS)[number];

/**
 * Out-of-band host broadcast: an agent in `threadId` just changed forge state
 * for its checkout. It is only a trigger; clients re-read the pull request
 * through their normal forge lookup, which stays the source of truth.
 *
 * Compatibility: additive event type on the existing event stream, no version
 * bump. Older clients drop unknown event types before any effect (renderer
 * `filterRemoteThreadEvents`, native event decoders) and keep their polling
 * fallback; older hosts never send it. `action` is a bounded string, not an
 * enum, so a newer host can add actions without older clients rejecting the
 * whole event.
 */
export const remoteForgeActivityEventSchema = z.object({
  type: z.literal("remote-forge-activity"),
  projectId: z.string().min(1),
  threadId: z.string().min(1),
  /** The thread's worktree checkout; absent for the project's main checkout. */
  worktreePath: z.string().min(1).optional(),
  /** Head branch the activity concerns, when known. */
  branch: z.string().min(1).optional(),
  action: z.string().min(1).max(64),
});
export type RemoteForgeActivityEvent = z.infer<typeof remoteForgeActivityEventSchema>;
