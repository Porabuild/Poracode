import { describe, expect, it } from "vitest";
import { decodeAgentStatusCache, STATUS_CACHE_VERSION } from "@/shared/agentStatusCache";
import { isAgentStatusCacheEntryCompatible } from "@/shared/agentStatusCacheRegistry";
import { agentCapabilitySchema } from "@/shared/contracts/agent";
import { geminiStatusCachePolicy } from "./statusCache";

const row = (kind: string, extra: Record<string, unknown> = {}) => ({
  kind,
  label: "Gemini",
  installed: true,
  authState: "missing",
  capabilities: agentCapabilitySchema.parse({ models: [] }),
  ...extra,
});

describe("gemini status cache policy", () => {
  it("requires v81 observations so stale empty-capability / unprobed API-key rows refresh", () => {
    expect(geminiStatusCachePolicy).toEqual({ kind: "gemini", minimumVersion: 81 });
  });

  it.each(["gemini", "gemini:work"])(
    "invalidates pre-v81 %s observations without dropping other providers",
    (kind) => {
      const native = row(kind);
      const wsl = row(kind, { envKind: "wsl", envDistro: "Ubuntu" });
      const unaffected = { ...native, kind: "unaffected", label: "Unaffected" };

      const stale = decodeAgentStatusCache({
        version: 80,
        windows: [native, unaffected],
        wsl: [wsl],
      });
      expect(stale.state).toBe("available");
      expect(stale.statuses).toEqual({ windows: [unaffected], wsl: [], fromCache: false });
      expect(isAgentStatusCacheEntryCompatible(kind, 80)).toBe(false);
      expect(isAgentStatusCacheEntryCompatible(kind, 81)).toBe(true);
      expect(isAgentStatusCacheEntryCompatible("unaffected", 80)).toBe(true);

      const fresh = decodeAgentStatusCache({
        version: STATUS_CACHE_VERSION,
        windows: [native, unaffected],
        wsl: [wsl],
      });
      expect(fresh.statuses).toEqual({
        windows: [native, unaffected],
        wsl: [wsl],
        fromCache: true,
      });
    },
  );
});
