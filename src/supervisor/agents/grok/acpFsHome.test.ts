import { describe, expect, it, vi } from "vitest";

// `createStructuredSession` would spawn a real `grok agent stdio` process;
// stub the session factory so the test only inspects the options the adapter
// hands the shared ACP session.
vi.mock("../acp", () => ({
  createAcpStructuredSession: vi.fn<() => undefined>(() => undefined),
}));

import type { ProjectLocation, ThreadConfig } from "@/shared/contracts";
import { createAcpStructuredSession } from "../acp";
import { createGrokAdapter } from "./index";

async function createSessionOptions() {
  const adapter = createGrokAdapter();
  await adapter.createStructuredSession?.({
    threadId: "thread-1",
    projectLocation: { kind: "windows", path: "C:\\repo" } as ProjectLocation,
    config: { mode: "agent" } as ThreadConfig,
  });
  return vi.mocked(createAcpStructuredSession).mock.calls[0]?.[1];
}

describe("Grok ACP fs home carve-out", () => {
  it("lets Grok read ~/.grok through the client fs bridge", async () => {
    // Grok ACP loads bundled and user skills (and session files) from
    // ~/.grok via fs/read_text_file. Without the carve-out the shared
    // bridge rejects those paths as outside the project.
    expect(await createSessionOptions()).toMatchObject({ acpFsAgentHomeDirs: [".grok"] });
  });
});
