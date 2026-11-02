import { expect, it } from "vitest";
import { decodeAgentStatusCache } from "@/shared/agentStatusCache";
import { agentCapabilitySchema } from "@/shared/contracts/agent";

it.each(["pi", "pi:custom"])(
  "refreshes unscoped pi capabilities for %s without dropping another provider",
  (kind) => {
    const cached = {
      kind,
      label: "Pi",
      installed: true,
      authState: "authenticated",
      capabilities: agentCapabilitySchema.parse({}),
    };
    const unaffected = { ...cached, kind: "unaffected", label: "Unaffected" };
    const upgraded = decodeAgentStatusCache({
      version: 71,
      windows: [cached, unaffected],
      wsl: [{ ...cached, envKind: "wsl", envDistro: "Ubuntu" }],
    });
    expect(upgraded.statuses).toEqual({ windows: [unaffected], wsl: [], fromCache: false });
    const fresh = decodeAgentStatusCache({ version: 72, windows: [cached, unaffected], wsl: [] });
    expect(fresh.statuses).toEqual({ windows: [cached, unaffected], wsl: [], fromCache: true });
  },
);
