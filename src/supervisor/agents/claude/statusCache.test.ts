import { expect, it } from "vitest";
import { decodeAgentStatusCache } from "@/shared/agentStatusCache";
import { agentCapabilitySchema } from "@/shared/contracts/agent";

it.each(["claude", "claude:upgrade-profile"])(
  "refreshes obsolete claude capabilities for %s without dropping another provider",
  (kind) => {
    const cached = {
      kind,
      label: "Claude Code",
      installed: true,
      authState: "authenticated",
      capabilities: agentCapabilitySchema.parse({}),
    };
    const unaffected = { ...cached, kind: "unaffected", label: "Unaffected" };
    // v82 published no working window for a profile's `[1m]` picker model.
    const upgraded = decodeAgentStatusCache({
      version: 82,
      windows: [cached, unaffected],
      wsl: [],
    });
    expect(upgraded.statuses).toEqual({ windows: [unaffected], wsl: [], fromCache: false });
    const fresh = decodeAgentStatusCache({ version: 83, windows: [cached, unaffected], wsl: [] });
    expect(fresh.statuses).toEqual({ windows: [cached, unaffected], wsl: [], fromCache: true });
  },
);
