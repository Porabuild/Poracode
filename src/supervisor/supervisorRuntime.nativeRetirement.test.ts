import { beforeEach, expect, it, vi } from "vitest";
import { SupervisorRuntime } from "./supervisorRuntime";
const retireKeychain = vi.hoisted(() => vi.fn<() => Promise<void>>());
vi.mock("./runtime/macKeychainProcess", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./runtime/macKeychainProcess")>()),
  retireMacKeychainCommands: retireKeychain,
}));

beforeEach(() => {
  retireKeychain.mockReset().mockResolvedValue(undefined);
});

function runtimeFixture(disposeNativeRuntime: () => Promise<void>) {
  const dispose = vi.fn<() => void>();
  const closeThreads = vi.fn<() => Promise<boolean>>(async () => true);
  const closeHooks = vi.fn<() => Promise<void>>(async () => {});
  const runtime = Object.assign(Object.create(SupervisorRuntime.prototype), {
    disposeNativeRuntime,
    disposeWindowsPowerShellPreference: dispose,
    disposeWslCredentialProjectScope: dispose,
    routingOverridePersistence: { dispose },
    settingsWriter: { dispose },
    usageService: { stop: dispose },
    mcpProbeService: { dispose },
    mcpOAuthService: { dispose },
    lspManager: { dispose },
    threadSessionManager: { dispose: closeThreads },
    subagentRunManager: { retryRetirements: async () => {} },
    crossagentMcpIngress: { dispose },
    sharedSettingsCache: { dispose },
    cliHookPluginCoordinator: { dispose: closeHooks },
    adapters: new Map(),
  }) as SupervisorRuntime;
  return { runtime, closeThreads, closeHooks };
}

it("starts ordinary child teardown while native extraction retirement is still joining", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const f = runtimeFixture(() => pending);
  const disposing = f.runtime.disposeAsync();
  try {
    await Promise.resolve();
    expect(f.closeThreads).toHaveBeenCalledOnce();
  } finally {
    release();
    await disposing;
  }
});

it("reports failed native retirement after closing the other owned sessions and hooks", async () => {
  const failure = new Error("extraction exit could not be confirmed");
  const f = runtimeFixture(async () => {
    throw failure;
  });
  await expect(f.runtime.disposeAsync()).rejects.toMatchObject({ errors: [failure] });
  expect(f.closeThreads).toHaveBeenCalledOnce();
  expect(f.closeHooks).toHaveBeenCalledOnce();
});

it("joins pending Keychain clients without delaying other owned sessions", async () => {
  const pending = Promise.withResolvers<void>();
  retireKeychain.mockReturnValue(pending.promise);
  const f = runtimeFixture(async () => {});
  let completed = false;
  const disposing = f.runtime.disposeAsync().then(() => {
    completed = true;
  });
  await Promise.resolve();
  expect(retireKeychain).toHaveBeenCalledOnce();
  expect(f.closeThreads).toHaveBeenCalledOnce();
  expect(completed).toBe(false);
  pending.resolve();
  await disposing;
  expect(completed).toBe(true);
});

it("reports failed Keychain retirement after closing other owned sessions and hooks", async () => {
  const failure = new Error("Keychain client exit could not be confirmed");
  retireKeychain.mockRejectedValue(failure);
  const f = runtimeFixture(async () => {});
  await expect(f.runtime.disposeAsync()).rejects.toMatchObject({ errors: [failure] });
  expect(f.closeThreads).toHaveBeenCalledOnce();
  expect(f.closeHooks).toHaveBeenCalledOnce();
});
