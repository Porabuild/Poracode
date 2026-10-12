import { createDevinUsageProfileSource } from "../agents/devin/usageProfiles";
import type { SharedSettings } from "@/shared/settings";
import { createClaudeUsageProfileSource } from "../agents/claude/claudeUsageProfiles";
import { createCodexUsageProfileSource } from "../agents/codex/codexUsageProfiles";
import { createCursorUsageProfileSource } from "../agents/cursor/cursorUsageProfiles";
import type { UsageProfileSource } from "./usageProfileTypes";

/** Declarative provider registrations; the usage service never parses profile config. */
const profileSources: readonly ((settings: SharedSettings) => UsageProfileSource)[] = [
  createClaudeUsageProfileSource,
  createCodexUsageProfileSource,
  createCursorUsageProfileSource,
  createDevinUsageProfileSource,
];

export function readUsageProfileSources(settings: SharedSettings): UsageProfileSource[] {
  return profileSources.map((read) => read(settings));
}
