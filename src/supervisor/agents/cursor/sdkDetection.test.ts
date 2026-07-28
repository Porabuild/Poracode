import { describe, expect, it, vi } from "vitest";
import { CursorSdkWorkerRpcError } from "./sdkWorkerClient";
import type { AgentStatus } from "@/shared/contracts";
import { agentStatusForPresentation } from "@/shared/agentSelection";
import { applyCursorSdkProbe, probeCursorSdkRuntime } from "./sdkDetection";

function worker(input: {
  probe: () => Promise<{
    models: Array<{ id: string; displayName: string }>;
    sdkVersion: string;
    source: "configured" | "global-npm";
  }>;
}) {
  return {
    probe: input.probe,
    dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
}

describe("probeCursorSdkRuntime", () => {
  it("probes models inside the target runtime and always disposes the worker", async () => {
    const handle = worker({
      probe: async () => ({
        models: [{ id: "composer-2.5", displayName: "Composer 2.5" }],
        sdkVersion: "1.0.24",
        source: "global-npm",
      }),
    });
    const spawnWorker = vi.fn<() => Promise<typeof handle>>(async () => handle);

    await expect(
      probeCursorSdkRuntime(
        {
          envKind: "wsl",
          wslDistro: "Ubuntu",
          agentSettings: {
            sdkPackagePath: "\\\\wsl.localhost\\Ubuntu\\opt\\cursor-sdk",
          },
        },
        { spawnWorker },
      ),
    ).resolves.toEqual({
      installed: true,
      authState: "authenticated",
      models: [{ id: "composer-2.5", displayName: "Composer 2.5" }],
      version: "1.0.24",
      source: "global-npm",
    });
    expect(spawnWorker).toHaveBeenCalledWith({
      projectLocation: expect.objectContaining({
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/tmp",
      }),
      configuredPath: "/opt/cursor-sdk",
    });
    expect(handle.dispose).toHaveBeenCalledOnce();
  });

  it("defers a missing environment-probe key but preserves rejected credentials", async () => {
    const missingAuth = worker({
      probe: async () => {
        throw new CursorSdkWorkerRpcError({
          name: "CursorSdkWorkerError",
          message: "The Cursor SDK requires an API key.",
          code: "auth_missing",
        });
      },
    });
    await expect(
      probeCursorSdkRuntime(undefined, { spawnWorker: async () => missingAuth }),
    ).resolves.toMatchObject({
      installed: true,
      authState: "unknown",
      models: [],
      projectDiscoveryDeferred: true,
      diagnosticCode: "auth_missing",
    });

    const invalidAuth = worker({
      probe: async () => {
        throw new CursorSdkWorkerRpcError({
          name: "CursorSdkWorkerError",
          message: "Cursor rejected the configured SDK API key.",
          code: "auth_invalid",
        });
      },
    });
    await expect(
      probeCursorSdkRuntime(undefined, { spawnWorker: async () => invalidAuth }),
    ).resolves.toMatchObject({
      installed: true,
      authState: "missing",
      models: [],
      diagnosticCode: "auth_invalid",
    });

    const missingPackage = worker({
      probe: async () => {
        throw new CursorSdkWorkerRpcError({
          name: "CursorSdkWorkerError",
          message: "No external Cursor SDK package was found.",
          code: "package_missing",
        });
      },
    });
    await expect(
      probeCursorSdkRuntime(undefined, { spawnWorker: async () => missingPackage }),
    ).resolves.toMatchObject({
      installed: false,
      authState: "unknown",
      models: [],
      projectDiscoveryDeferred: true,
      diagnosticCode: "package_missing",
    });
  });

  it("defers automatic project-local discovery from both native and WSL environment probes", async () => {
    const missingPackage = worker({
      probe: async () => {
        throw new CursorSdkWorkerRpcError({
          name: "CursorSdkWorkerError",
          message: "No external Cursor SDK package was found.",
          code: "package_missing",
        });
      },
    });
    const spawnWorker = vi.fn<(_options: unknown) => Promise<typeof missingPackage>>(
      async () => missingPackage,
    );

    await expect(
      probeCursorSdkRuntime({ envKind: "posix" }, { spawnWorker }),
    ).resolves.toMatchObject({
      installed: false,
      authState: "unknown",
      projectDiscoveryDeferred: true,
      diagnosticCode: "package_missing",
    });
    await expect(
      probeCursorSdkRuntime({ envKind: "wsl", wslDistro: "Ubuntu" }, { spawnWorker }),
    ).resolves.toMatchObject({
      installed: false,
      authState: "unknown",
      projectDiscoveryDeferred: true,
      diagnosticCode: "package_missing",
    });

    expect(spawnWorker).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        projectLocation: expect.objectContaining({
          kind: process.platform === "win32" ? "windows" : "posix",
        }),
      }),
    );
    expect(spawnWorker).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        projectLocation: expect.objectContaining({
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/tmp",
        }),
      }),
    );
  });

  it("keeps an invalid configured path exact instead of deferring to project discovery", async () => {
    const invalidConfiguredPath = worker({
      probe: async () => {
        throw new CursorSdkWorkerRpcError({
          name: "CursorSdkWorkerError",
          message: "The configured Cursor SDK path is invalid.",
          code: "configured_path_invalid",
        });
      },
    });

    await expect(
      probeCursorSdkRuntime(
        {
          envKind: "wsl",
          wslDistro: "Ubuntu",
          agentSettings: {
            sdkPackagePath: "\\\\wsl.localhost\\Ubuntu\\missing\\cursor-sdk",
          },
        },
        { spawnWorker: async () => invalidConfiguredPath },
      ),
    ).resolves.toEqual({
      installed: false,
      authState: "unknown",
      models: [],
      diagnosticCode: "configured_path_invalid",
      diagnosticMessage: "The configured Cursor SDK path is invalid.",
    });
  });

  it("classifies model-catalog 401s as missing API-key authentication", async () => {
    const handle = worker({
      probe: async () => {
        throw Object.assign(new Error("Unauthorized"), { code: 401 });
      },
    });
    await expect(
      probeCursorSdkRuntime(undefined, { spawnWorker: async () => handle }),
    ).resolves.toMatchObject({
      installed: true,
      authState: "missing",
      diagnosticCode: "401",
    });
  });

  it.each(["UNAUTHENTICATED", "BAD_API_KEY", "BAD_USER_API_KEY"])(
    "classifies SDK auth code %s case-insensitively",
    async (code) => {
      const handle = worker({
        probe: async () => {
          throw Object.assign(new Error("Unauthorized"), { code });
        },
      });
      await expect(
        probeCursorSdkRuntime(undefined, { spawnWorker: async () => handle }),
      ).resolves.toMatchObject({
        installed: true,
        authState: "missing",
        diagnosticCode: code,
      });
    },
  );

  it("keeps unclassified worker boot failures unavailable and privacy-safe", async () => {
    await expect(
      probeCursorSdkRuntime(undefined, {
        spawnWorker: async () => {
          throw new Error("worker helper missing");
        },
      }),
    ).resolves.toEqual({
      installed: false,
      authState: "unknown",
      models: [],
      diagnosticMessage: "worker helper missing",
    });
  });

  it("keeps an installed SDK available when only its catalog request is offline", async () => {
    const handle = worker({
      probe: async () => {
        throw new Error("catalog network unavailable");
      },
    });
    await expect(
      probeCursorSdkRuntime(undefined, { spawnWorker: async () => handle }),
    ).resolves.toEqual({
      installed: true,
      authState: "unknown",
      models: [],
      diagnosticMessage: "catalog network unavailable",
    });
  });
});

const cliStatus: AgentStatus = {
  kind: "cursor",
  label: "Cursor",
  installed: true,
  authState: "authenticated",
  loginCommand: "cursor-agent login",
  executablePath: "/usr/bin/cursor-agent",
  version: "2026.07.23",
  capabilities: {
    models: [{ id: "cli-model", label: "CLI Model" }],
    efforts: [],
    modelEfforts: { "cli-model": [] },
    modes: ["agent", "plan"],
    approvalPolicies: [{ id: "never", label: "YOLO" }],
    sandboxModes: [],
    supportsResume: true,
    supportsOneShot: true,
    supportsDirectInput: true,
    liveInputMode: "terminal",
    presentationMode: "terminal",
    presentationModes: ["terminal", "gui"],
    settingDefs: [],
  },
};

describe("applyCursorSdkProbe", () => {
  it("keeps terminal CLI capabilities while overriding GUI with SDK models and auth", () => {
    const merged = applyCursorSdkProbe(cliStatus, {
      installed: true,
      authState: "missing",
      version: "1.0.24",
      source: "global-npm",
      models: [{ id: "sdk-model", displayName: "SDK Model" }],
    });

    expect(merged.authState).toBe("authenticated");
    expect(merged.presentationAuthStates).toEqual({
      terminal: "authenticated",
      gui: "missing",
    });
    expect(merged.presentationAuthUsesProviderLogin).toEqual({ gui: false });
    expect(merged.capabilities.models).toEqual([{ id: "cli-model", label: "CLI Model" }]);
    expect(merged.capabilities.presentationCapabilities?.gui?.models).toEqual([
      { id: "sdk-model", label: "SDK Model" },
    ]);
    expect(merged.capabilities.mcpScope?.gui).toBe("always");
    expect(merged.runtimeVariants).toMatchObject({
      acp: {
        presentationMode: "gui",
        installed: true,
        authState: "authenticated",
        authUsesProviderLogin: true,
        capabilities: {
          models: [{ id: "cli-model", label: "CLI Model" }],
          liveInputMode: "server",
          presentationMode: "gui",
        },
      },
      sdk: {
        presentationMode: "gui",
        installed: true,
        authState: "missing",
        authUsesProviderLogin: false,
        capabilities: {
          models: [{ id: "sdk-model", label: "SDK Model" }],
          liveInputMode: "server",
          presentationMode: "gui",
        },
      },
    });
    expect(merged.sessionRuntimeRouting).toEqual({
      prefixes: { "sdk:": "sdk" },
      fallbackRuntime: "acp",
    });
  });

  it("keeps an existing SDK thread on SDK after the selected default switches to ACP", () => {
    const selectedAcp = applyCursorSdkProbe(
      cliStatus,
      {
        installed: true,
        authState: "missing",
        models: [{ id: "sdk-model", displayName: "SDK Model" }],
      },
      "acp",
    );

    expect(selectedAcp.capabilities.models).toEqual([{ id: "cli-model", label: "CLI Model" }]);
    const freshAcp = agentStatusForPresentation(selectedAcp, "gui");
    expect(freshAcp.capabilities.models).toEqual([{ id: "cli-model", label: "CLI Model" }]);
    expect(freshAcp.capabilities.liveInputMode).toBe("server");
    expect(freshAcp.capabilities.presentationMode).toBe("gui");
    const existingSdk = agentStatusForPresentation(selectedAcp, "gui", {
      providerSessionId: "sdk:agent-1",
      discoveredAt: "2026-07-27T00:00:00.000Z",
    });
    expect(existingSdk.installed).toBe(true);
    expect(existingSdk.authState).toBe("missing");
    expect(existingSdk.loginCommand).toBeUndefined();
    expect(existingSdk.capabilities.models).toEqual([{ id: "sdk-model", label: "SDK Model" }]);
  });

  it("keeps an existing ACP thread on ACP after the selected default switches to SDK", () => {
    const selectedSdk = applyCursorSdkProbe(
      {
        ...cliStatus,
        authMethods: [
          { type: "terminal", id: "cursor-login", name: "Cursor login", args: ["login"] },
        ],
      },
      {
        installed: true,
        authState: "authenticated",
        models: [{ id: "sdk-model", displayName: "SDK Model" }],
      },
      "sdk",
    );

    const freshGui = agentStatusForPresentation(selectedSdk, "gui");
    expect(freshGui.capabilities.models).toEqual([{ id: "sdk-model", label: "SDK Model" }]);

    const existingAcp = agentStatusForPresentation(selectedSdk, "gui", {
      providerSessionId: "legacy-acp-session",
      discoveredAt: "2026-07-27T00:00:00.000Z",
    });
    expect(existingAcp.authState).toBe("authenticated");
    expect(existingAcp.loginCommand).toBe("cursor-agent login");
    expect(existingAcp.authMethods).toHaveLength(1);
    expect(existingAcp.capabilities.models).toEqual([{ id: "cli-model", label: "CLI Model" }]);
  });

  it("advertises an SDK-only installation without CLI login/update affordances", () => {
    const sdkOnly = applyCursorSdkProbe(
      {
        ...cliStatus,
        installed: false,
        authState: "missing",
        update: { builtIn: { binary: "cursor-agent", args: ["update"] } },
      },
      {
        installed: true,
        authState: "authenticated",
        version: "1.0.24",
        models: [{ id: "sdk-model", displayName: "SDK Model" }],
      },
    );

    expect(sdkOnly).toMatchObject({
      installed: true,
      authState: "authenticated",
      version: "1.0.24",
      presentationAuthStates: { gui: "authenticated" },
      capabilities: {
        presentationMode: "gui",
        presentationModes: ["gui"],
        liveInputMode: "server",
        supportsOneShot: false,
        models: [{ id: "sdk-model", label: "SDK Model" }],
      },
    });
    expect(sdkOnly.loginCommand).toBeUndefined();
    expect(sdkOnly.executablePath).toBeUndefined();
    expect(sdkOnly.update).toBeUndefined();
    expect(sdkOnly.runtimeVariants).toMatchObject({
      acp: { installed: false },
      sdk: {
        installed: true,
        capabilities: {
          models: [{ id: "sdk-model", label: "SDK Model" }],
          supportsOneShot: false,
        },
      },
    });
  });

  it("hides SDK GUI when the external package is unavailable", () => {
    const merged = applyCursorSdkProbe(cliStatus, {
      installed: false,
      authState: "unknown",
      models: [],
      diagnosticCode: "package_missing",
    });
    expect(merged.installed).toBe(true);
    expect(merged.capabilities.presentationModes).toEqual(["terminal"]);
    expect(merged.presentationAuthStates).toEqual({ terminal: "authenticated" });
    expect(merged.presentationAuthUsesProviderLogin).toBeUndefined();
    expect(merged.runtimeVariants?.sdk).toMatchObject({
      installed: false,
      authState: "unknown",
      capabilities: { models: [] },
    });
  });

  it("keeps selected SDK GUI launchable while project package and API-key discovery are deferred", () => {
    const merged = applyCursorSdkProbe(cliStatus, {
      installed: false,
      authState: "unknown",
      models: [],
      projectDiscoveryDeferred: true,
      diagnosticCode: "package_missing",
    });

    expect(merged.installed).toBe(true);
    expect(merged.capabilities.presentationModes).toEqual(["terminal", "gui"]);
    expect(merged.presentationAuthStates).toEqual({
      terminal: "authenticated",
      gui: "unknown",
    });
    expect(merged.presentationAuthUsesProviderLogin).toEqual({ gui: false });
    expect(merged.capabilities.presentationCapabilities?.gui?.models).toEqual([
      { id: "cli-model", label: "CLI Model" },
    ]);
  });

  it("keeps a globally discovered SDK launchable for a project-shell API key", () => {
    const merged = applyCursorSdkProbe(cliStatus, {
      installed: true,
      authState: "unknown",
      models: [],
      projectDiscoveryDeferred: true,
      diagnosticCode: "auth_missing",
    });

    expect(agentStatusForPresentation(merged, "gui")).toMatchObject({
      installed: true,
      authState: "unknown",
      capabilities: {
        models: [{ id: "cli-model", label: "CLI Model" }],
        presentationMode: "gui",
      },
    });
  });

  it("uses the documented SDK Auto fallback for a project-local SDK-only install", () => {
    const sdkOnly = applyCursorSdkProbe(
      {
        ...cliStatus,
        installed: false,
        authState: "unknown",
        capabilities: {
          ...cliStatus.capabilities,
          models: [],
        },
      },
      {
        installed: false,
        authState: "unknown",
        models: [],
        projectDiscoveryDeferred: true,
        diagnosticCode: "package_missing",
      },
    );

    expect(sdkOnly).toMatchObject({
      installed: true,
      authState: "unknown",
      presentationAuthStates: { gui: "unknown" },
      presentationAuthUsesProviderLogin: { gui: false },
      capabilities: {
        presentationMode: "gui",
        presentationModes: ["gui"],
        models: [{ id: "auto", label: "Auto" }],
      },
    });
    expect(sdkOnly.loginCommand).toBeUndefined();
    expect(sdkOnly.executablePath).toBeUndefined();
  });
});
