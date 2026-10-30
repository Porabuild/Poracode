/**
 * The effort tiers Claude Code's frontier models accept. Single source of truth
 * shared by the supervisor (capability defaults in `claude/detection.ts`) and
 * the renderer (the profile effort allow-list editor), so adding a tier is a
 * one-line change rather than two hand-synced lists.
 */
export const CLAUDE_EFFORT_TIERS = ["low", "medium", "high", "xHigh", "max"] as const;

export type ClaudeEffortTier = (typeof CLAUDE_EFFORT_TIERS)[number];

/**
 * Claude Code's ultracode is a session flag that runs dynamic workflows at any
 * effort level (`ThreadConfig.workflows`). Older builds stored it as an extra
 * effort tier: thread configs saved `effort: "ultracode"` (run at xhigh), and
 * profile effort lists still use the id to mark which models may enable it.
 */
export const CLAUDE_ULTRACODE_ID = "ultracode";

/** Profile allow-list choices: the effort tiers plus the ultracode permission. */
export const CLAUDE_PROFILE_EFFORT_CHOICES = [...CLAUDE_EFFORT_TIERS, CLAUDE_ULTRACODE_ID] as const;

/**
 * Read a pre-toggle `effort: "ultracode"` selection as xhigh with workflows on,
 * unless a client that does not normalize the effort already turned it off.
 */
export function migrateClaudeUltracodeEffort<
  T extends { effort?: string | undefined; workflows?: boolean | undefined },
>(config: T): T {
  if (config.effort !== CLAUDE_ULTRACODE_ID) return config;
  return { ...config, effort: "xHigh", workflows: config.workflows ?? true };
}
