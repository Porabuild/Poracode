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
    probe: vi.fn<typeof input.probe>(input.probe),
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
          agentSettings: { sdkApiKey: "stored-key" },
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
    });
    expect(handle.probe).toHaveBeenCalledWith("stored-key");
    expect(handle.dispose).toHaveBeenCalledOnce();
  });

  it("uses an explicit profile key instead of the base Cursor setting", async () => {
    const handle = worker({
      probe: async () => ({
        models: [],
        sdkVersion: "1.0.24",
        source: "global-npm",
      }),
    });

    await probeCursorSdkRuntime(
      { envKind: "posix", agentSettings: { sdkApiKey: "base-key" } },
      { spawnWorker: async () => handle },
      "profile-key",
    );

    expect(handle.probe).toHaveBeenCalledWith("profile-key");
  });

  it("reports a missing or rejected SDK API key as missing authentication", async () => {
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
      authState: "missing",
      models: [],
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
      diagnosticCode: "package_missing",
    });
  });

  it("reports an SDK as unavailable when automatic package discovery fails", async () => {
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
      diagnosticCode: "package_missing",
    });
    await expect(
      probeCursorSdkRuntime({ envKind: "wsl", wslDistro: "Ubuntu" }, { spawnWorker }),
    ).resolves.toMatchObject({
      installed: false,
      authState: "unknown",
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

  it("terminates a pending worker probe when detection is cancelled", async () => {
    const abort = new AbortController();
    let rejectProbe: ((error: Error) => void) | undefined;
    const handle = {
      probe: vi.fn<() => Promise<never>>(
        () =>
          new Promise<never>((_resolve, reject) => {
            rejectProbe = reject;
          }),
      ),
      terminate: vi.fn<() => void>(() => rejectProbe?.(new Error("worker terminated"))),
      dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };
    const pending = probeCursorSdkRuntime(
      { envKind: "wsl", wslDistro: "Ubuntu", signal: abort.signal },
      { spawnWorker: async () => handle },
    );
    await vi.waitFor(() => expect(handle.probe).toHaveBeenCalledOnce());

    abort.abort();
    await pending;

    expect(handle.terminate).toHaveBeenCalledOnce();
    expect(handle.dispose).toHaveBeenCalledOnce();
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
  it("falls back to ACP capabilities while retaining separate SDK install and auth state", () => {
    const merged = applyCursorSdkProbe(cliStatus, {
      installed: true,
      authState: "missing",
      version: "1.0.24",
      source: "global-npm",
      models: [{ id: "sdk-model", displayName: "SDK Model" }],
    });

    expect(merged.authState).toBe("authenticated");
    expect(merged.presentationAuthStates).toBeUndefined();
    expect(merged.presentationAuthUsesProviderLogin).toBeUndefined();
    expect(merged.capabilities.models).toEqual([{ id: "cli-model", label: "CLI Model" }]);
    expect(merged.capabilities.presentationCapabilities?.gui?.models).toEqual([
      { id: "cli-model", label: "CLI Model" },
    ]);
    expect(merged.capabilities.mcpScope?.gui).toBe("launch");
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
    expect(merged.capabilities.presentationModes).toEqual(["terminal", "gui"]);
    expect(merged.presentationAuthStates).toBeUndefined();
    expect(merged.presentationAuthUsesProviderLogin).toBeUndefined();
    expect(merged.runtimeVariants?.sdk).toMatchObject({
      installed: false,
      authState: "unknown",
      capabilities: { models: [] },
    });
  });

  it("does not select SDK when its package is unavailable", () => {
    const merged = applyCursorSdkProbe(cliStatus, {
      installed: false,
      authState: "unknown",
      models: [],
      diagnosticCode: "package_missing",
    });

    expect(merged.installed).toBe(true);
    expect(merged.capabilities.presentationModes).toEqual(["terminal", "gui"]);
    expect(merged.presentationAuthStates).toBeUndefined();
  });

  it("falls back to ACP when the detected SDK is not authenticated", () => {
    const merged = applyCursorSdkProbe(cliStatus, {
      installed: true,
      authState: "missing",
      models: [],
      diagnosticCode: "auth_missing",
    });

    expect(agentStatusForPresentation(merged, "gui")).toMatchObject({
      installed: true,
      authState: "authenticated",
      capabilities: {
        models: [{ id: "cli-model", label: "CLI Model" }],
        presentationMode: "gui",
      },
    });
    expect(merged.runtimeVariants?.sdk).toMatchObject({
      installed: true,
      authState: "missing",
    });
  });

  it("keeps an unauthenticated SDK-only install visible without exposing a composer surface", () => {
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
        installed: true,
        authState: "missing",
        models: [],
        diagnosticCode: "auth_missing",
      },
    );

    expect(sdkOnly).toMatchObject({
      installed: true,
      authState: "missing",
      presentationAuthStates: { gui: "missing" },
      presentationAuthUsesProviderLogin: { gui: false },
      capabilities: {
        presentationMode: "gui",
        presentationModes: [],
        models: [],
      },
    });
    expect(sdkOnly.loginCommand).toBeUndefined();
    expect(sdkOnly.executablePath).toBeUndefined();
  });
});
