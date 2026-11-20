import { describe, expect, it } from "vitest";
import { decodeAgentStatusCache, STATUS_CACHE_VERSION } from "@/shared/agentStatusCache";
import { isAgentStatusCacheEntryCompatible } from "@/shared/agentStatusCacheRegistry";
import { modelSelectionFor, capabilitiesForPresentation } from "@/shared/agentSelection";
import { agentCapabilitySchema } from "@/shared/contracts/agent";
import { devinStatusCachePolicy } from "./statusCache";

/**
 * The v73 derivation that failed live: the GUI override declared the
 * negotiated global ladder and no per-model entry for `adaptive`, so the
 * shared fold offered (and defaulted) "medium" for a model whose live
 * session advertises no thought-level select.
 */
const staleAdaptiveCapabilities = agentCapabilitySchema.parse({
  models: [{ id: "adaptive", label: "Adaptive" }],
  efforts: ["none", "minimal", "low", "medium", "high", "xhigh", "max"],
  modelEfforts: { adaptive: [] },
  presentationCapabilities: {
    gui: {
      models: [{ id: "adaptive", label: "Adaptive" }],
      efforts: ["medium", "high", "max"],
      modelEfforts: { "swe-2-high": ["medium", "high", "max"] },
    },
  },
});

const row = (kind: string, extra: Record<string, unknown> = {}) => ({
  kind,
  label: "Devin",
  installed: true,
  authState: "authenticated",
  capabilities: staleAdaptiveCapabilities,
  ...extra,
});

describe("devin status cache policy", () => {
  it("requires account-scoped observations and the earlier model derivations", () => {
    expect(devinStatusCachePolicy).toEqual({ kind: "devin", minimumVersion: 80 });
    // The stale row really did advertise a defaulted "medium" for Adaptive.
    const gui = capabilitiesForPresentation(staleAdaptiveCapabilities, "gui");
    expect(modelSelectionFor(gui, "adaptive").reasoning).toEqual({
      values: ["medium", "high", "max"],
      default: "medium",
    });
  });

  it.each(["devin", "devin:upgrade-profile"])(
    "refreshes v73 %s rows (native and WSL) without dropping another provider",
    (kind) => {
      const native = row(kind);
      const wsl = row(kind, { envKind: "wsl", envDistro: "Ubuntu" });
      const unaffected = { ...native, kind: "unaffected", label: "Unaffected" };
      const stale = decodeAgentStatusCache({
        version: 73,
        windows: [native, unaffected],
        wsl: [wsl],
      });
      expect(stale.state).toBe("available");
      expect(stale.statuses).toEqual({ windows: [unaffected], wsl: [], fromCache: false });
      expect(isAgentStatusCacheEntryCompatible(kind, 73)).toBe(false);
      expect(isAgentStatusCacheEntryCompatible(kind, 74)).toBe(false);
      expect(isAgentStatusCacheEntryCompatible(kind, 75)).toBe(false);
      expect(isAgentStatusCacheEntryCompatible(kind, 80)).toBe(true);
      expect(isAgentStatusCacheEntryCompatible("unaffected", 73)).toBe(true);
    },
  );

  it.each(["devin", "devin:backup"])(
    "refreshes pre-upgrade v79 %s account observations while retaining other providers",
    (kind) => {
      const primaryAccountModels = agentCapabilitySchema.parse({
        models: [{ id: "primary-only", label: "Primary account model" }],
      });
      const native = row(kind, {
        envKind: "windows",
        capabilities: primaryAccountModels,
        authMethods: [{ id: "primary-login", name: "Primary login" }],
      });
      const unaffected = { ...native, kind: "unaffected", label: "Unaffected" };
      const stale = decodeAgentStatusCache({ version: 79, windows: [native, unaffected], wsl: [] });
      expect(stale.statuses).toEqual({ windows: [unaffected], wsl: [], fromCache: false });
      expect(isAgentStatusCacheEntryCompatible(kind, 79)).toBe(false);
      const fresh = decodeAgentStatusCache({
        version: STATUS_CACHE_VERSION,
        windows: [native, unaffected],
        wsl: [],
      });
      expect(fresh.statuses).toEqual({ windows: [native, unaffected], wsl: [], fromCache: true });
    },
  );

  it.each(["devin", "devin:upgrade-profile"])(
    "refreshes v74 %s Fusion rows and preserves current native and WSL observations",
    (kind) => {
      const native = row(kind);
      const wsl = row(kind, { envKind: "wsl", envDistro: "Ubuntu" });
      const unaffected = { ...native, kind: "unaffected", label: "Unaffected" };
      const stale = decodeAgentStatusCache({
        version: 74,
        windows: [native, unaffected],
        wsl: [wsl],
      });
      expect(stale.statuses).toEqual({ windows: [unaffected], wsl: [], fromCache: false });
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
