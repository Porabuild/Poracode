import { describe, expect, it, vi } from "vitest";
import { agentCapabilitySchema } from "./contracts/agent";

// Exercise generic upgrade/publication semantics independently of any vendor.
vi.mock("./agentStatusCacheRegistry", () => ({
  isAgentStatusCacheEntryCompatible: (kind: string, version: number) =>
    kind !== "changed" || version >= 70,
}));

import { decodeAgentStatusCache, STATUS_CACHE_VERSION } from "./agentStatusCache";

function status(kind: string) {
  return {
    kind,
    label: kind,
    installed: true,
    authState: "authenticated",
    capabilities: agentCapabilitySchema.parse({}),
  };
}

describe("agent status cache upgrades", () => {
  it.each([67, 68, 69])(
    "keeps unaffected v%i observations without admitting stale capabilities",
    (version) => {
      const unchanged = status("unchanged");
      const decoded = decodeAgentStatusCache({
        version,
        windows: [unchanged, status("changed")],
        wsl: [{ ...unchanged, envKind: "wsl", envDistro: "Ubuntu" }],
      });
      expect(decoded).toMatchObject({
        state: "available",
        version,
        statuses: {
          windows: [unchanged],
          wsl: [{ ...unchanged, envKind: "wsl", envDistro: "Ubuntu" }],
          fromCache: false,
        },
      });
    },
  );

  it("keeps a complete unchanged older inventory usable", () => {
    expect(
      decodeAgentStatusCache({ version: 69, windows: [status("unchanged")], wsl: [] }).statuses
        .fromCache,
    ).toBe(true);
  });

  it.each([66, STATUS_CACHE_VERSION + 1])(
    "refuses unqualified v%i generations without mutating them",
    (version) => {
      const cache = { version, windows: [status("unchanged")], future: { preserve: true } };
      const original = structuredClone(cache);
      expect(decodeAgentStatusCache(cache)).toMatchObject({
        state: "incompatible",
        version,
        statuses: { windows: [], wsl: [], fromCache: false },
      });
      expect(cache).toEqual(original);
    },
  );
});
