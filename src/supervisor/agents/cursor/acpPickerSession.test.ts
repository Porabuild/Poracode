import { afterEach, describe, expect, it, vi } from "vitest";
import { AcpStructuredSession } from "../acp/session";
import type { CreateStructuredSessionInput } from "../base";
import { createCursorAdapter } from "./index";

vi.mock("../binaryResolver", () => ({
  resolveAgentBinaryPath: () => "/usr/local/bin/cursor-agent",
}));

describe("Cursor ACP picker session integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    { name: "a fresh GUI thread", overrides: {} },
    {
      name: "an ACP GUI resume after the default switches to SDK",
      overrides: {
        agentSettings: { structuredRuntime: "sdk" },
        sessionRef: {
          providerSessionId: "existing-acp-session",
          discoveredAt: "2026-09-28T00:00:00.000Z",
        },
      },
    },
  ])("enables parameterized controls for $name through the ACP factory", async ({ overrides }) => {
    // Keep the adapter and shared factory real; intercept only the process
    // creation boundary so this regression never launches a provider.
    const session = {} as AcpStructuredSession;
    const create = vi.spyOn(AcpStructuredSession, "create").mockReturnValue(session);
    const input: CreateStructuredSessionInput = {
      threadId: "cursor-picker-thread",
      projectLocation: { kind: "posix", path: "/repo" },
      presentationMode: "gui",
      config: { model: "grok-4.6", effort: "xhigh" },
      ...overrides,
    };

    const result = await createCursorAdapter().createStructuredSession?.(input);

    expect(result).toBe(session);
    expect(create).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ args: ["acp"] }),
      input.projectLocation,
      input.threadId,
      expect.objectContaining({ clientCapabilitiesMeta: { parameterizedModelPicker: true } }),
    );
  });
});
