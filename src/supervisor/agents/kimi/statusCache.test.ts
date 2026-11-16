import { expect, it } from "vitest";
import { z } from "zod";
import { decodeAgentStatusCache } from "@/shared/agentStatusCache";
import { agentCapabilitySchema } from "@/shared/contracts/agent";

it.each(["kimi", "kimi:external-profile"])(
  "refreshes obsolete Kimi capabilities for %s without dropping another provider",
  (kind) => {
    const cached = {
      kind,
      label: "Kimi Code",
      installed: true,
      authState: "authenticated",
      capabilities: agentCapabilitySchema.parse({}),
    };
    const unaffected = { ...cached, kind: "unaffected", label: "Unaffected" };
    const upgraded = decodeAgentStatusCache({
      version: 78,
      windows: [cached, unaffected],
      wsl: [{ ...cached, envKind: "wsl", envDistro: "Ubuntu" }],
    });
    expect(upgraded.statuses).toEqual({ windows: [unaffected], wsl: [], fromCache: false });
    const fresh = decodeAgentStatusCache({ version: 79, windows: [cached, unaffected], wsl: [] });
    expect(fresh.statuses).toEqual({ windows: [cached, unaffected], wsl: [], fromCache: true });
  },
);

it("keeps the optional bypass preference compatible with the previous capability shape", () => {
  const previous = agentCapabilitySchema.extend({
    bypassPermissions: z
      .object({ approvalPolicy: z.string().optional(), sandboxMode: z.string().optional() })
      .optional(),
  });
  const newCapability = agentCapabilitySchema.parse({
    bypassPermissions: { approvalPolicy: "auto", preferDeclaredApprovalPolicy: true },
  });
  expect(previous.parse(newCapability).bypassPermissions).toEqual({ approvalPolicy: "auto" });
  const previousCapability = previous.parse({ bypassPermissions: { approvalPolicy: "yolo" } });
  expect(agentCapabilitySchema.parse(previousCapability).bypassPermissions).toEqual({
    approvalPolicy: "yolo",
  });
});
