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
    {
      name: "a fresh GUI thread",
      overrides: { config: { model: "grok-4.6", effort: "xhigh", approvalPolicy: "never" } },
      args: ["--model", "grok-4.6", "acp"],
    },
    {
      name: "an ACP GUI resume after the default switches to SDK",
      args: ["acp"],
      overrides: {
        agentSettings: { structuredRuntime: "sdk" },
        sessionRef: {
          providerSessionId: "existing-acp-session",
          discoveredAt: "2026-09-28T00:00:00.000Z",
        },
      },
    },
  ])(
    "enables parameterized controls for $name through the ACP factory",
    async ({ overrides, args }) => {
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
        expect.objectContaining({ args }),
        input.projectLocation,
        input.threadId,
        expect.objectContaining({ clientCapabilitiesMeta: { parameterizedModelPicker: true } }),
      );
    },
  );

  it.each([
    { sessionRef: undefined, args: ["--model", "grok-4.6", "--force", "acp"] },
    {
      sessionRef: {
        providerSessionId: "existing-acp-crossagent",
        discoveredAt: "2026-09-28T00:00:00.000Z",
      },
      args: ["--force", "acp"],
    },
  ])(
    "uses Cursor's native approval mode for a full-access worker ($args)",
    async ({ sessionRef, args }) => {
      const create = vi
        .spyOn(AcpStructuredSession, "create")
        .mockReturnValue({} as AcpStructuredSession);
      const input: CreateStructuredSessionInput = {
        threadId: "cursor-crossagent",
        projectLocation: { kind: "posix", path: "/repo" },
        presentationMode: "gui",
        fixedApprovalPolicy: true,
        config: { model: "grok-4.6", approvalPolicy: "never" },
        ...(sessionRef ? { sessionRef } : {}),
      };

      await createCursorAdapter().createStructuredSession?.(input);

      expect(create).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ args }),
        input.projectLocation,
        input.threadId,
        expect.objectContaining({ behavior: { disableSyntheticPermissionAutoApproval: true } }),
      );
    },
  );
});
