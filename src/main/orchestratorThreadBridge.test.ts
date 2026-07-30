import { describe, expect, it } from "vitest";
import type { StartThreadPayload } from "@/shared/contracts";
import { enforcePersistedThreadLaunchInvariants } from "./orchestratorThreadBridge";

const payload: StartThreadPayload = {
  threadId: "child-thread",
  projectLocation: { kind: "windows", path: "C:\\repo" },
  agentKind: "codex",
  config: { model: "test" },
  prompt: "Inspect this.",
  initialSize: { cols: 120, rows: 40 },
};

describe("enforcePersistedThreadLaunchInvariants", () => {
  it("forces subagent recursion off for a persisted child thread", () => {
    expect(
      enforcePersistedThreadLaunchInvariants(
        { ...payload, invariantDisabledBuiltInMcpServerIds: ["browser"] },
        () => ({ parentThreadId: "parent-thread" }),
      ),
    ).toMatchObject({
      invariantDisabledBuiltInMcpServerIds: ["browser", "subagents"],
    });
  });

  it("leaves non-child launches unchanged", () => {
    expect(enforcePersistedThreadLaunchInvariants(payload, () => ({}))).toBe(payload);
  });
});
