import { devinUsageProfileSupport } from "./devin/usageProfileSupport";
import { claudeUsageProfileSupport } from "./claude/usageProfileSupport";
import { cursorUsageProfileSupport } from "./cursor/usageProfileSupport";
import type { UsageProfileSupport } from "./usageProfileTypes";

/** Pure registrations keep usage discovery independent of provider UI bootstrap. */
export const USAGE_PROFILE_SUPPORT: readonly UsageProfileSupport[] = [
  claudeUsageProfileSupport,
  cursorUsageProfileSupport,
  devinUsageProfileSupport,
];
