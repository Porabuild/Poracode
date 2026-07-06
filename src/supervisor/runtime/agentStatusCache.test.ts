import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import { resolveLightcodePaths } from "@/shared/lightcodePaths";
import type { AgentAdapter } from "../agents/base";
import { detectWslAgentStatuses, SupervisorRuntime } from "../supervisorRuntime";
import { STATUS_CACHE_VERSION } from "./agentStatusService";

const tempDirs: string[] = [];
const runtimesToDispose: SupervisorRuntime[] = [];
const lightcodeDataDirBeforeTests = process.env.LIGHTCODE_DATA_DIR;

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "lightcode-runtime-status-"));
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
  if (lightcodeDataDirBeforeTests === undefined) {
    delete process.env.LIGHTCODE_DATA_DIR;
  } else {
    process.env.LIGHTCODE_DATA_DIR = lightcodeDataDirBeforeTests;
  }
  vi.useRealTimers();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("agent status cache", () => {
  it("migrates stale cached settingDefs to current schema", () => {
    const dataDir = makeTempDir();
    process.env.LIGHTCODE_DATA_DIR = dataDir;

    const { cacheDir, statusCachePath } = resolveLightcodePaths(dataDir);
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
    process.env.LIGHTCODE_DATA_DIR = dataDir;

    const { cacheDir, statusCachePath } = resolveLightcodePaths(dataDir);
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
    expect(detectInstall).toHaveBeenNthCalledWith(1, { envKind: "wsl", wslDistro: "Ubuntu" });
    expect(detectInstall).toHaveBeenNthCalledWith(2, { envKind: "wsl", wslDistro: "Debian" });
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
