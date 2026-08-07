import { describe, expect, it, vi } from "vitest";

// `createStructuredSession` spawns a real `kimi acp` process; stub the session
// factory (and the trust marker it writes first) so the test only inspects the
// options the adapter hands the shared ACP session.
vi.mock("../acp", () => ({
  createAcpStructuredSession: vi.fn<() => undefined>(() => undefined),
}));
vi.mock("./kimiTrust", () => ({
  ensureKimiWorkspaceTrust: vi.fn<() => Promise<void>>(async () => {}),
}));

import type { ProjectLocation, ThreadConfig } from "@/shared/contracts";
import { createAcpStructuredSession } from "../acp";
import { createKimiAdapter } from "./index";

async function createSessionOptions() {
  const adapter = createKimiAdapter();
  await adapter.createStructuredSession?.({
    threadId: "thread-1",
    projectLocation: { kind: "windows", path: "C:\\repo" } as ProjectLocation,
    config: { mode: "agent" } as ThreadConfig,
  });
  return vi.mocked(createAcpStructuredSession).mock.calls[0]?.[1];
}

describe("Kimi ACP fs capability", () => {
  it("keeps the client fs text capability unadvertised so plan mode works", async () => {
    // Kimi's ACP host filesystem proxies every text read through the client and
    // only recognizes an errno-shaped `ENOENT` as "file missing". Plan mode
    // reads its plan file before creating it, so advertising the capability
    // turned that read into a JSON-RPC error and killed the turn:
    // `EnterPlanMode` failed with `Internal error`, and threads opened in Plan
    // mode returned no response at all.
    expect(await createSessionOptions()).toMatchObject({ acpFsTextCapability: false });
  });

  it("no longer needs the ~/.kimi-code fs carve-out", async () => {
    // The carve-out only existed to let those proxied reads/writes reach Kimi's
    // own home dir. With the capability unadvertised they never leave the agent.
    expect(await createSessionOptions()).not.toHaveProperty("acpFsAgentHomeDirs");
  });
});
