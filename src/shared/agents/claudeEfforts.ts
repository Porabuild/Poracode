/**
 * The effort tiers Claude Code's frontier models accept. Single source of truth
 * shared by the supervisor (capability defaults in `claude/detection.ts`) and
 * the renderer (the profile effort allow-list editor), so adding a tier is a
 * one-line change rather than two hand-synced lists.
 */
export const CLAUDE_EFFORT_TIERS = ["low", "medium", "high", "xHigh", "max", "ultracode"] as const;

export type ClaudeEffortTier = (typeof CLAUDE_EFFORT_TIERS)[number];
