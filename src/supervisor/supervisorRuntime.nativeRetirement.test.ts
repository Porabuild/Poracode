import { expect, it, vi } from "vitest";
import { SupervisorRuntime } from "./supervisorRuntime";

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
