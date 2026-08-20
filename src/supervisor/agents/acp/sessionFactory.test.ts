import { afterEach, describe, expect, it, vi } from "vitest";
import type { CreateStructuredSessionInput } from "../base";
import { AcpStructuredSession } from "./session";
import { createAcpStructuredSession } from "./sessionFactory";

function makeInput(
  overrides: Partial<CreateStructuredSessionInput> = {},
): CreateStructuredSessionInput {
  return {
    threadId: "thread-1",
    projectLocation: { kind: "windows", path: "C:\\repo" },
    config: { model: "test-model" },
    ...overrides,
  };
}

// The ACP child is spawned from `command.env` (session.ts spreads it into the
// child env), so the command `AcpStructuredSession.create` receives IS the
// proof that the provider's baseSpawnEnv reaches the spawn.
describe("createAcpStructuredSession baseSpawnEnv merge", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function spyOnCreate() {
    return vi
      .spyOn(AcpStructuredSession, "create")
      .mockReturnValue({ sessionId: "session-1" } as unknown as AcpStructuredSession);
  }

  it("applies input.baseSpawnEnv to the spawned ACP command", () => {
    const createSpy = spyOnCreate();

    createAcpStructuredSession(
      { command: "droid", args: ["exec", "--output-format", "acp"] },
      makeInput({ baseSpawnEnv: { DROID_DISABLE_AUTO_UPDATE: "true" } }),
    );

    expect(createSpy.mock.calls[0]?.[0]).toEqual({
      command: "droid",
      args: ["exec", "--output-format", "acp"],
      env: { DROID_DISABLE_AUTO_UPDATE: "true" },
    });
  });

  it("lets command-declared env win over the base env", () => {
    const createSpy = spyOnCreate();

    createAcpStructuredSession(
      {
        command: "droid",
        args: ["exec"],
        env: { DROID_DISABLE_AUTO_UPDATE: "false", EXTRA: "kept" },
      },
      makeInput({ baseSpawnEnv: { DROID_DISABLE_AUTO_UPDATE: "true" } }),
    );

    expect(createSpy.mock.calls[0]?.[0]).toMatchObject({
      env: { DROID_DISABLE_AUTO_UPDATE: "false", EXTRA: "kept" },
    });
  });

  it("passes the command through unchanged when nothing contributes env", () => {
    const createSpy = spyOnCreate();
    const command = { command: "droid", args: ["exec"] };

    createAcpStructuredSession(command, makeInput());

    expect(createSpy.mock.calls[0]?.[0]).toBe(command);
  });

  it("forwards adapter initialize metadata to the ACP session", () => {
    const createSpy = spyOnCreate();

    createAcpStructuredSession(
      { command: "qwen", args: ["--acp"] },
      makeInput({ acpInitializeMeta: { "qwen.daemon.activeWorkHeartbeat": { v: 1 } } }),
    );

    expect(createSpy.mock.calls[0]?.[3]).toMatchObject({
      initializeMeta: { "qwen.daemon.activeWorkHeartbeat": { v: 1 } },
    });
  });
});
