import type { UsageProfileSupport } from "../usageProfileTypes";

export const cursorUsageProfileSupport: UsageProfileSupport = {
  driver: "cursor",
  labelPrefix: "Cursor",
  accepts(instance) {
    const apiKey = instance.environment?.CURSOR_API_KEY?.value;
    return typeof apiKey === "string" && apiKey.length > 0;
  },
};
