import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import { resolvePoracodePaths } from "@/shared/poracodePaths";
import type { AgentAdapter } from "../agents/base";
import { detectWslAgentStatuses, SupervisorRuntime } from "../supervisorRuntime";
import { STATUS_CACHE_VERSION } from "./agentStatusService";

const tempDirs: string[] = [];
const runtimesToDispose: SupervisorRuntime[] = [];
const poracodeDataDirBeforeTests = process.env.PORACODE_DATA_DIR;

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "poracode-runtime-status-"));
  tempDirs.push(dir);
  return dir;
}

function makeRuntime(emit: ConstructorParameters<typeof SupervisorRuntime>[0]): SupervisorRuntime {
  const runtime = new SupervisorRuntime(emit);
  runtimesToDispose.push(runtime);
  return runtime;
}

afterEach(() => {
  for (const runtime of runtimesToDispose.splice(0)) {
    runtime.dispose();
  }
  if (poracodeDataDirBeforeTests === undefined) {
    delete process.env.PORACODE_DATA_DIR;
  } else {
    process.env.PORACODE_DATA_DIR = poracodeDataDirBeforeTests;
  }
  vi.useRealTimers();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("agent status cache", () => {
  it("invalidates v11 caches produced before successful ACP sessions established auth", () => {
    const dataDir = makeTempDir();
    process.env.PORACODE_DATA_DIR = dataDir;

    const { cacheDir, statusCachePath } = resolvePoracodePaths(dataDir);
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      statusCachePath,
      JSON.stringify({
        version: 11,
        windows: [
          {
            kind: "acp-generic:example",
            label: "Example ACP",
            installed: true,
            authState: "missing",
            authMethods: [{ id: "login", name: "Login" }],
            capabilities: { models: [] },
          },
        ],
      }),
    );

    const runtime = makeRuntime(() => {});
    const cached = (
      runtime.agentStatusService as unknown as {
        readCachedStatuses: (wslDistros: readonly string[]) => {
          windows: AgentStatus[];
          wsl: AgentStatus[];
          fromCache: boolean;
        };
      }
    ).readCachedStatuses([]);

    expect(cached).toEqual({ windows: [], wsl: [], fromCache: false });
  });

  it("invalidates v9 caches produced without the Grok login-shell environment", () => {
    const dataDir = makeTempDir();
    process.env.PORACODE_DATA_DIR = dataDir;

    const { cacheDir, statusCachePath } = resolvePoracodePaths(dataDir);
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      statusCachePath,
      JSON.stringify({
        version: 9,
        windows: [
          {
            kind: "grok",
            label: "Grok Build",
            installed: true,
            authState: "authenticated",
            capabilities: { models: [] },
          },
        ],
      }),
    );

    const runtime = makeRuntime(() => {});
    const cached = (
      runtime.agentStatusService as unknown as {
        readCachedStatuses: (wslDistros: readonly string[]) => {
          windows: AgentStatus[];
          wsl: AgentStatus[];
          fromCache: boolean;
        };
      }
    ).readCachedStatuses([]);

    expect(cached).toEqual({ windows: [], wsl: [], fromCache: false });
  });

  it("invalidates v13 caches whose terminal auth methods lack baseSpawnEnv-derived env", () => {
    // Pre-v14 statuses assembled terminal auth methods WITHOUT the provider's
    // baseSpawnEnv (antigravity's `AGY_CLI_DISABLE_AUTO_UPDATE` did not exist
    // on the method). Serving that stale status would build the `agy` login
    // command without the opt-out — the stray-updater window the v14
    // derivation exists to prevent.
    const dataDir = makeTempDir();
    process.env.PORACODE_DATA_DIR = dataDir;

    const { cacheDir, statusCachePath } = resolvePoracodePaths(dataDir);
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      statusCachePath,
      JSON.stringify({
        version: 13,
        windows: [
          {
            kind: "antigravity",
            label: "Antigravity",
            installed: true,
            authState: "missing",
            authMethods: [{ id: "antigravity-login", name: "Antigravity login", type: "terminal" }],
            capabilities: { models: [] },
          },
        ],
      }),
    );

    const runtime = makeRuntime(() => {});
    const cached = (
      runtime.agentStatusService as unknown as {
        readCachedStatuses: (wslDistros: readonly string[]) => {
          windows: AgentStatus[];
          wsl: AgentStatus[];
          fromCache: boolean;
        };
      }
    ).readCachedStatuses([]);

    expect(cached).toEqual({ windows: [], wsl: [], fromCache: false });
  });

  it("invalidates v14 caches produced before ACP thinking capabilities", () => {
    const dataDir = makeTempDir();
    process.env.PORACODE_DATA_DIR = dataDir;

    const { cacheDir, statusCachePath } = resolvePoracodePaths(dataDir);
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      statusCachePath,
      JSON.stringify({
        version: 14,
        windows: [
          {
            kind: "qwen",
            label: "Qwen Code",
            installed: true,
            authState: "authenticated",
            capabilities: { models: [{ id: "qwen3.7-plus", label: "Qwen3.7 Plus" }] },
          },
        ],
      }),
    );

    const runtime = makeRuntime(() => {});
    const cached = (
      runtime.agentStatusService as unknown as {
        readCachedStatuses: (wslDistros: readonly string[]) => {
          windows: AgentStatus[];
          wsl: AgentStatus[];
          fromCache: boolean;
        };
      }
    ).readCachedStatuses([]);

    expect(cached).toEqual({ windows: [], wsl: [], fromCache: false });
  });

  it("invalidates v17 caches that grouped Cursor Grok under Other models", () => {
    const dataDir = makeTempDir();
    process.env.PORACODE_DATA_DIR = dataDir;

    const { cacheDir, statusCachePath } = resolvePoracodePaths(dataDir);
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      statusCachePath,
      JSON.stringify({
        version: 17,
        windows: [
          {
            kind: "cursor",
            label: "Cursor",
            installed: true,
            authState: "authenticated",
            capabilities: {
              models: [{ id: "grok-4.6", label: "Cursor Grok 4.6" }],
              modelSubProvider: { "grok-4.6": "other" },
            },
          },
        ],
      }),
    );

    const runtime = makeRuntime(() => {});
    const cached = (
      runtime.agentStatusService as unknown as {
        readCachedStatuses: (wslDistros: readonly string[]) => {
          windows: AgentStatus[];
          wsl: AgentStatus[];
          fromCache: boolean;
        };
      }
    ).readCachedStatuses([]);

    expect(STATUS_CACHE_VERSION).toBe(25);
    expect(cached).toEqual({ windows: [], wsl: [], fromCache: false });
  });

  it("invalidates v18 caches holding Command Code's curated fallback models", () => {
    const dataDir = makeTempDir();
    process.env.PORACODE_DATA_DIR = dataDir;

    const { cacheDir, statusCachePath } = resolvePoracodePaths(dataDir);
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      statusCachePath,
      JSON.stringify({
        version: 18,
        windows: [
          {
            kind: "commandcode",
            label: "Command Code",
            installed: true,
            authState: "authenticated",
            capabilities: {
              models: [
                { id: "deepseek/deepseek-v4-pro", label: "DeepSeek V4 Pro" },
                { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash" },
              ],
              modelEfforts: { "deepseek/deepseek-v4-flash": ["high", "max"] },
              defaultEffort: "high",
            },
          },
        ],
      }),
    );

    const runtime = makeRuntime(() => {});
    const cached = (
      runtime.agentStatusService as unknown as {
        readCachedStatuses: (wslDistros: readonly string[]) => {
          windows: AgentStatus[];
          wsl: AgentStatus[];
          fromCache: boolean;
        };
      }
    ).readCachedStatuses([]);

    expect(STATUS_CACHE_VERSION).toBe(25);
    expect(cached).toEqual({ windows: [], wsl: [], fromCache: false });
  });

  it("invalidates v19 caches probed under kind-global agent settings", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "poracode-cache-"));
    process.env.PORACODE_DATA_DIR = dataDir;

    const { cacheDir, statusCachePath } = resolvePoracodePaths(dataDir);
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      statusCachePath,
      JSON.stringify({
        version: 19,
        windows: [
          {
            kind: "cursor",
            label: "Cursor",
            installed: true,
            authState: "authenticated",
            capabilities: { models: [] },
          },
        ],
      }),
    );

    const runtime = makeRuntime(() => {});
    const cached = (
      runtime.agentStatusService as unknown as {
        readCachedStatuses: (wslDistros: readonly string[]) => {
          windows: AgentStatus[];
          wsl: AgentStatus[];
          fromCache: boolean;
        };
      }
    ).readCachedStatuses([]);

    // Detection now resolves per-machine agent-setting overrides
    // (machineSettings), so pre-v20 statuses must be re-probed.
    expect(cached).toEqual({ windows: [], wsl: [], fromCache: false });
  });

  it("invalidates v20 terminal-only Antigravity caches", () => {
    const dataDir = makeTempDir();
    process.env.PORACODE_DATA_DIR = dataDir;
    const { cacheDir, statusCachePath } = resolvePoracodePaths(dataDir);
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      statusCachePath,
      JSON.stringify({
        version: 20,
        windows: [
          {
            kind: "antigravity",
            label: "Antigravity",
            installed: true,
            authState: "authenticated",
            capabilities: {
              models: [{ id: "auto", label: "Auto" }],
              presentationModes: ["terminal"],
            },
          },
        ],
      }),
    );

    const runtime = makeRuntime(() => {});
    const cached = (
      runtime.agentStatusService as unknown as {
        readCachedStatuses: (wslDistros: readonly string[]) => {
          windows: AgentStatus[];
          wsl: AgentStatus[];
          fromCache: boolean;
        };
      }
    ).readCachedStatuses([]);

    expect(STATUS_CACHE_VERSION).toBe(25);
    expect(cached).toEqual({ windows: [], wsl: [], fromCache: false });
  });

  it("invalidates v22 native terminal-only Muse statuses", () => {
    const dataDir = makeTempDir();
    process.env.PORACODE_DATA_DIR = dataDir;
    const { cacheDir, statusCachePath } = resolvePoracodePaths(dataDir);
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      statusCachePath,
      JSON.stringify({
        version: 22,
        windows: [
          {
            kind: "muse",
            label: "Muse Code",
            installed: false,
            capabilities: { presentationModes: ["terminal"] },
            envKind: "windows",
          },
        ],
        wsl: [
          {
            kind: "muse",
            label: "Muse Code",
            installed: true,
            authState: "authenticated",
            capabilities: { presentationModes: ["terminal"] },
            envKind: "wsl",
            wslDistro: "Ubuntu",
          },
        ],
      }),
    );

    const runtime = makeRuntime(() => {});
    const cached = (
      runtime.agentStatusService as unknown as {
        readCachedStatuses: (wslDistros: readonly string[]) => {
          windows: AgentStatus[];
          wsl: AgentStatus[];
          fromCache: boolean;
        };
      }
    ).readCachedStatuses(["Ubuntu"]);

    expect(STATUS_CACHE_VERSION).toBe(25);
    expect(cached).toEqual({ windows: [], wsl: [], fromCache: false });
  });

  it("invalidates v23 ACP labels in both native and WSL caches", () => {
    const dataDir = makeTempDir();
    process.env.PORACODE_DATA_DIR = dataDir;
    const { cacheDir, statusCachePath } = resolvePoracodePaths(dataDir);
    mkdirSync(cacheDir, { recursive: true });
    const staleStatus = {
      kind: "acp-generic:example",
      label: "Example ACP",
      installed: true,
      capabilities: { models: [{ id: "gemini-2.5-pro", label: "2.5 Pro" }] },
    };
    writeFileSync(
      statusCachePath,
      JSON.stringify({
        version: 23,
        windows: [{ ...staleStatus, envKind: "windows" }],
        wsl: [{ ...staleStatus, envKind: "wsl", wslDistro: "Ubuntu" }],
      }),
    );
    const runtime = makeRuntime(() => {});
    const cached = (
      runtime.agentStatusService as unknown as {
        readCachedStatuses: (distros: readonly string[]) => unknown;
      }
    ).readCachedStatuses(["Ubuntu"]);
    expect(STATUS_CACHE_VERSION).toBe(25);
    expect(cached).toEqual({ windows: [], wsl: [], fromCache: false });
  });

  it("invalidates v24 terminal auth environments in native and WSL caches", () => {
    const dataDir = makeTempDir();
    process.env.PORACODE_DATA_DIR = dataDir;
    const { cacheDir, statusCachePath } = resolvePoracodePaths(dataDir);
    mkdirSync(cacheDir, { recursive: true });
    const staleStatus = {
      kind: "acp-generic:example",
      label: "Example ACP",
      installed: true,
      authState: "missing",
      capabilities: { models: [] },
      authMethods: [
        { type: "terminal", id: "login", name: "Login", env: { DISABLE_AUTO_UPDATE: "1" } },
      ],
    };
    writeFileSync(
      statusCachePath,
      JSON.stringify({
        version: 24,
        windows: [{ ...staleStatus, envKind: "windows" }],
        wsl: [{ ...staleStatus, envKind: "wsl", envDistro: "Ubuntu" }],
      }),
    );
    const runtime = makeRuntime(() => {});
    const cached = (
      runtime.agentStatusService as unknown as {
        readCachedStatuses: (distros: readonly string[]) => unknown;
      }
    ).readCachedStatuses(["Ubuntu"]);
    expect(STATUS_CACHE_VERSION).toBe(25);
    expect(cached).toEqual({ windows: [], wsl: [], fromCache: false });
  });

  it("migrates stale cached settingDefs to current schema", () => {
    const dataDir = makeTempDir();
    process.env.PORACODE_DATA_DIR = dataDir;

    const { cacheDir, statusCachePath } = resolvePoracodePaths(dataDir);
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      statusCachePath,
      JSON.stringify({
        version: STATUS_CACHE_VERSION,
        windows: [
          {
            kind: "claude",
            label: "Claude Code",
            installed: true,
            authState: "unknown",
            providerMetadata: {
              connectedProviders: [{ label: 123 }],
            },
            capabilities: {
              models: [{ id: "sonnet", label: "Sonnet" }],
              efforts: [],
              modelEfforts: {},
              modes: [],
              approvalPolicies: [],
              sandboxModes: [],
              supportsResume: true,
              supportsDirectInput: true,
              liveInputMode: "terminal",
              presentationMode: "terminal",
              settingDefs: [
                {
                  key: "legacy-toggle",
                  envVar: "CLAUDE_LEGACY_TOGGLE",
                  label: "Legacy toggle",
                  description: "Old format: no type, envVar string",
                  default: true,
                },
                {
                  key: "verbose-logging",
                  type: "toggle",
                  env: { CLAUDE_VERBOSE_LOGGING: "1" },
                  label: "Verbose logging",
                  description: "Already current format",
                  default: false,
                },
              ],
            },
          },
        ],
      }),
    );

    const emitted: unknown[] = [];
    const runtime = makeRuntime((event) => {
      emitted.push(event);
    });

    const cached = (
      runtime.agentStatusService as unknown as {
        readCachedStatuses: (wslDistros: readonly string[]) => {
          windows: unknown[];
          wsl: unknown[];
          fromCache: boolean;
        };
      }
    ).readCachedStatuses([]);

    expect(emitted).toEqual([]);
    expect(cached).toEqual({
      fromCache: true,
      windows: [
        {
          kind: "claude",
          label: "Claude Code",
          installed: true,
          authState: "unknown",
          update: {
            npm: "@anthropic-ai/claude-code",
            winget: "Anthropic.ClaudeCode",
            brew: "claude",
            builtIn: {
              binary: "claude",
              args: ["update"],
            },
          },
          capabilities: {
            models: [{ id: "sonnet", label: "Sonnet" }],
            efforts: [],
            modelEfforts: {},
            modes: [],
            approvalPolicies: [],
            sandboxModes: [],
            supportsResume: true,
            supportsDirectInput: true,
            liveInputMode: "terminal",
            presentationMode: "terminal",
            settingDefs: [
              {
                key: "legacy-toggle",
                type: "toggle",
                env: { CLAUDE_LEGACY_TOGGLE: "1" },
                label: "Legacy toggle",
                description: "Old format: no type, envVar string",
                default: true,
              },
              {
                key: "verbose-logging",
                type: "toggle",
                env: { CLAUDE_VERBOSE_LOGGING: "1" },
                label: "Verbose logging",
                description: "Already current format",
                default: false,
              },
            ],
            slashCommands: [
              {
                id: "goal",
                label: "goal — Set a goal — keep working until the condition is met",
                description: "Set a goal — keep working until the condition is met",
              },
            ],
          },
        },
      ],
      wsl: [],
    });
  });

  it("adds adapter default slash commands to stale cached statuses", () => {
    const dataDir = makeTempDir();
    process.env.PORACODE_DATA_DIR = dataDir;

    const { cacheDir, statusCachePath } = resolvePoracodePaths(dataDir);
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      statusCachePath,
      JSON.stringify({
        version: STATUS_CACHE_VERSION,
        windows: [
          {
            kind: "codex",
            label: "Codex",
            installed: true,
            authState: "authenticated",
            capabilities: {
              models: [{ id: "gpt-5.5", label: "5.5" }],
              efforts: ["low", "medium"],
              modelEfforts: {},
              modes: ["agent", "plan"],
              approvalPolicies: [],
              sandboxModes: [],
              supportsResume: true,
              supportsDirectInput: true,
              liveInputMode: "terminal",
              presentationMode: "terminal",
              presentationModes: ["terminal", "gui"],
              settingDefs: [],
            },
          },
        ],
      }),
    );

    const runtime = makeRuntime(() => {});
    const cached = (
      runtime.agentStatusService as unknown as {
        readCachedStatuses: (wslDistros: readonly string[]) => {
          windows: AgentStatus[];
          wsl: AgentStatus[];
          fromCache: boolean;
        };
      }
    ).readCachedStatuses([]);

    expect(cached.windows[0]?.capabilities.slashCommands?.map((command) => command.id)).toEqual(
      expect.arrayContaining(["status", "model", "review", "compact", "permissions"]),
    );
  });

  it("round-trips runtime variants and session routing through the disk cache schema", () => {
    const dataDir = makeTempDir();
    process.env.PORACODE_DATA_DIR = dataDir;

    const { cacheDir, statusCachePath } = resolvePoracodePaths(dataDir);
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      statusCachePath,
      JSON.stringify({
        version: STATUS_CACHE_VERSION,
        windows: [
          {
            kind: "cursor",
            label: "Cursor",
            installed: true,
            authState: "authenticated",
            capabilities: {},
            runtimeVariants: {
              sdk: {
                presentationMode: "gui",
                installed: false,
                authState: "unknown",
                authUsesProviderLogin: false,
                capabilities: {
                  models: [{ id: "sdk-model", label: "SDK Model" }],
                  liveInputMode: "server",
                  presentationMode: "gui",
                },
              },
            },
            sessionRuntimeRouting: {
              prefixes: { "sdk:": "sdk" },
              fallbackRuntime: "acp",
            },
          },
        ],
      }),
    );

    const runtime = makeRuntime(() => {});
    const cached = (
      runtime.agentStatusService as unknown as {
        readCachedStatuses: (wslDistros: readonly string[]) => {
          windows: AgentStatus[];
          wsl: AgentStatus[];
          fromCache: boolean;
        };
      }
    ).readCachedStatuses([]);

    expect(cached.windows[0]?.runtimeVariants?.sdk).toMatchObject({
      presentationMode: "gui",
      installed: false,
      authState: "unknown",
      authUsesProviderLogin: false,
      capabilities: {
        models: [{ id: "sdk-model", label: "SDK Model" }],
        liveInputMode: "server",
        presentationMode: "gui",
        settingDefs: [],
      },
    });
    expect(cached.windows[0]?.sessionRuntimeRouting).toEqual({
      prefixes: { "sdk:": "sdk" },
      fallbackRuntime: "acp",
    });
  });
});

describe("detectWslAgentStatuses", () => {
  const capabilities: AgentStatus["capabilities"] = {
    models: [],
    efforts: [],
    modelEfforts: {},
    modes: [],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "server",
    presentationMode: "terminal",
    settingDefs: [],
  };

  it("detects statuses for every adapter in every distro", async () => {
    const detectInstall = vi.fn<
      (ctx?: { envKind: "windows" | "wsl"; wslDistro?: string }) => Promise<{
        kind: "codex";
        label: string;
        installed: boolean;
        authState: "unknown";
        capabilities: {
          models: [];
          efforts: [];
          modelEfforts: {};
          modes: [];
          approvalPolicies: [];
          sandboxModes: [];
          supportsResume: true;
          supportsDirectInput: true;
          liveInputMode: "server";
          presentationMode: "terminal";
          settingDefs: [];
        };
      }>
    >(async (ctx?: { envKind: "windows" | "wsl"; wslDistro?: string }) => ({
      kind: "codex" as const,
      label: `Codex ${ctx?.wslDistro ?? "windows"}`,
      installed: ctx?.wslDistro === "Ubuntu",
      authState: "unknown" as const,
      capabilities: {
        models: [],
        efforts: [],
        modelEfforts: {},
        modes: [],
        approvalPolicies: [],
        sandboxModes: [],
        supportsResume: true,
        supportsDirectInput: true,
        liveInputMode: "server" as const,
        presentationMode: "terminal" as const,
        settingDefs: [],
      },
    }));

    const statuses = await detectWslAgentStatuses(
      [
        {
          kind: "codex",
          label: "Codex",
          capabilities: {
            models: [],
            efforts: [],
            modelEfforts: {},
            modes: [],
            approvalPolicies: [],
            sandboxModes: [],
            supportsResume: true,
            supportsDirectInput: true,
            liveInputMode: "server",
            presentationMode: "terminal",
            settingDefs: [],
          },
          detectInstall,
          buildLaunchArgv: vi
            .fn<() => { binary: string; args: string[] }>()
            .mockReturnValue({ binary: "codex", args: [] }),
          buildResumeArgv: vi
            .fn<() => { binary: string; args: string[] }>()
            .mockReturnValue({ binary: "codex", args: [] }),
          createInitialSessionRef: vi
            .fn<() => { providerSessionId: string; discoveredAt: string } | undefined>()
            .mockReturnValue(undefined),
        },
      ],
      ["Ubuntu", "Debian"],
    );

    expect(detectInstall).toHaveBeenCalledTimes(2);
    expect(detectInstall).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        envKind: "wsl",
        wslDistro: "Ubuntu",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(detectInstall).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        envKind: "wsl",
        wslDistro: "Debian",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(statuses).toEqual([
      expect.objectContaining({ envKind: "wsl", envDistro: "Ubuntu", installed: true }),
      expect.objectContaining({ envKind: "wsl", envDistro: "Debian", installed: false }),
    ]);
  });

  it("times out a stalled WSL adapter without blocking the status batch", async () => {
    vi.useFakeTimers();
    const stalledDetect = vi.fn<AgentAdapter["detectInstall"]>(
      () => new Promise<AgentStatus>(() => {}),
    );
    const readyDetect = vi.fn<AgentAdapter["detectInstall"]>().mockResolvedValue({
      kind: "codex",
      label: "Codex",
      installed: true,
      authState: "authenticated",
      capabilities,
    });
    const onStatus = vi.fn<(status: AgentStatus) => void>();

    const statusesPromise = detectWslAgentStatuses(
      [
        {
          kind: "opencode",
          label: "OpenCode",
          capabilities,
          detectInstall: stalledDetect,
          buildLaunchArgv: vi.fn<AgentAdapter["buildLaunchArgv"]>(),
          buildResumeArgv: vi.fn<AgentAdapter["buildResumeArgv"]>(),
          createInitialSessionRef: vi.fn<AgentAdapter["createInitialSessionRef"]>(),
        } as AgentAdapter,
        {
          kind: "codex",
          label: "Codex",
          capabilities,
          detectInstall: readyDetect,
          buildLaunchArgv: vi.fn<AgentAdapter["buildLaunchArgv"]>(),
          buildResumeArgv: vi.fn<AgentAdapter["buildResumeArgv"]>(),
          createInitialSessionRef: vi.fn<AgentAdapter["createInitialSessionRef"]>(),
        } as AgentAdapter,
      ],
      ["Ubuntu"],
      undefined,
      onStatus,
    );

    await vi.advanceTimersByTimeAsync(60_000);

    const statuses = await statusesPromise;
    expect(statuses).toEqual([
      expect.objectContaining({
        kind: "opencode",
        envKind: "wsl",
        envDistro: "Ubuntu",
        installed: false,
      }),
      expect.objectContaining({
        kind: "codex",
        envKind: "wsl",
        envDistro: "Ubuntu",
        installed: true,
      }),
    ]);
    expect(onStatus).toHaveBeenCalledTimes(2);
  });
});
