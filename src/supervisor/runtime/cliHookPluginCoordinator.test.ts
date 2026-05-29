import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentKind } from "@/shared/contracts";
import {
  type AgentAdapter,
  type AgentEnvContext,
  type AgentCliHookPluginSupport,
} from "../agents/base";
import type { WslBridgeServer } from "../wsl/bridge";
import { CliHookPluginCoordinator } from "./cliHookPluginCoordinator";

/**
 * Tests cover the cache lifecycle of `CliHookPluginCoordinator`:
 *   - Missing plugins are not auto-installed from boot or spawn
 *   - Explicit install/uninstall updates the per-environment cache
 *   - Installed stale plugins are auto-updated
 *   - Cached entries are rechecked against the provider's on-disk install
 *   - resolvePluginEnvForSpawn returns undefined when hooks are unavailable
 */

const tempDirs: string[] = [];

function makeTempSettings(): string {
  const dir = mkdtempSync(join(tmpdir(), "lightcode-cli-hook-cache-"));
  tempDirs.push(dir);
  return join(dir, "settings.json");
}

interface PluginAdapterStub {
  adapter: AgentAdapter;
  installPlugin: ReturnType<typeof vi.fn>;
  uninstallPlugin: ReturnType<typeof vi.fn>;
  isPluginInstalled: ReturnType<typeof vi.fn>;
  isPluginSupported: ReturnType<typeof vi.fn>;
}

function makeStubAdapter(
  kind: AgentKind,
  overrides: Partial<AgentCliHookPluginSupport> & {
    liveInputMode?: "terminal" | "server";
  } = {},
): PluginAdapterStub {
  const installPlugin = vi.fn<
    () => Promise<{ ok: true; version: string } | { ok: false; reason: string }>
  >(async () => ({ ok: true, version: "1.0.0" }));
  const isPluginInstalled = vi.fn<() => Promise<{ installed: boolean; version?: string }>>(
    async () => ({ installed: false }),
  );
  const uninstallPlugin = vi.fn<() => Promise<void>>(async () => undefined);
  const isPluginSupported = vi.fn<() => Promise<boolean>>(async () => true);

  const { liveInputMode, ...sliceOverrides } = overrides;

  // We only fill the CLI hook plugin slice — the rest of AgentAdapter is unused
  // by the coordinator and is cast-asserted at the seam. The capabilities
  // block carries `liveInputMode` so we can exercise the CLI-only gate.
  const adapter = {
    kind,
    label: kind,
    capabilities: {
      liveInputMode: liveInputMode ?? "terminal",
      presentationMode: "terminal",
    },
    pluginId: `lightcode-status@${kind}`,
    pluginVersion: "1.0.0",
    minProtocolVersion: 1,
    isPluginSupported,
    isPluginInstalled,
    installPlugin,
    uninstallPlugin,
    pluginLaunchExtras: async () => ({ args: [`--${kind}-marker`] }),
    ...sliceOverrides,
  } as unknown as AgentAdapter;
  return { adapter, installPlugin, uninstallPlugin, isPluginInstalled, isPluginSupported };
}

function readCache(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  const data = JSON.parse(readFileSync(path, "utf8")) as {
    agentHookSupport?: Record<string, unknown>;
  };
  return data.agentHookSupport ?? {};
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

describe("CliHookPluginCoordinator install cache", () => {
  let settingsPath: string;
  let coordinator: CliHookPluginCoordinator;

  beforeEach(() => {
    settingsPath = makeTempSettings();
  });

  afterEach(async () => {
    if (coordinator) {
      await coordinator.dispose();
    }
  });

  it("does not auto-install missing plugins from boot or spawn", async () => {
    const stub = makeStubAdapter("claude");
    stub.isPluginInstalled.mockResolvedValue({ installed: false });

    coordinator = new CliHookPluginCoordinator(
      {
        adapters: new Map([["claude", stub.adapter]]),
        settingsPath,
        envContext: () => ({ envKind: "posix" }) as AgentEnvContext,
      },
      () => undefined,
    );
    coordinator.startIngress();
    await coordinator.installAll();

    const resolved = await coordinator.resolvePluginEnvForSpawn({
      threadId: "t1",
      agentKind: "claude",
    });
    expect(resolved).toBeUndefined();
    expect(stub.installPlugin).not.toHaveBeenCalled();
    expect(readCache(settingsPath)).toEqual({});
  });

  it("skips installPlugin on cache hit (same version, fresh, files present)", async () => {
    // Pre-seed a fresh cache + claim the plugin is already installed.
    writeFileSync(
      settingsPath,
      JSON.stringify({
        agentHookSupport: {
          claude: {
            agentBinaryVersion: "n/a",
            pluginVersion: "1.0.0",
            protocolVersion: 1,
            platform: process.platform,
            verifiedAt: new Date().toISOString(),
            supportsL1: true,
          },
        },
      }),
      "utf8",
    );

    const stub = makeStubAdapter("claude");
    stub.isPluginInstalled.mockResolvedValue({ installed: true, version: "1.0.0" });

    coordinator = new CliHookPluginCoordinator(
      {
        adapters: new Map([["claude", stub.adapter]]),
        settingsPath,
        envContext: () => ({ envKind: "posix" }),
      },
      () => undefined,
    );
    await coordinator.installAll();

    expect(stub.installPlugin).not.toHaveBeenCalled();
  });

  it("re-runs installPlugin when the cached plugin version is older", async () => {
    writeFileSync(
      settingsPath,
      JSON.stringify({
        agentHookSupport: {
          claude: {
            agentBinaryVersion: "n/a",
            pluginVersion: "0.9.0",
            protocolVersion: 1,
            platform: process.platform,
            verifiedAt: new Date().toISOString(),
            supportsL1: true,
          },
        },
      }),
      "utf8",
    );

    const stub = makeStubAdapter("claude", { pluginVersion: "1.0.0" });
    stub.isPluginInstalled.mockResolvedValue({ installed: true, version: "0.9.0" });

    coordinator = new CliHookPluginCoordinator(
      {
        adapters: new Map([["claude", stub.adapter]]),
        settingsPath,
        envContext: () => ({ envKind: "posix" }),
      },
      () => undefined,
    );
    await coordinator.installAll();

    expect(stub.installPlugin).toHaveBeenCalledTimes(1);
    const entry = readCache(settingsPath)["claude"] as { pluginVersion: string };
    expect(entry.pluginVersion).toBe("1.0.0");
  });

  it("refreshes cache when the cached platform doesn't match and plugin is installed", async () => {
    writeFileSync(
      settingsPath,
      JSON.stringify({
        agentHookSupport: {
          claude: {
            agentBinaryVersion: "n/a",
            pluginVersion: "1.0.0",
            protocolVersion: 1,
            platform: process.platform === "win32" ? "linux" : "win32",
            verifiedAt: new Date().toISOString(),
            supportsL1: true,
          },
        },
      }),
      "utf8",
    );

    const stub = makeStubAdapter("claude");
    stub.isPluginInstalled.mockResolvedValue({ installed: true, version: "1.0.0" });

    coordinator = new CliHookPluginCoordinator(
      {
        adapters: new Map([["claude", stub.adapter]]),
        settingsPath,
        envContext: () => ({ envKind: "posix" }),
      },
      () => undefined,
    );
    await coordinator.installAll();

    expect(stub.installPlugin).not.toHaveBeenCalled();
    const entry = readCache(settingsPath)["claude"] as { platform: string };
    expect(entry.platform).toBe(process.platform);
  });

  it("does not persist a negative cache entry when the plugin is missing", async () => {
    const stub = makeStubAdapter("claude");
    stub.isPluginInstalled.mockResolvedValue({ installed: false });

    coordinator = new CliHookPluginCoordinator(
      {
        adapters: new Map([["claude", stub.adapter]]),
        settingsPath,
        envContext: () => ({ envKind: "posix" }),
      },
      () => undefined,
    );
    coordinator.startIngress();
    const resolved = await coordinator.resolvePluginEnvForSpawn({
      threadId: "t1",
      agentKind: "claude",
    });
    expect(resolved).toBeUndefined();
    expect(stub.installPlugin).not.toHaveBeenCalled();
    expect(readCache(settingsPath)).toEqual({});
  });

  it("recovers from cached unsupported when the plugin is now installed", async () => {
    writeFileSync(
      settingsPath,
      JSON.stringify({
        agentHookSupport: {
          codex: {
            agentBinaryVersion: "n/a",
            pluginVersion: "1.0.0",
            protocolVersion: 1,
            platform: process.platform,
            verifiedAt: new Date().toISOString(),
            supportsL1: false,
          },
        },
      }),
      "utf8",
    );

    const stub = makeStubAdapter("codex");
    stub.isPluginInstalled.mockResolvedValue({ installed: true, version: "1.0.0" });

    coordinator = new CliHookPluginCoordinator(
      {
        adapters: new Map([["codex", stub.adapter]]),
        settingsPath,
        envContext: () => ({ envKind: "posix" }),
      },
      () => undefined,
    );
    coordinator.startIngress();

    const resolved = await coordinator.resolvePluginEnvForSpawn({
      threadId: "thread-codex-recovered",
      agentKind: "codex",
    });

    expect(resolved).toBeDefined();
    expect(stub.installPlugin).not.toHaveBeenCalled();
    expect(readCache(settingsPath)["codex"]).toMatchObject({
      pluginVersion: "1.0.0",
      supportsL1: true,
    });
  });

  it("explicitly installs WSL plugins and writes a per-distro cache entry", async () => {
    writeFileSync(
      settingsPath,
      JSON.stringify({
        agentHookSupport: {
          "codex::wsl::Ubuntu": {
            agentBinaryVersion: "n/a",
            pluginVersion: "1.0.0",
            protocolVersion: 1,
            platform: process.platform,
            verifiedAt: new Date().toISOString(),
            supportsL1: false,
          },
        },
      }),
      "utf8",
    );

    const stub = makeStubAdapter("codex");
    stub.installPlugin.mockResolvedValue({ ok: true as const, version: "1.0.0" });
    stub.isPluginInstalled.mockResolvedValue({ installed: true, version: "1.0.0" });

    coordinator = new CliHookPluginCoordinator(
      {
        adapters: new Map([["codex", stub.adapter]]),
        settingsPath,
        envContext: () => ({ envKind: "wsl", wslDistro: "Ubuntu" }),
      },
      () => undefined,
    );

    const result = await coordinator.installPlugin({
      agentKind: "codex",
      env: {
        kind: "wsl",
        distro: "Ubuntu",
      },
    });

    expect(stub.installPlugin).toHaveBeenCalledTimes(1);
    expect(result.status.installed).toBe(true);
    expect(readCache(settingsPath)["codex::wsl::Ubuntu"]).toMatchObject({
      pluginVersion: "1.0.0",
      supportsL1: true,
    });
  });

  it("drops a stale failed in-memory auto-update promise when the persisted cache is later repaired", async () => {
    const stub = makeStubAdapter("codex");
    let installedVersion = "0.9.0";
    stub.isPluginInstalled.mockImplementation(async () => ({
      installed: true,
      version: installedVersion,
    }));
    stub.installPlugin.mockResolvedValue({ ok: false as const, reason: "transient install error" });

    coordinator = new CliHookPluginCoordinator(
      {
        adapters: new Map([["codex", stub.adapter]]),
        settingsPath,
        envContext: () => ({ envKind: "posix" }),
      },
      () => undefined,
    );
    coordinator.startIngress();

    const first = await coordinator.resolvePluginEnvForSpawn({
      threadId: "t1",
      agentKind: "codex",
    });
    expect(first).toBeUndefined();
    expect(stub.installPlugin).toHaveBeenCalledTimes(1);

    writeFileSync(
      settingsPath,
      JSON.stringify({
        agentHookSupport: {
          codex: {
            agentBinaryVersion: "n/a",
            pluginVersion: "1.0.0",
            protocolVersion: 1,
            platform: process.platform,
            verifiedAt: new Date().toISOString(),
            supportsL1: true,
          },
        },
      }),
      "utf8",
    );
    installedVersion = "1.0.0";

    const second = await coordinator.resolvePluginEnvForSpawn({
      threadId: "t2",
      agentKind: "codex",
    });
    expect(stub.installPlugin).toHaveBeenCalledTimes(1);
    expect(second).toBeDefined();
    expect(second!.env).toMatchObject({
      LIGHTCODE_THREAD_ID: "t2",
      LIGHTCODE_AGENT_KIND: "codex",
    });
  });

  it("retries support detection after a failed attempt when the environment changes in-session", async () => {
    const stub = makeStubAdapter("codex");
    let supported = false;
    let installed = false;
    stub.isPluginSupported.mockImplementation(async () => supported);
    stub.isPluginInstalled.mockImplementation(async () => ({
      installed,
      version: installed ? "1.0.0" : undefined,
    }));

    coordinator = new CliHookPluginCoordinator(
      {
        adapters: new Map([["codex", stub.adapter]]),
        settingsPath,
        envContext: () => ({ envKind: "wsl", wslDistro: "Ubuntu" }),
      },
      () => undefined,
    );
    coordinator.startIngress();

    const first = await coordinator.resolvePluginEnvForSpawn({
      threadId: "t1",
      agentKind: "codex",
      projectLocation: {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/u/x",
        uncPath: "\\\\wsl$\\Ubuntu\\home\\u\\x",
      },
    });
    expect(first).toBeUndefined();
    expect(stub.installPlugin).not.toHaveBeenCalled();

    supported = true;
    installed = true;

    const second = await coordinator.resolvePluginEnvForSpawn({
      threadId: "t2",
      agentKind: "codex",
      projectLocation: {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/u/x",
        uncPath: "\\\\wsl$\\Ubuntu\\home\\u\\x",
      },
    });
    expect(stub.installPlugin).not.toHaveBeenCalled();
    expect(second).toBeUndefined();
    expect(readCache(settingsPath)["codex::wsl::Ubuntu"]).toMatchObject({
      supportsL1: true,
    });
  });

  it("resolves env vars for spawn when the CLI hook plugin path is healthy", async () => {
    const stub = makeStubAdapter("claude");
    stub.isPluginInstalled.mockResolvedValue({ installed: true, version: "1.0.0" });

    coordinator = new CliHookPluginCoordinator(
      {
        adapters: new Map([["claude", stub.adapter]]),
        settingsPath,
        envContext: () => ({ envKind: "posix" }),
      },
      () => undefined,
    );
    coordinator.startIngress();

    const resolved = await coordinator.resolvePluginEnvForSpawn({
      threadId: "thread-42",
      agentKind: "claude",
    });

    expect(resolved).toBeDefined();
    expect(resolved!.env).toMatchObject({
      LIGHTCODE_THREAD_ID: "thread-42",
      LIGHTCODE_AGENT_KIND: "claude",
      LIGHTCODE_HOOK_PROTOCOL_VERSION: "1",
    });
    expect(resolved!.env.LIGHTCODE_HOOK_URL).toMatch(/^http:\/\/127\.0\.0\.1:\d+/);
    expect(resolved!.env.LIGHTCODE_HOOK_SECRET).toMatch(/^[a-f0-9]+$/);
    expect(resolved!.extraArgs).toEqual(["--claude-marker"]);
  });

  it("uses a per-distro cache key in WSL so distros don't shadow each other", async () => {
    // Pre-seed cache for one WSL distro and verify a second distro still
    // gets a fresh install probe without auto-installing.
    writeFileSync(
      settingsPath,
      JSON.stringify({
        agentHookSupport: {
          "claude::wsl::Ubuntu": {
            agentBinaryVersion: "n/a",
            pluginVersion: "1.0.0",
            protocolVersion: 1,
            platform: process.platform,
            verifiedAt: new Date().toISOString(),
            supportsL1: true,
          },
        },
      }),
      "utf8",
    );

    const stub = makeStubAdapter("claude");
    // Track install state per distro so the cached distro short-circuits
    // while the uncached one is detected as missing.
    const installedPerDistro = new Map<string | undefined, boolean>([
      ["Ubuntu", true],
      ["Debian", false],
    ]);
    stub.isPluginInstalled.mockImplementation(async (ctx: AgentEnvContext) => ({
      installed: installedPerDistro.get(ctx.wslDistro) ?? false,
      version: "1.0.0",
    }));

    coordinator = new CliHookPluginCoordinator(
      {
        adapters: new Map([["claude", stub.adapter]]),
        settingsPath,
        envContext: (_kind, location) =>
          location?.kind === "wsl"
            ? { envKind: "wsl", wslDistro: location.distro }
            : { envKind: "posix" },
      },
      () => undefined,
    );

    // Cached distro: install MUST NOT run.
    await coordinator.resolvePluginEnvForSpawn({
      threadId: "t-ubuntu",
      agentKind: "claude",
      projectLocation: {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/u/x",
        uncPath: "\\\\wsl$\\Ubuntu\\home\\u\\x",
      },
    });
    expect(stub.installPlugin).not.toHaveBeenCalled();

    // New distro: cache key differs, but a missing plugin still stays opt-in.
    const debianResolved = await coordinator.resolvePluginEnvForSpawn({
      threadId: "t-debian",
      agentKind: "claude",
      projectLocation: {
        kind: "wsl",
        distro: "Debian",
        linuxPath: "/home/u/y",
        uncPath: "\\\\wsl$\\Debian\\home\\u\\y",
      },
    });
    expect(debianResolved).toBeUndefined();
    expect(stub.installPlugin).not.toHaveBeenCalled();

    const cache = readCache(settingsPath);
    expect(cache).toHaveProperty("claude::wsl::Ubuntu");
    expect(cache).not.toHaveProperty("claude::wsl::Debian");
    // Native key MUST stay untouched.
    expect(cache).not.toHaveProperty("claude");
  });

  it("routes WSL spawns through the WslBridgeServer instead of HookIngress", async () => {
    const stub = makeStubAdapter("claude");
    stub.isPluginInstalled.mockResolvedValue({ installed: true, version: "1.0.0" });

    const ensureBridge = vi.fn<
      (distro: string) => Promise<{ baseUrl: string; hookUrl: string; secret: string } | undefined>
    >(async (_distro: string) => ({
      baseUrl: "http://127.0.0.1:55501",
      hookUrl: "http://127.0.0.1:55501/v1/agent-event",
      secret: "topsecret",
    }));
    const wslHookBridge = {
      ensureBridge,
      dispose: vi.fn<() => Promise<void>>(async () => undefined),
    } as unknown as WslBridgeServer;

    coordinator = new CliHookPluginCoordinator(
      {
        adapters: new Map([["claude", stub.adapter]]),
        settingsPath,
        envContext: (_kind, location) =>
          location?.kind === "wsl"
            ? { envKind: "wsl", wslDistro: location.distro }
            : { envKind: "posix" },
        wslHookBridge,
      },
      () => undefined,
    );
    coordinator.startIngress();

    const resolved = await coordinator.resolvePluginEnvForSpawn({
      threadId: "t-ubuntu",
      agentKind: "claude",
      projectLocation: {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/u/x",
        uncPath: "\\\\wsl$\\Ubuntu\\home\\u\\x",
      },
    });

    expect(ensureBridge).toHaveBeenCalledWith("Ubuntu");
    expect(resolved).toBeDefined();
    expect(resolved!.env.LIGHTCODE_HOOK_URL).toBe("http://127.0.0.1:55501/v1/agent-event");
    // Secret + protocol still come from the supervisor ingress so both
    // transports authenticate against the same token.
    expect(resolved!.env.LIGHTCODE_HOOK_SECRET).toMatch(/^[a-f0-9]+$/);
    expect(resolved!.env.LIGHTCODE_HOOK_PROTOCOL_VERSION).toBe("1");
  });

  it("falls back to L2 when the WSL bridge is unavailable for the distro", async () => {
    const stub = makeStubAdapter("claude");
    stub.isPluginInstalled.mockResolvedValue({ installed: true, version: "1.0.0" });

    const wslHookBridge = {
      ensureBridge: vi.fn<
        (
          distro: string,
        ) => Promise<{ baseUrl: string; hookUrl: string; secret: string } | undefined>
      >(async () => undefined),
      dispose: vi.fn<() => Promise<void>>(async () => undefined),
    } as unknown as WslBridgeServer;

    coordinator = new CliHookPluginCoordinator(
      {
        adapters: new Map([["claude", stub.adapter]]),
        settingsPath,
        envContext: (_kind, location) =>
          location?.kind === "wsl"
            ? { envKind: "wsl", wslDistro: location.distro }
            : { envKind: "posix" },
        wslHookBridge,
      },
      () => undefined,
    );
    coordinator.startIngress();

    const resolved = await coordinator.resolvePluginEnvForSpawn({
      threadId: "t1",
      agentKind: "claude",
      projectLocation: {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/u/x",
        uncPath: "\\\\wsl$\\Ubuntu\\home\\u\\x",
      },
    });
    expect(resolved).toBeUndefined();
  });

  it("skips CLI hook plugin entirely for server-controlled (ACP/SDK) adapters", async () => {
    // ACP/SDK/server agents carry their own status channel. The coordinator
    // must not install the plugin nor return env/args for them — otherwise
    // the dispatcher would get duplicate signals.
    const stub = makeStubAdapter("codex", { liveInputMode: "server" });

    coordinator = new CliHookPluginCoordinator(
      {
        adapters: new Map([["codex", stub.adapter]]),
        settingsPath,
        envContext: () => ({ envKind: "posix" }),
      },
      () => undefined,
    );
    coordinator.startIngress();
    await coordinator.installAll();

    // installAll should short-circuit before the adapter's install hook.
    expect(stub.installPlugin).not.toHaveBeenCalled();
    expect(stub.isPluginInstalled).not.toHaveBeenCalled();

    const resolved = await coordinator.resolvePluginEnvForSpawn({
      threadId: "t1",
      agentKind: "codex",
    });
    expect(resolved).toBeUndefined();

    // Cache must stay empty — a future version bump of the adapter
    // shouldn't trigger a re-probe for a mode it doesn't support.
    // If the settings file wasn't written at all, that's equivalent to
    // an empty cache (the coordinator had no keys worth persisting).
    const cacheForAssertion = existsSync(settingsPath) ? readCache(settingsPath) : {};
    expect(cacheForAssertion).toEqual({});
  });

  it("returns undefined for agents without a CLI hook plugin slice", async () => {
    // Adapter without any plugin-related fields.
    const adapter = { kind: "fake-agent", label: "Fake Agent" } as unknown as AgentAdapter;

    coordinator = new CliHookPluginCoordinator(
      {
        adapters: new Map([["fake-agent", adapter]]),
        settingsPath,
        envContext: () => ({ envKind: "posix" }),
      },
      () => undefined,
    );
    coordinator.startIngress();

    const resolved = await coordinator.resolvePluginEnvForSpawn({
      threadId: "t1",
      agentKind: "fake-agent",
    });
    expect(resolved).toBeUndefined();
  });

  it("explicitly installs codex and writes a cache entry", async () => {
    const stub = makeStubAdapter("codex");
    stub.isPluginInstalled.mockResolvedValue({ installed: true, version: "1.0.0" });

    coordinator = new CliHookPluginCoordinator(
      {
        adapters: new Map([["codex", stub.adapter]]),
        settingsPath,
        envContext: () => ({ envKind: "posix" }) as AgentEnvContext,
      },
      () => undefined,
    );
    const result = await coordinator.installPlugin({
      agentKind: "codex",
      env: { kind: "native" },
    });

    expect(stub.installPlugin).toHaveBeenCalledTimes(1);
    expect(result.status).toMatchObject({
      agentKind: "codex",
      installed: true,
      version: "1.0.0",
      bundledVersion: "1.0.0",
      canUninstall: true,
    });
    const entry = readCache(settingsPath)["codex"] as Record<string, unknown>;
    expect(entry).toMatchObject({
      pluginVersion: "1.0.0",
      protocolVersion: 1,
      platform: process.platform,
      supportsL1: true,
    });
  });

  it("explicitly uninstalls codex and clears its cache entry", async () => {
    writeFileSync(
      settingsPath,
      JSON.stringify({
        agentHookSupport: {
          codex: {
            agentBinaryVersion: "n/a",
            pluginVersion: "1.0.0",
            protocolVersion: 1,
            platform: process.platform,
            verifiedAt: new Date().toISOString(),
            supportsL1: true,
          },
        },
      }),
      "utf8",
    );

    const stub = makeStubAdapter("codex");
    stub.isPluginInstalled.mockResolvedValue({ installed: false });

    coordinator = new CliHookPluginCoordinator(
      {
        adapters: new Map([["codex", stub.adapter]]),
        settingsPath,
        envContext: () => ({ envKind: "posix" }) as AgentEnvContext,
      },
      () => undefined,
    );
    const result = await coordinator.uninstallPlugin({
      agentKind: "codex",
      env: { kind: "native" },
    });

    expect(stub.uninstallPlugin).toHaveBeenCalledTimes(1);
    expect(result.status.installed).toBe(false);
    expect(readCache(settingsPath)).not.toHaveProperty("codex");
  });

  it("resolves Codex spawn env with LIGHTCODE_AGENT_KIND=codex", async () => {
    const stub = makeStubAdapter("codex");
    stub.isPluginInstalled.mockResolvedValue({ installed: true, version: "1.0.0" });

    coordinator = new CliHookPluginCoordinator(
      {
        adapters: new Map([["codex", stub.adapter]]),
        settingsPath,
        envContext: () => ({ envKind: "posix" }),
      },
      () => undefined,
    );
    coordinator.startIngress();

    const resolved = await coordinator.resolvePluginEnvForSpawn({
      threadId: "thread-codex",
      agentKind: "codex",
    });

    expect(resolved).toBeDefined();
    expect(resolved!.env).toMatchObject({
      LIGHTCODE_THREAD_ID: "thread-codex",
      LIGHTCODE_AGENT_KIND: "codex",
      LIGHTCODE_HOOK_PROTOCOL_VERSION: "1",
    });
    expect(resolved!.extraArgs).toEqual(["--codex-marker"]);
  });

  it("resolves Gemini spawn env with LIGHTCODE_AGENT_KIND=gemini and provider settings path", async () => {
    const stub = makeStubAdapter("gemini", {
      pluginLaunchExtras: async () => ({
        env: {
          GEMINI_CLI_SYSTEM_SETTINGS_PATH: "/home/u/.lightcode/agent-plugins/gemini/settings.json",
        },
      }),
    });
    stub.isPluginInstalled.mockResolvedValue({ installed: true, version: "1.0.0" });

    coordinator = new CliHookPluginCoordinator(
      {
        adapters: new Map([["gemini", stub.adapter]]),
        settingsPath,
        envContext: () => ({ envKind: "posix" }),
      },
      () => undefined,
    );
    coordinator.startIngress();

    const resolved = await coordinator.resolvePluginEnvForSpawn({
      threadId: "thread-gemini",
      agentKind: "gemini",
    });

    expect(resolved).toBeDefined();
    expect(resolved!.env).toMatchObject({
      LIGHTCODE_THREAD_ID: "thread-gemini",
      LIGHTCODE_AGENT_KIND: "gemini",
      LIGHTCODE_HOOK_PROTOCOL_VERSION: "1",
      GEMINI_CLI_SYSTEM_SETTINGS_PATH: "/home/u/.lightcode/agent-plugins/gemini/settings.json",
    });
    expect(resolved!.extraArgs).toEqual([]);
  });

  it("does not persist a cache entry when install fails with the 0.0.0 sentinel", async () => {
    // Sentinel pluginVersion means `readBundled*PluginVersion()` couldn't
    // resolve the manifest at module load — an artifact of a half-initialized
    // environment, not a real negative verdict. The coordinator must skip the
    // cache write so the next app session retries with the correct version.
    const stub = makeStubAdapter("codex", { pluginVersion: "0.0.0" });
    stub.installPlugin.mockResolvedValue({
      ok: false as const,
      reason: "codex plugin source dir not found",
    });

    coordinator = new CliHookPluginCoordinator(
      {
        adapters: new Map([["codex", stub.adapter]]),
        settingsPath,
        envContext: () => ({ envKind: "posix" }),
      },
      () => undefined,
    );
    await coordinator.installAll();

    expect(stub.installPlugin).not.toHaveBeenCalled();
    const cacheForAssertion = existsSync(settingsPath) ? readCache(settingsPath) : {};
    expect(cacheForAssertion["codex"]).toBeUndefined();
  });

  it("does not retry auto-install on the next spawn when cache is empty", async () => {
    // Self-heal scenario: the first attempt hit the 0.0.0 sentinel (no cache
    // write), then the manifest became resolvable (e.g. tsdown rebuild). The
    // next spawn must still leave hook activation to the explicit install path.
    const stub = makeStubAdapter("codex", { pluginVersion: "0.0.0" });
    stub.isPluginInstalled.mockResolvedValue({ installed: false });

    coordinator = new CliHookPluginCoordinator(
      {
        adapters: new Map([["codex", stub.adapter]]),
        settingsPath,
        envContext: () => ({ envKind: "posix" }),
      },
      () => undefined,
    );
    coordinator.startIngress();

    await coordinator.installAll();
    const afterBoot = existsSync(settingsPath) ? readCache(settingsPath) : {};
    expect(afterBoot["codex"]).toBeUndefined();

    const resolved = await coordinator.resolvePluginEnvForSpawn({
      threadId: "thread-codex-retry",
      agentKind: "codex",
    });
    expect(stub.installPlugin).not.toHaveBeenCalled();
    expect(resolved).toBeUndefined();
  });

  it("treats cached 0.0.0 entries as stale and updates installed plugins", async () => {
    // A prior session wrote a poisoned cache entry with the sentinel version
    // (e.g. plugin.json wasn't resolvable at that moment). On next boot with
    // the same sentinel, the entry must NOT satisfy the cache hit check.
    writeFileSync(
      settingsPath,
      JSON.stringify({
        agentHookSupport: {
          codex: {
            agentBinaryVersion: "n/a",
            pluginVersion: "0.0.0",
            protocolVersion: 1,
            platform: process.platform,
            verifiedAt: new Date().toISOString(),
            supportsL1: false,
          },
        },
      }),
      "utf8",
    );

    const stub = makeStubAdapter("codex", { pluginVersion: "0.0.0" });
    stub.installPlugin.mockResolvedValue({ ok: true as const, version: "1.0.0" });
    stub.isPluginInstalled.mockResolvedValue({ installed: true, version: "0.9.0" });

    coordinator = new CliHookPluginCoordinator(
      {
        adapters: new Map([["codex", stub.adapter]]),
        settingsPath,
        envContext: () => ({ envKind: "posix" }),
      },
      () => undefined,
    );
    await coordinator.installAll();

    expect(stub.installPlugin).toHaveBeenCalledTimes(1);
    const entry = readCache(settingsPath)["codex"] as Record<string, unknown>;
    expect(entry).toMatchObject({
      pluginVersion: "1.0.0",
      supportsL1: true,
    });
  });
});
