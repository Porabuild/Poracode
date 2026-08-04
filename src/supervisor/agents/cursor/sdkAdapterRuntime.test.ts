import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateStructuredSessionInput, StructuredSessionHandle } from "../base";

const mocks = vi.hoisted(() => ({
  createAcpStructuredSession: vi.fn<(...args: unknown[]) => StructuredSessionHandle>(),
  createSdkSession:
    vi.fn<(input: CreateStructuredSessionInput) => Promise<StructuredSessionHandle>>(),
}));

vi.mock("../acp", async (importActual) => {
  const actual = await importActual<typeof import("../acp")>();
  return {
    ...actual,
    createAcpStructuredSession: mocks.createAcpStructuredSession,
  };
});

vi.mock("./sdkSession", () => ({
  CursorSdkSession: { create: mocks.createSdkSession },
}));

vi.mock("../binaryResolver", () => ({
  resolveAgentBinaryPath: () => "/usr/local/bin/cursor-agent",
}));

vi.mock("../base/processRuntime", async (importActual) => {
  const actual = await importActual<typeof import("../base/processRuntime")>();
  return { ...actual, resolveWslShellPath: () => "/bin/bash" };
});

import { createCursorAdapter } from "./index";

function session(name: string): StructuredSessionHandle {
  return {
    launchOptions: {},
    setListener: () => undefined,
    dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    [Symbol.for("testName")]: name,
  } as unknown as StructuredSessionHandle;
}

function input(
  overrides: Partial<CreateStructuredSessionInput> = {},
): CreateStructuredSessionInput {
  return {
    threadId: "thread-1",
    projectLocation: { kind: "posix", path: "/repo" },
    config: { model: "composer-2.5" },
    presentationMode: "gui",
    ...overrides,
  };
}

describe("Cursor structured runtime selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAcpStructuredSession.mockReturnValue(session("acp"));
    mocks.createSdkSession.mockResolvedValue(session("sdk"));
  });

  it("uses external SDK mode for a fresh GUI thread when selected", async () => {
    const adapter = createCursorAdapter();
    const request = input({ agentSettings: { structuredRuntime: "sdk" } });

    const result = await adapter.createStructuredSession?.(request);

    expect(result).toBe(await mocks.createSdkSession.mock.results[0]!.value);
    expect(mocks.createSdkSession).toHaveBeenCalledWith(request);
    expect(mocks.createAcpStructuredSession).not.toHaveBeenCalled();
  });

  it("pins an SDK resume even after the provider default changes back to ACP", async () => {
    const adapter = createCursorAdapter();
    const request = input({
      agentSettings: { structuredRuntime: "acp" },
      sessionRef: {
        providerSessionId: "sdk:agent-123",
        discoveredAt: "2026-07-27T00:00:00.000Z",
      },
    });

    await adapter.createStructuredSession?.(request);

    expect(mocks.createSdkSession).toHaveBeenCalledWith(request);
    expect(mocks.createAcpStructuredSession).not.toHaveBeenCalled();
  });

  it("keeps historical unprefixed GUI resumes on ACP", async () => {
    const adapter = createCursorAdapter();
    const request = input({
      agentSettings: { structuredRuntime: "sdk" },
      sessionRef: {
        providerSessionId: "legacy-acp-session",
        discoveredAt: "2026-07-27T00:00:00.000Z",
      },
    });

    await adapter.createStructuredSession?.(request);

    expect(mocks.createSdkSession).not.toHaveBeenCalled();
    expect(mocks.createAcpStructuredSession).toHaveBeenCalledOnce();
    expect(mocks.createAcpStructuredSession.mock.calls[0]?.[0]).toMatchObject({
      args: ["acp"],
    });
  });

  it("never replaces the terminal presentation's installed-agent flow", async () => {
    const adapter = createCursorAdapter();
    await adapter.createStructuredSession?.(
      input({
        presentationMode: "terminal",
        agentSettings: { structuredRuntime: "sdk" },
      }),
    );

    expect(mocks.createSdkSession).not.toHaveBeenCalled();
    expect(mocks.createAcpStructuredSession).toHaveBeenCalledOnce();
  });
});
