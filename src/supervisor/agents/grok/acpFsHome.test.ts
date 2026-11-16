import { describe, expect, it, vi } from "vitest";

// `createStructuredSession` would spawn a real `grok agent stdio` process;
// stub the session factory so the test only inspects the options the adapter
// hands the shared ACP session.
vi.mock("../acp", () => {
  const createAcpStructuredSession = vi.fn<(...args: unknown[]) => unknown>(() => undefined);
  // Native launches route through the shared pooled-process factory; delegate
  // to the dedicated mock so the assertions below keep their call shape.
  const createSharedAcpStructuredSession = vi.fn<(...args: unknown[]) => Promise<unknown>>(
    async (command: unknown, input: unknown, _shared: unknown, overrides: unknown) =>
      createAcpStructuredSession(command, input, overrides),
  );
  return {
    createAcpStructuredSession,
    createSharedAcpStructuredSession,
    shutdownSharedAcpProcesses: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
  };
});

import type { ProjectLocation, ThreadConfig } from "@/shared/contracts";
import { createAcpStructuredSession } from "../acp";
import { resolveGrokAcpModel } from "./fastMode";
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
    expect(vi.mocked(createAcpStructuredSession).mock.calls[0]?.[2]).toEqual({
      resolveModelConfig: resolveGrokAcpModel,
    });
  });
});
