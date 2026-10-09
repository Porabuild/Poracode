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

  it("forwards user-approved roots only on the structured GUI path", () => {
    const create = spyOnCreate();
    const additionalDirectories = [{ kind: "windows" as const, path: "C:\\extra" }];
    createAcpStructuredSession(
      { command: "test-agent", args: [] },
      makeInput({ presentationMode: "gui", additionalDirectories }),
    );
    expect(create.mock.calls[0]?.[3]).toMatchObject({ additionalDirectories });
  });

  it.each([undefined, "terminal"] as const)(
    "rejects extra roots for a TUI handoff (%s), including resume",
    (presentationMode) => {
      const create = spyOnCreate();
      for (const sessionRef of [
        undefined,
        { providerSessionId: "saved", discoveredAt: "2026-10-08T00:00:00Z" },
      ]) {
        expect(() =>
          createAcpStructuredSession(
            { command: "test-agent", args: [] },
            makeInput({
              ...(presentationMode ? { presentationMode } : {}),
              ...(sessionRef ? { sessionRef } : {}),
              additionalDirectories: [{ kind: "windows", path: "C:\\extra" }],
            }),
          ),
        ).toThrow("structured GUI");
      }
      expect(create).not.toHaveBeenCalled();
    },
  );

  it("forwards disabled host services for remote execution", () => {
    const createSpy = spyOnCreate();
    createAcpStructuredSession(
      { command: "test-agent", args: ["acp"] },
      makeInput({ acpFsTextCapability: false, acpTerminalCapability: false }),
    );
    expect(createSpy.mock.calls[0]?.[3]).toMatchObject({
      fsTextCapability: false,
      terminalCapability: false,
    });
  });

  it("forwards the declared mode resolver", () => {
    const createSpy = spyOnCreate();
    const resolveMode = () => "unrestricted";
    createAcpStructuredSession({ command: "test-agent", args: ["acp"] }, makeInput(), {
      resolveMode,
    });
    expect(createSpy.mock.calls[0]?.[3]).toMatchObject({ resolveMode });
  });

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

  it("exports merged environment inside WSL before launching the ACP agent", () => {
    const createSpy = spyOnCreate();

    createAcpStructuredSession(
      {
        command: "wsl.exe",
        args: [
          "-d",
          "Ubuntu",
          "--cd",
          "/repo",
          "--exec",
          "/bin/bash",
          "-l",
          "-i",
          "-c",
          "cursor-agent acp",
        ],
      },
      makeInput({
        projectLocation: {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/repo",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\repo",
        },
        baseSpawnEnv: { CURSOR_API_KEY: "profile-key" },
      }),
    );

    expect(createSpy.mock.calls[0]?.[0]).toMatchObject({
      env: { CURSOR_API_KEY: "profile-key" },
      args: expect.arrayContaining([
        expect.stringContaining("export CURSOR_API_KEY='profile-key'; cursor-agent acp"),
      ]),
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

  it("forwards client capability metadata to the ACP session", () => {
    const createSpy = spyOnCreate();

    createAcpStructuredSession(
      { command: "agent", args: ["acp"] },
      makeInput({ acpClientCapabilitiesMeta: { parameterizedModelPicker: true } }),
    );

    expect(createSpy.mock.calls[0]?.[3]).toMatchObject({
      clientCapabilitiesMeta: { parameterizedModelPicker: true },
    });
  });

  it("forwards provider-specific session behavior", () => {
    const createSpy = spyOnCreate();

    createAcpStructuredSession({ command: "vendor-acp", args: [] }, makeInput(), {
      behavior: {
        suppressOutputAfterInterrupt: true,
        suppressStderrLogging: true,
      },
    });

    expect(createSpy.mock.calls[0]?.[3]).toMatchObject({
      behavior: {
        suppressOutputAfterInterrupt: true,
        suppressStderrLogging: true,
      },
    });
  });

  it("forwards a provider text-stream extension", () => {
    const createSpy = spyOnCreate();
    const textStreamExtension = { id: "vendor.taskNotifications" };

    createAcpStructuredSession({ command: "vendor-acp", args: [] }, makeInput(), {
      textStreamExtension,
    });

    expect(createSpy.mock.calls[0]?.[3]).toMatchObject({ textStreamExtension });
  });

  it("forwards the opened-session hook and unlisted-select guard", () => {
    const createSpy = spyOnCreate();
    const configureOpenedSession = () => {};
    const allowUnlistedSelectValue = () => false;

    createAcpStructuredSession({ command: "vendor-acp", args: [] }, makeInput(), {
      configureOpenedSession,
      allowUnlistedSelectValue,
    });

    expect(createSpy.mock.calls[0]?.[3]).toMatchObject({
      configureOpenedSession,
      allowUnlistedSelectValue,
    });
  });
});

describe("createAcpStructuredSession extension lifecycle pass-through", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function spyOnCreate() {
    return vi
      .spyOn(AcpStructuredSession, "create")
      .mockReturnValue({ sessionId: "session-1" } as unknown as AcpStructuredSession);
  }

  it("forwards the extension request handler, timeout, actions, and boolean capability", () => {
    const createSpy = spyOnCreate();
    const handler = () => ({ handled: false as const });
    const actions = [{ id: "fixture.action", invoke: async () => ({}) }];

    createAcpStructuredSession(
      { command: "agent", args: ["acp"] },
      makeInput({
        acpExtensionRequestHandler: handler,
        acpExtensionRequestTimeoutMs: 4_000,
        acpSessionActions: actions,
        acpBooleanConfigOptions: true,
      }),
    );

    expect(createSpy.mock.calls[0]?.[3]).toMatchObject({
      extensionRequestHandler: handler,
      extensionRequestTimeoutMs: 4_000,
      sessionActions: actions,
      booleanConfigOptions: true,
    });
  });

  it("forwards the provider config-options normalizer", () => {
    const createSpy = spyOnCreate();
    const normalizer = (options: readonly unknown[]) => options;

    createAcpStructuredSession(
      { command: "agent", args: ["acp"] },
      makeInput({ acpConfigOptionsNormalizer: normalizer }),
    );

    expect(createSpy.mock.calls[0]?.[3]).toMatchObject({ configOptionsNormalizer: normalizer });
  });

  it("omits the optional extension surfaces when the adapter declares none", () => {
    const createSpy = spyOnCreate();

    createAcpStructuredSession({ command: "agent", args: ["acp"] }, makeInput());

    const options = createSpy.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(options).not.toHaveProperty("extensionRequestHandler");
    expect(options).not.toHaveProperty("extensionRequestTimeoutMs");
    expect(options).not.toHaveProperty("sessionActions");
    expect(options).not.toHaveProperty("booleanConfigOptions");
    expect(options).not.toHaveProperty("configOptionsNormalizer");
    expect(options).not.toHaveProperty("configureOpenedSession");
    expect(options).not.toHaveProperty("allowUnlistedSelectValue");
  });
});
