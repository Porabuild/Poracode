import { describe, expect, it } from "vitest";
import { decodeAgentStatusCache, STATUS_CACHE_VERSION } from "@/shared/agentStatusCache";
import { isAgentStatusCacheEntryCompatible } from "@/shared/agentStatusCacheRegistry";
import { agentCapabilitySchema } from "@/shared/contracts/agent";
import { cursorStatusCachePolicy } from "./statusCache";

const row = (kind: string, extra: Record<string, unknown> = {}) => ({
  kind,
  label: "Cursor",
  installed: true,
  authState: "authenticated",
  capabilities: agentCapabilitySchema.parse({
    models: [{ id: "deepseek-v41-flash-1017", label: "DeepSeek V4.1 Flash 1017" }],
    subProviders: [
      { id: "cursor", label: "Cursor Models" },
      { id: "other", label: "Other models" },
    ],
    modelSubProvider: { "deepseek-v41-flash-1017": "cursor" },
  }),
  ...extra,
});

describe("cursor status cache policy", () => {
  it("requires v84 observations so denylist-era sub-provider grouping refreshes", () => {
    expect(cursorStatusCachePolicy).toEqual({ kind: "cursor", minimumVersion: 84 });
  });

  it.each(["cursor", "cursor:work"])(
    "invalidates pre-v84 %s observations without dropping other providers",
    (kind) => {
      const native = row(kind);
      const wsl = row(kind, { envKind: "wsl", envDistro: "Ubuntu" });
      const unaffected = { ...native, kind: "unaffected", label: "Unaffected" };

      const stale = decodeAgentStatusCache({
        version: 83,
        windows: [native, unaffected],
        wsl: [wsl],
      });
      expect(stale.state).toBe("available");
      expect(stale.statuses).toEqual({ windows: [unaffected], wsl: [], fromCache: false });
      expect(isAgentStatusCacheEntryCompatible(kind, 83)).toBe(false);
      expect(isAgentStatusCacheEntryCompatible(kind, 84)).toBe(true);
      expect(isAgentStatusCacheEntryCompatible("unaffected", 83)).toBe(true);

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
