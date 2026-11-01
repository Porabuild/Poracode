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
  const closeAuthentications = vi.fn<() => Promise<void>>(async () => {});
  const closeOAuth = vi.fn<() => Promise<void>>(async () => {});
  const disposeHexVoice = vi.fn<() => Promise<void>>(async () => {});
  const runtime = Object.assign(Object.create(SupervisorRuntime.prototype), {
    disposeNativeRuntime,
    agentRegistryService: { disposeAcpAuthentications: closeAuthentications },
    disposeWindowsPowerShellPreference: dispose,
    disposeWslCredentialProjectScope: dispose,
    routingOverridePersistence: { dispose },
    settingsWriter: { dispose },
    usageService: { stop: dispose },
    mcpProbeService: { dispose },
    mcpOAuthService: { dispose: closeOAuth },
    mcpAuthenticationService: { dispose: async () => {} },
    hexVoiceService: { dispose: disposeHexVoice },
    mcpOAuthRelay: { dispose: async () => {} },
    lspManager: { dispose },
    threadSessionManager: { dispose: closeThreads },
    subagentRunManager: { retryRetirements: async () => {} },
    crossagentMcpIngress: { dispose },
    sharedSettingsCache: { dispose },
    cliHookPluginCoordinator: { dispose: closeHooks },
    adapters: new Map(),
  }) as SupervisorRuntime;
  return { runtime, closeThreads, closeHooks, closeAuthentications, closeOAuth, disposeHexVoice };
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
  expect(f.disposeHexVoice).toHaveBeenCalledOnce();
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

it("joins controlled authentication retirement while still retiring ordinary sessions", async () => {
  const pending = Promise.withResolvers<void>();
  const f = runtimeFixture(async () => {});
  f.closeAuthentications.mockReturnValue(pending.promise);
  let completed = false;
  const disposed = f.runtime.disposeAsync().then(() => {
    completed = true;
  });
  await Promise.resolve();
  expect(f.closeAuthentications).toHaveBeenCalledOnce();
  expect(f.closeThreads).toHaveBeenCalledOnce();
  expect(completed).toBe(false);
  pending.resolve();
  await disposed;
  expect(completed).toBe(true);
});

it("joins OAuth retirement without delaying ordinary child shutdown", async () => {
  const pending = Promise.withResolvers<void>();
  const f = runtimeFixture(async () => {});
  f.closeOAuth.mockReturnValue(pending.promise);
  let completed = false;
  const disposed = f.runtime.disposeAsync().then(() => {
    completed = true;
  });
  try {
    await Promise.resolve();
    expect(f.closeOAuth).toHaveBeenCalledOnce();
    expect(f.closeThreads).toHaveBeenCalledOnce();
    expect(completed).toBe(false);
  } finally {
    pending.resolve();
    await disposed;
  }
});

it("reports failed OAuth retirement after joining other owned sessions", async () => {
  const failure = new Error("OAuth listener retirement could not be confirmed");
  const f = runtimeFixture(async () => {});
  f.closeOAuth.mockRejectedValue(failure);
  await expect(f.runtime.disposeAsync()).rejects.toMatchObject({ errors: [failure] });
  expect(f.closeThreads).toHaveBeenCalledOnce();
  expect(f.closeHooks).toHaveBeenCalledOnce();
});
