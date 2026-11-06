import { describe, expect, it } from "vitest";
import { decodeAgentStatusCache } from "@/shared/agentStatusCache";
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
  it("requires the v74 effort-less family derivation", () => {
    expect(devinStatusCachePolicy).toEqual({ kind: "devin", minimumVersion: 74 });
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
      expect(isAgentStatusCacheEntryCompatible(kind, 74)).toBe(true);
      expect(isAgentStatusCacheEntryCompatible("unaffected", 73)).toBe(true);
    },
  );
});
