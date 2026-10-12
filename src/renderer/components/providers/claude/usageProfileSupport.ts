import { baseAgentKind, parseClaudeProfileInstanceConfig } from "@/shared/contracts";
import type { UsageProfileSupport } from "../usageProfileTypes";

export const claudeUsageProfileSupport: UsageProfileSupport = {
  driver: "claude",
  labelPrefix: "Claude",
  accepts(instance) {
    try {
      parseClaudeProfileInstanceConfig(instance.config);
      return true;
    } catch {
      return false;
    }
  },
};

export function isClaudeUsageProvider(providerId: string): boolean {
  return baseAgentKind(providerId) === "claude";
}
