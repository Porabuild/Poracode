import type { UsageProfileSupport } from "../usageProfileTypes";
import { parseDevinProfileConfig } from "@/shared/agents/devin/profileConfig";
import { devinUsageAccountId } from "@/shared/agents/devin/usageAccount";

/** One quota tile per login owner; configuration profiles resolve to that tile. */
export const devinUsageProfileSupport: UsageProfileSupport = {
  driver: "devin",
  labelPrefix: "Devin",
  accepts(instance) {
    const parsed = parseDevinProfileConfig(instance.config);
    return parsed.status === "ok" && parsed.config.auth.kind === "isolated-owner";
  },
  providerId: devinUsageAccountId,
};
