import { createHash } from "node:crypto";
import { collectMuse, MUSE_PROVIDER_ID } from "@poracode/agents-usage";
import type { UsageProfileSource } from "../../runtime/usageProfileTypes";

/** Browser login, logout and team selection retire quota from the previous source. */
export function createMuseUsageProfileSource(): UsageProfileSource {
  return {
    collectors: [
      {
        providerId: MUSE_PROVIDER_ID,
        collect: collectMuse,
        cacheIdentity: async (host) => {
          const cookie =
            (await host.credentials.getSecret(MUSE_PROVIDER_ID, "cookie"))?.trim() ?? "";
          const teamId = cookie
            ? ((await host.credentials.getSecret(MUSE_PROVIDER_ID, "teamId"))?.trim() ?? "")
            : "";
          // Custody checks must never read CLI credentials or persist a browser secret.
          return createHash("sha256").update(JSON.stringify({ cookie, teamId })).digest("hex");
        },
      },
    ],
  };
}
