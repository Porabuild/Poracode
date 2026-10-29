import { expect, it } from "vitest";
import { decodeAgentStatusCache } from "@/shared/agentStatusCache";
import { agentCapabilitySchema } from "@/shared/contracts/agent";

it.each(["devin", "devin:upgrade-profile"])(
  "refreshes obsolete devin capabilities for %s without dropping another provider",
  (kind) => {
    const cached = {
      kind,
      label: "Devin",
      installed: true,
      authState: "authenticated",
      capabilities: agentCapabilitySchema.parse({}),
    };
    const unaffected = { ...cached, kind: "unaffected", label: "Unaffected" };
    const upgraded = decodeAgentStatusCache({
      version: 68,
      windows: [cached, unaffected],
      wsl: [],
    });
    expect(upgraded.statuses).toEqual({ windows: [unaffected], wsl: [], fromCache: false });
    const fresh = decodeAgentStatusCache({ version: 70, windows: [cached, unaffected], wsl: [] });
    expect(fresh.statuses).toEqual({ windows: [cached, unaffected], wsl: [], fromCache: true });
  },
);
