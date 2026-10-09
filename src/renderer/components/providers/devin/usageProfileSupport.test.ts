// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { AgentInstanceConfig } from "@/shared/contracts";
import { devinUsageProfileSupport } from "./usageProfileSupport";

describe("devinUsageProfileSupport", () => {
  it("shows only usable account owners as extra quota tiles", () => {
    const usable = {
      id: "work",
      driver: "devin",
      config: { format: 1, auth: { kind: "isolated-owner" } },
    } as AgentInstanceConfig;
    const future = {
      id: "future",
      driver: "devin",
      config: { format: 3 },
    } as AgentInstanceConfig;
    const empty = { id: "plain", driver: "devin" } as AgentInstanceConfig;
    expect(devinUsageProfileSupport.driver).toBe("devin");
    expect(devinUsageProfileSupport.accepts(usable)).toBe(true);
    expect(devinUsageProfileSupport.accepts(empty)).toBe(false);
    expect(devinUsageProfileSupport.accepts(future)).toBe(false);
  });
});
