/**
 * Stable ids for features the news line can promote to people who have not
 * tried them. The same ids appear in `changelog.json` (`feature` on a change)
 * and in the remote news feed (`unlessUsed`, `onlyIfUsed`, feature actions),
 * so never rename or reuse one — add a new id instead. Older apps ignore ids
 * they do not know.
 */
export const DISCOVERABLE_FEATURE_IDS = [
  "crews",
  "chrome-extension",
  "computer-use",
  "browser",
  "crossagents",
  "worktrees",
  "schedules",
  "pull-requests",
  "skills",
  "mcp-servers",
  "plugins",
  "custom-themes",
  "remote-access",
  "session-import",
  "workspaces",
  "ai-git",
  "voice-input",
] as const;

export type DiscoverableFeatureId = (typeof DISCOVERABLE_FEATURE_IDS)[number];

export function isDiscoverableFeatureId(value: string): value is DiscoverableFeatureId {
  return (DISCOVERABLE_FEATURE_IDS as readonly string[]).includes(value);
}

/**
 * Generic, device-local "seen or used" signals recorded as the user moves
 * around the app, so most features need no bespoke detection:
 * `settings:<section>`, `view:<app view kind>`, `panel:<right panel tab>`,
 * and `command:<command id>`.
 */
export type FeatureSignal =
  | `settings:${string}`
  | `view:${string}`
  | `panel:${string}`
  | `command:${string}`;

/**
 * Commands whose use feature discovery reads. Only these record a `command:`
 * signal, so open-ended ids (project scripts, chat slash commands) never fill
 * or evict the device-local signal store.
 */
export const TRACKED_COMMAND_IDS = [
  "browser.toggle",
  "git.open",
  "composer.start-dictation",
] as const;

export function isTrackedFeatureSignal(signal: FeatureSignal): boolean {
  if (!signal.startsWith("command:")) return true;
  return (TRACKED_COMMAND_IDS as readonly string[]).includes(signal.slice("command:".length));
}
