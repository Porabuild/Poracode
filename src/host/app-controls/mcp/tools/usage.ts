import { z } from "zod";
import type { ProviderUsagePayload } from "@/shared/contracts";
import type { ToolDomain } from "./types";

const getUsageArgsSchema = z.object({
  providerId: z.string().min(1).optional(),
  refresh: z.boolean().optional(),
});

export const usageTools: ToolDomain = {
  specs: [
    {
      name: "get_usage",
      description:
        "Get provider usage/quota snapshots (plan limits, remaining, reset windows). Optionally restrict to one providerId, and set refresh=true to force a live refresh instead of serving the cached snapshot.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          providerId: { type: "string" },
          refresh: { type: "boolean" },
        },
      },
    },
  ],
  handlers: {
    get_usage: async (args, ctx) => {
      const { providerId, refresh } = getUsageArgsSchema.parse(args);
      const payload: ProviderUsagePayload = providerId ? { providerIds: [providerId] } : {};
      const response = refresh
        ? await ctx.supervisor.refreshProviderUsage(payload)
        : await ctx.supervisor.getProviderUsage(payload);
      return {
        fromCache: response.fromCache,
        count: response.snapshots.length,
        snapshots: response.snapshots,
      };
    },
  },
};
