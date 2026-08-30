import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AcpRegistryListResult } from "@/shared/contracts";
import { REGISTRY_INSTALL_PROBE_TIMEOUT_MS } from "./acp-generic";

const probeAcpGenericInstanceMock = vi.hoisted(() =>
  vi
    .fn<
      (...args: unknown[]) => Promise<
        | {
            authState: string;
            authMethods: Array<{ id: string; name: string }>;
          }
        | undefined
      >
    >()
    .mockResolvedValue({
      authState: "missing",
      authMethods: [{ id: "login", name: "Login" }],
    }),
);

const execFileMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => void>((...args) => {
    const callback = args.at(-1);
    if (typeof callback !== "function") {
      throw new Error("Expected execFile callback");
    }
    (callback as (error: Error | null, stdout: string, stderr: string) => void)(null, "", "");
  }),
);

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, execFile: execFileMock };
});

const resolveWslHomeDirectoryAsyncMock = vi.hoisted(() =>
  vi.fn<(distro: string) => Promise<string | undefined>>().mockResolvedValue(undefined),
);

const batchWslCommandsAsyncMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>());

const toWslUncPathMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => string>());

vi.mock("./base", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./base")>();
  // Delegate to the real implementation unless a test overrides it, so WSL
  // command routing stays real except where a test drives the environment.
  batchWslCommandsAsyncMock.mockImplementation((...args: unknown[]) =>
    (actual.batchWslCommandsAsync as (...batchArgs: unknown[]) => unknown)(...args),
  );
  return {
    ...actual,
    resolveWslHomeDirectoryAsync: resolveWslHomeDirectoryAsyncMock,
    batchWslCommandsAsync: batchWslCommandsAsyncMock,
  };
});

vi.mock("@/shared/wsl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/wsl")>();
  toWslUncPathMock.mockImplementation((...args: unknown[]) =>
    (actual.toWslUncPath as (...uncArgs: unknown[]) => string)(...args),
  );
  return { ...actual, toWslUncPath: toWslUncPathMock };
});

vi.mock("./acp-generic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./acp-generic")>();
  return {
    ...actual,
    probeAcpGenericInstance: probeAcpGenericInstanceMock,
  };
});

import {
  autoUpdateAcpRegistryAgents,
  backfillAcpRegistryAgentIcons,
  cacheLocalAcpRegistryIcons,
  installAcpRegistryAgent,
  persistAcpRegistrySettingsMigrations,
  readAcpRegistrySettings,
  removeAcpRegistryAgent,
  setAcpGenericAgentAuthAcknowledged,
  setAcpRegistryAgentAuth,
  updateAcpRegistryAgent,
  wslAcpRegistryAgentInstallDir,
} from "./acpRegistry";
import { isEncryptedSecret } from "../secretStorage";

describe("ACP registry installs", () => {
  beforeEach(() => {
    execFileMock.mockClear();
    probeAcpGenericInstanceMock.mockClear();
    batchWslCommandsAsyncMock.mockClear();
    toWslUncPathMock.mockClear();
  });

  it("still removes an agent when a recorded WSL distro can no longer be resolved", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-acp-remove-"));
    const settingsPath = join(dir, "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        agentInstances: {
          "codex-acp": { id: "codex-acp", driver: "acp-generic", config: { binary: "codex-acp" } },
        },
        acpRegistryInstalledAgents: {
          "codex-acp": {
            id: "codex-acp",
            name: "Codex ACP",
            version: "1.0.0",
            installedAt: new Date(0).toISOString(),
            adapterKind: "acp-generic:codex-acp",
            installKind: "generic",
            installations: {
              wsl: { Ubuntu: { version: "1.0.0", target: "linux-x86_64", installedAt: "now" } },
            },
          },
        },
      }),
      "utf8",
    );
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    resolveWslHomeDirectoryAsyncMock.mockResolvedValueOnce(undefined);
    try {
      // A deleted distro must not strand the agent in settings forever.
      const installed = await removeAcpRegistryAgent({
        agentId: "codex-acp",
        baseDir: dir,
        settingsPath,
      });

      expect(installed).toEqual([]);
      expect(readAcpRegistrySettings(settingsPath).agentInstances["codex-acp"]).toBeUndefined();
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
    }
  });

  it("resolves the distro-local agent root used to remove WSL registry artifacts", () => {
    expect(wslAcpRegistryAgentInstallDir("Ubuntu", "/home/demo", "antigravity-acp")).toBe(
      "\\\\wsl.localhost\\Ubuntu\\home\\demo\\.poracode\\acp-registry\\antigravity-acp",
    );
  });

  const nativeTarget = `${
    process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "windows" : "linux"
  }-${process.arch === "arm64" ? "aarch64" : "x86_64"}`;

  function antigravityRegistry(version: string): AcpRegistryListResult {
    return {
      version: "1.0.0",
      agents: [
        {
          id: "antigravity-acp",
          name: "Google Antigravity",
          version,
          description: "Official Antigravity ACP server",
          authors: ["Google LLC"],
          license: "proprietary",
          distribution: {
            binary: {
              [nativeTarget]: {
                archive: `https://dl.google.com/antigravity/antigravity-acp-${version}.zip`,
                cmd: process.platform === "win32" ? "./agy_acp_server.exe" : "./agy_acp_server.par",
                ...(process.platform === "linux" ? { args: ["--uid="] } : {}),
              },
            },
          },
        },
      ],
    };
  }

  it("fresh-installs the official Antigravity ACP artifact as a first-class runtime", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-antigravity-acp-"));
    const settingsPath = join(dir, "settings.json");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([1]), { status: 200 })),
    );
    try {
      const installed = await installAcpRegistryAgent({
        agentId: "antigravity-acp",
        baseDir: dir,
        settingsPath,
        iconsDir: join(dir, "acp-icons"),
        registry: antigravityRegistry("1.0.0"),
        adapterKind: "antigravity",
        installKind: "first-class",
      });

      expect(installed).toMatchObject([
        {
          id: "antigravity-acp",
          version: "1.0.0",
          adapterKind: "antigravity",
          installKind: "first-class",
          installations: { native: { version: "1.0.0", target: nativeTarget } },
        },
      ]);
      expect(readAcpRegistrySettings(settingsPath).agentInstances["antigravity-acp"]).toMatchObject(
        {
          driver: "acp-generic",
          config: {
            environmentCommands: { native: { version: "1.0.0" } },
          },
        },
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("records a removal opt-out and clears it on the next install", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-antigravity-acp-optout-"));
    const settingsPath = join(dir, "settings.json");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([1]), { status: 200 })),
    );
    try {
      const install = () =>
        installAcpRegistryAgent({
          agentId: "antigravity-acp",
          baseDir: dir,
          settingsPath,
          iconsDir: join(dir, "acp-icons"),
          registry: antigravityRegistry("1.0.0"),
          adapterKind: "antigravity",
          installKind: "first-class",
        });
      await install();
      await removeAcpRegistryAgent({ agentId: "antigravity-acp", baseDir: dir, settingsPath });

      // Auto-install reads this list, so a manual removal has to stick.
      expect(readAcpRegistrySettings(settingsPath).acpRegistryAutoInstallOptOuts).toEqual([
        "antigravity-acp",
      ]);

      await install();

      expect(readAcpRegistrySettings(settingsPath).acpRegistryAutoInstallOptOuts).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("preserves concurrent settings and honors an opt-out added during auto-install", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-antigravity-acp-race-"));
    const settingsPath = join(dir, "settings.json");
    let finishProbe: (() => void) | undefined;
    probeAcpGenericInstanceMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishProbe = () =>
            resolve({
              authState: "missing",
              authMethods: [{ id: "login", name: "Login" }],
            });
        }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([1]), { status: 200 })),
    );
    try {
      const install = installAcpRegistryAgent({
        agentId: "antigravity-acp",
        baseDir: dir,
        settingsPath,
        iconsDir: join(dir, "acp-icons"),
        registry: antigravityRegistry("1.0.0"),
        adapterKind: "antigravity",
        installKind: "first-class",
        respectAutoInstallOptOut: true,
      });
      await vi.waitFor(() => expect(finishProbe).toBeTypeOf("function"));
      writeFileSync(
        settingsPath,
        JSON.stringify({
          collapseTerminalComposer: true,
          acpRegistryAutoInstallOptOuts: ["antigravity-acp"],
        }),
        "utf8",
      );
      finishProbe?.();

      await expect(install).rejects.toThrow("auto-install was disabled");
      const settings = readAcpRegistrySettings(settingsPath);
      expect(settings.collapseTerminalComposer).toBe(true);
      expect(settings.acpRegistryAutoInstallOptOuts).toEqual(["antigravity-acp"]);
      expect(settings.acpRegistryInstalledAgents).toEqual({});
      expect(settings.agentInstances).toEqual({});
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("persists adoption of an existing generic Antigravity ACP install", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-antigravity-acp-migration-"));
    const settingsPath = join(dir, "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        acpRegistryInstalledAgents: {
          "antigravity-acp": {
            id: "antigravity-acp",
            name: "Google Antigravity",
            version: "1.0.0",
            installedAt: "2026-08-01T00:00:00.000Z",
            adapterKind: "acp-generic:antigravity-acp",
            installKind: "generic",
          },
        },
        agentInstances: {
          "antigravity-acp": {
            id: "antigravity-acp",
            driver: "acp-generic",
            version: "1.0.0",
            config: { binary: "agy_acp_server.par", authMode: "none" },
          },
          unrelated: {
            id: "unrelated",
            driver: "acp-generic",
            environment: {
              API_KEY: { value: "lc-safe:v1:invalid:payload", sensitive: true },
            },
            config: { binary: "unrelated" },
          },
        },
        providerConfigs: { "acp-generic:antigravity-acp": { model: "gemini" } },
      }),
    );

    expect(persistAcpRegistrySettingsMigrations(settingsPath)).toBe(true);
    const migrated = readAcpRegistrySettings(settingsPath);
    expect(migrated.acpRegistryInstalledAgents["antigravity-acp"]).toMatchObject({
      adapterKind: "antigravity",
      installKind: "first-class",
    });
    expect(migrated.providerConfigs.antigravity).toMatchObject({ model: "gemini" });
    expect(migrated.providerConfigs["acp-generic:antigravity-acp"]).toBeUndefined();
    const raw = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      agentInstances: Record<string, { environment?: Record<string, { value: string }> }>;
    };
    expect(raw.agentInstances.unrelated?.environment?.API_KEY?.value).toBe(
      "lc-safe:v1:invalid:payload",
    );
    expect(persistAcpRegistrySettingsMigrations(settingsPath)).toBe(false);
  });

  it("does not persist a schema-collapsed collection when adopting", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-antigravity-acp-collapse-"));
    const settingsPath = join(dir, "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        // The provider order is the migration trigger; the malformed instance
        // key ("Bad Id!") makes the whole agentInstances map fail its schema
        // parse. The persist overlay must keep the raw map instead of writing
        // the collapsed default over every instance and its secrets.
        providerOrder: ["claude", "acp-generic:antigravity-acp"],
        agentInstances: {
          "antigravity-acp": {
            id: "antigravity-acp",
            driver: "acp-generic",
            config: { binary: "agy_acp_server.par", authMode: "none" },
          },
          "Bad Id!": { id: "Bad Id!", driver: "acp-generic", config: { binary: "x" } },
        },
        acpRegistryInstalledAgents: {
          "antigravity-acp": {
            id: "antigravity-acp",
            name: "Google Antigravity",
            version: "1.0.0",
            installedAt: "2026-08-01T00:00:00.000Z",
            adapterKind: "acp-generic:antigravity-acp",
            installKind: "generic",
          },
        },
      }),
      "utf8",
    );

    expect(persistAcpRegistrySettingsMigrations(settingsPath)).toBe(true);
    const raw = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      agentInstances: Record<string, unknown>;
      providerOrder: string[];
    };
    expect(Object.keys(raw.agentInstances)).toContain("antigravity-acp");
    expect(raw.providerOrder).toEqual(["claude", "antigravity"]);
  });

  it("does not adopt a first-class binary whose ACP initialization probe fails", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-antigravity-acp-probe-"));
    const settingsPath = join(dir, "settings.json");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([1]), { status: 200 })),
    );
    probeAcpGenericInstanceMock.mockResolvedValueOnce(undefined);
    try {
      await expect(
        installAcpRegistryAgent({
          agentId: "antigravity-acp",
          baseDir: dir,
          settingsPath,
          iconsDir: join(dir, "acp-icons"),
          registry: antigravityRegistry("1.0.0"),
          adapterKind: "antigravity",
          installKind: "first-class",
        }),
      ).rejects.toThrow("ACP server did not complete initialization");
      expect(readAcpRegistrySettings(settingsPath).acpRegistryInstalledAgents).toEqual({});
      expect(readAcpRegistrySettings(settingsPath).agentInstances).toEqual({});
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps a same-version artifact when the first-class install probe fails", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-antigravity-acp-repair-"));
    const settingsPath = join(dir, "settings.json");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([1]), { status: 200 })),
    );
    try {
      await installAcpRegistryAgent({
        agentId: "antigravity-acp",
        baseDir: dir,
        settingsPath,
        iconsDir: join(dir, "acp-icons"),
        registry: antigravityRegistry("1.0.0"),
        adapterKind: "antigravity",
        installKind: "first-class",
      });

      // A repair reinstall of the exact recorded command must survive a flaky
      // probe — deleting the dir would take out the only working binary while
      // settings keep pointing at it.
      probeAcpGenericInstanceMock.mockResolvedValueOnce(undefined);
      const installed = await installAcpRegistryAgent({
        agentId: "antigravity-acp",
        baseDir: dir,
        settingsPath,
        iconsDir: join(dir, "acp-icons"),
        registry: antigravityRegistry("1.0.0"),
        adapterKind: "antigravity",
        installKind: "first-class",
      });

      expect(installed[0]).toMatchObject({ version: "1.0.0", installKind: "first-class" });
      expect(readAcpRegistrySettings(settingsPath).agentInstances["antigravity-acp"]).toMatchObject(
        { enabled: true },
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("installs a WSL-targeted artifact into the distro home and records the installation", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-antigravity-acp-wsl-"));
    const settingsPath = join(dir, "settings.json");
    const distroRoot = mkdtempSync(join(tmpdir(), "poracode-wsl-home-"));
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    const registry = antigravityRegistry("1.0.0");
    registry.agents[0]!.distribution.binary!["linux-x86_64"] = {
      archive: "https://dl.google.com/antigravity/antigravity-acp-1.0.0.zip",
      cmd: "./agy_acp_server.par",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([1]), { status: 200 })),
    );
    resolveWslHomeDirectoryAsyncMock.mockResolvedValueOnce("/home/tester");
    toWslUncPathMock.mockImplementation((_distro: unknown, ...rest: unknown[]) =>
      join(distroRoot, rest[0] as string),
    );
    batchWslCommandsAsyncMock.mockResolvedValueOnce([{ ok: true, stdout: "x86_64" }]);
    batchWslCommandsAsyncMock.mockResolvedValueOnce([{ ok: true, stdout: "" }]);
    try {
      const installed = await installAcpRegistryAgent({
        agentId: "antigravity-acp",
        baseDir: dir,
        settingsPath,
        iconsDir: join(dir, "acp-icons"),
        registry,
        adapterKind: "antigravity",
        installKind: "first-class",
        target: { kind: "wsl", distro: "Ubuntu" },
      });

      expect(installed[0]).toMatchObject({
        version: "1.0.0",
        installations: { wsl: { Ubuntu: { version: "1.0.0", target: "linux-x86_64" } } },
      });
      expect(readAcpRegistrySettings(settingsPath).agentInstances["antigravity-acp"]).toMatchObject(
        {
          config: {
            environmentCommands: {
              wsl: {
                Ubuntu: {
                  binary:
                    "/home/tester/.poracode/acp-registry/antigravity-acp/1.0.0/bin/agy_acp_server.par",
                },
              },
            },
          },
        },
      );
      expect(batchWslCommandsAsyncMock).toHaveBeenCalledWith("Ubuntu", [
        expect.stringContaining("chmod 755 '/home/tester/.poracode/acp-registry/"),
      ]);
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
      vi.unstubAllGlobals();
    }
  });

  it("updates the Antigravity ACP artifact while preserving auth and provider settings", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-antigravity-acp-"));
    const settingsPath = join(dir, "settings.json");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([1]), { status: 200 })),
    );
    try {
      await installAcpRegistryAgent({
        agentId: "antigravity-acp",
        baseDir: dir,
        settingsPath,
        iconsDir: join(dir, "acp-icons"),
        registry: antigravityRegistry("1.0.0"),
        adapterKind: "antigravity",
        installKind: "first-class",
      });
      setAcpRegistryAgentAuth({
        agentId: "antigravity-acp",
        environment: { GOOGLE_TOKEN: "secret" },
        settingsPath,
      });
      setAcpGenericAgentAuthAcknowledged(settingsPath, "antigravity-acp", undefined, true);
      const before = readAcpRegistrySettings(settingsPath);
      writeFileSync(
        settingsPath,
        JSON.stringify({ ...before, providerConfigs: { antigravity: { model: "gemini" } } }),
      );

      const installed = await updateAcpRegistryAgent({
        agentId: "antigravity-acp",
        baseDir: dir,
        settingsPath,
        iconsDir: join(dir, "acp-icons"),
        registry: antigravityRegistry("1.1.0"),
        adapterKind: "antigravity",
        installKind: "first-class",
      });

      expect(installed[0]).toMatchObject({
        version: "1.1.0",
        installations: { native: { version: "1.1.0", target: nativeTarget } },
      });
      const settings = readAcpRegistrySettings(settingsPath);
      expect(settings.agentInstances["antigravity-acp"]).toMatchObject({
        authAcknowledged: { native: true },
        environment: { GOOGLE_TOKEN: { value: "secret", sensitive: true } },
        config: { environmentCommands: { native: { version: "1.1.0" } } },
      });
      expect(settings.providerConfigs.antigravity).toMatchObject({ model: "gemini" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects unsupported-platform Antigravity artifacts without recording an install", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-antigravity-acp-"));
    const settingsPath = join(dir, "settings.json");
    const registry = antigravityRegistry("1.0.0");
    registry.agents[0]!.distribution.binary = {
      "unsupported-x86_64": {
        archive: "https://dl.google.com/antigravity/unsupported.zip",
        cmd: "./agy_acp_server",
      },
    };

    await expect(
      installAcpRegistryAgent({
        agentId: "antigravity-acp",
        baseDir: dir,
        settingsPath,
        iconsDir: join(dir, "acp-icons"),
        registry,
        adapterKind: "antigravity",
        installKind: "first-class",
      }),
    ).rejects.toThrow(`does not publish a binary for ${nativeTarget}`);
    expect(readAcpRegistrySettings(settingsPath).acpRegistryInstalledAgents).toEqual({});
  });

  it("does not record a first-class install when the registry artifact download fails", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-antigravity-acp-"));
    const settingsPath = join(dir, "settings.json");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("failed", { status: 503 })),
    );
    try {
      await expect(
        installAcpRegistryAgent({
          agentId: "antigravity-acp",
          baseDir: dir,
          settingsPath,
          iconsDir: join(dir, "acp-icons"),
          registry: antigravityRegistry("1.0.0"),
          adapterKind: "antigravity",
          installKind: "first-class",
        }),
      ).rejects.toThrow(/HTTP 503.*dl\.google\.com/u);
      expect(readAcpRegistrySettings(settingsPath).acpRegistryInstalledAgents).toEqual({});
      expect(readAcpRegistrySettings(settingsPath).agentInstances).toEqual({});
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("installs Factory Droid with direct ACP mode", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-acp-registry-"));
    const settingsPath = join(dir, "settings.json");
    const registry: AcpRegistryListResult = {
      version: "1.0.0",
      agents: [
        {
          id: "factory-droid",
          name: "Factory Droid",
          version: "0.170.0",
          description: "Factory Droid",
          distribution: {
            npx: {
              package: "droid@0.170.0",
              args: ["exec", "--output-format", "acp-daemon"],
            },
          },
        },
      ],
    };

    await installAcpRegistryAgent({
      agentId: "factory-droid",
      baseDir: dir,
      settingsPath,
      iconsDir: join(dir, "acp-icons"),
      registry,
    });

    expect(
      readAcpRegistrySettings(settingsPath).agentInstances["factory-droid"]?.config,
    ).toMatchObject({ args: ["-y", "droid@0.170.0", "exec", "--output-format", "acp"] });
  });

  it("installs known ACP wrappers as generic ACP instances", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-acp-registry-"));
    const settingsPath = join(dir, "settings.json");
    const registry: AcpRegistryListResult = {
      version: "1.0.0",
      agents: [
        {
          id: "codex-acp",
          name: "Codex ACP",
          version: "1.0.0",
          description: "Codex via ACP",
          distribution: { npx: { package: "codex-acp@1.0.0" } },
        },
      ],
    };
    const fetchMock = vi
      .fn<() => Promise<{ ok: boolean; json: () => Promise<AcpRegistryListResult> }>>()
      .mockResolvedValue({
        ok: true,
        json: async () => registry,
      });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const installed = await installAcpRegistryAgent({
        agentId: "codex-acp",
        baseDir: dir,
        settingsPath,
        iconsDir: join(dir, "acp-icons"),
      });

      expect(installed).toMatchObject([
        {
          id: "codex-acp",
          adapterKind: "acp-generic:codex-acp",
          installKind: "generic",
        },
      ]);
      const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
        agentInstances: Record<string, { driver?: string; config?: { binary?: string } }>;
      };
      expect(settings.agentInstances["codex-acp"]).toMatchObject({
        driver: "acp-generic",
        version: "1.0.0",
        config: { binary: "npx" },
      });
      expect(probeAcpGenericInstanceMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "codex-acp", driver: "acp-generic" }),
        undefined,
        { timeoutMs: REGISTRY_INSTALL_PROBE_TIMEOUT_MS },
      );
      expect(execFileMock).toHaveBeenCalledOnce();
      const [command, args, options] = execFileMock.mock.calls[0] ?? [];
      const invocation = [String(command), ...(Array.isArray(args) ? args.map(String) : [])].join(
        " ",
      );
      expect(invocation).toContain("npx");
      expect(invocation).toContain("codex-acp@1.0.0");
      expect(invocation).toContain("--help");
      expect(options).toMatchObject({ timeout: 120_000, windowsHide: true });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.runIf(process.platform === "win32")(
    "passes Windows binary archive paths to PowerShell through the child environment",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "poracode acp registry-"));
      const settingsPath = join(dir, "settings.json");
      const registry: AcpRegistryListResult = {
        version: "1.0.0",
        agents: [
          {
            id: "binary-agent",
            name: "Binary Agent",
            version: "1.0.0",
            description: "Binary agent via ACP",
            distribution: {
              binary: {
                "windows-x86_64": {
                  archive: "https://example.com/agent.zip",
                  cmd: "agent.exe",
                },
              },
            },
          },
        ],
      };
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(new Uint8Array([1]), { status: 200 })),
      );
      try {
        await installAcpRegistryAgent({
          agentId: "binary-agent",
          baseDir: dir,
          settingsPath,
          iconsDir: join(dir, "acp-icons"),
          registry,
        });

        expect(execFileMock).toHaveBeenCalledOnce();
        const [command, args, options] = execFileMock.mock.calls[0] ?? [];
        expect(command).toBe("powershell.exe");
        expect(args).toEqual([
          "-NoLogo",
          "-NoProfile",
          "-Command",
          "Expand-Archive -LiteralPath $env:PORACODE_ACP_ARCHIVE_PATH -DestinationPath $env:PORACODE_ACP_INSTALL_DIR -Force",
        ]);
        expect(options).toMatchObject({
          windowsHide: true,
          env: {
            PORACODE_ACP_ARCHIVE_PATH: join(
              dir,
              "acp-registry",
              "binary-agent",
              "1.0.0",
              "agent.zip",
            ),
            PORACODE_ACP_INSTALL_DIR: join(dir, "acp-registry", "binary-agent", "1.0.0", "bin"),
          },
        });
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it("backfills registry icons into existing generic installs and caches them locally", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-acp-registry-"));
    const settingsPath = join(dir, "settings.json");
    const iconsDir = join(dir, "acp-icons");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        acpRegistryInstalledAgents: {
          "glm-acp-agent": {
            id: "glm-acp-agent",
            name: "GLM Agent",
            version: "1.1.3",
            installedAt: new Date(0).toISOString(),
            adapterKind: "acp-generic:glm-acp-agent",
            installKind: "generic",
          },
        },
        agentInstances: {
          "glm-acp-agent": {
            id: "glm-acp-agent",
            driver: "acp-generic",
            displayName: "GLM Agent",
            enabled: true,
            config: {
              binary: "npx",
              args: ["-y", "glm-acp-agent@1.1.3"],
              authMode: "none",
            },
          },
        },
      }),
      "utf8",
    );
    const registry: AcpRegistryListResult = {
      version: "1.0.0",
      agents: [
        {
          id: "glm-acp-agent",
          name: "GLM Agent",
          version: "1.1.3",
          description: "GLM",
          icon: "https://cdn.agentclientprotocol.com/registry/v1/latest/glm-acp-agent.svg",
          distribution: { npx: { package: "glm-acp-agent@1.1.3" } },
        },
      ],
    };

    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async (url: string) => {
      if (url.endsWith(".svg")) {
        return new Response("<svg/>", {
          status: 200,
          headers: { "content-type": "image/svg+xml" },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(
        backfillAcpRegistryAgentIcons({ registry, settingsPath, iconsDir }),
      ).resolves.toBe(true);
      const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
        acpRegistryInstalledAgents: Record<string, { icon?: string; version?: string }>;
        agentInstances: Record<string, { icon?: string; version?: string }>;
      };

      const installedIcon = settings.acpRegistryInstalledAgents["glm-acp-agent"]?.icon;
      const instanceIcon = settings.agentInstances["glm-acp-agent"]?.icon;
      expect(installedIcon).toMatch(/^poracode-local:\/\//);
      expect(installedIcon).toContain("glm-acp-agent.svg");
      expect(instanceIcon).toBe(installedIcon);

      // Calling backfill again with the same registry should be a no-op
      // because the cached entry already resolves to the stored local URL.
      await expect(
        backfillAcpRegistryAgentIcons({ registry, settingsPath, iconsDir }),
      ).resolves.toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("localizes remote acp-generic icons at launch without a registry fetch", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-acp-registry-"));
    const settingsPath = join(dir, "settings.json");
    const iconsDir = join(dir, "acp-icons");
    const remoteIcon = "https://cdn.agentclientprotocol.com/registry/v1/latest/glm-acp-agent.svg";
    writeFileSync(
      settingsPath,
      JSON.stringify({
        acpRegistryInstalledAgents: {
          "glm-acp-agent": {
            id: "glm-acp-agent",
            name: "GLM Agent",
            version: "1.1.3",
            icon: remoteIcon,
            installedAt: new Date(0).toISOString(),
            adapterKind: "acp-generic:glm-acp-agent",
            installKind: "generic",
          },
        },
        agentInstances: {
          "glm-acp-agent": {
            id: "glm-acp-agent",
            driver: "acp-generic",
            displayName: "GLM Agent",
            icon: remoteIcon,
            enabled: true,
            config: {
              binary: "npx",
              args: ["-y", "glm-acp-agent@1.1.3"],
              authMode: "none",
            },
          },
        },
      }),
      "utf8",
    );

    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async (url: string) => {
      if (url.endsWith(".svg")) {
        return new Response("<svg/>", {
          status: 200,
          headers: { "content-type": "image/svg+xml" },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(cacheLocalAcpRegistryIcons({ settingsPath, iconsDir })).resolves.toBe(true);
      const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
        acpRegistryInstalledAgents: Record<string, { icon?: string }>;
        agentInstances: Record<string, { icon?: string }>;
      };
      const installedIcon = settings.acpRegistryInstalledAgents["glm-acp-agent"]?.icon;
      const instanceIcon = settings.agentInstances["glm-acp-agent"]?.icon;
      expect(installedIcon).toMatch(/^poracode-local:\/\//);
      expect(installedIcon).toContain("glm-acp-agent.svg");
      expect(instanceIcon).toBe(installedIcon);
      // Only the icon SVG is fetched — never the registry JSON.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toBe(remoteIcon);

      // Second launch: every icon is already local, so it's a no-op with no
      // further network access.
      fetchMock.mockClear();
      await expect(cacheLocalAcpRegistryIcons({ settingsPath, iconsDir })).resolves.toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("stores ACP registry auth env vars on the installed generic instance", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-acp-registry-"));
    const settingsPath = join(dir, "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        acpRegistryInstalledAgents: {
          "glm-acp-agent": {
            id: "glm-acp-agent",
            name: "GLM Agent",
            version: "1.1.3",
            installedAt: new Date(0).toISOString(),
            adapterKind: "acp-generic:glm-acp-agent",
            installKind: "generic",
          },
        },
        agentInstances: {
          "glm-acp-agent": {
            id: "glm-acp-agent",
            driver: "acp-generic",
            displayName: "GLM Agent",
            enabled: true,
            config: {
              binary: "npx",
              args: ["-y", "glm-acp-agent@1.1.3"],
              authMode: "none",
            },
          },
        },
      }),
      "utf8",
    );

    setAcpRegistryAgentAuth({
      agentId: "glm-acp-agent",
      environment: { Z_AI_API_KEY: "sk-test" },
      settingsPath,
    });
    const raw = readFileSync(settingsPath, "utf8");
    expect(raw).not.toContain("sk-test");
    const settings = JSON.parse(raw) as {
      agentInstances: Record<string, { environment?: Record<string, unknown> }>;
    };
    const environment = settings.agentInstances["glm-acp-agent"]?.environment;
    expect(environment).toBeDefined();
    expect(isEncryptedSecret((environment!.Z_AI_API_KEY as { value: string }).value)).toBe(true);

    expect(
      readAcpRegistrySettings(settingsPath).agentInstances["glm-acp-agent"]?.environment,
    ).toEqual({
      Z_AI_API_KEY: { value: "sk-test", sensitive: true },
    });
  });

  it("keeps registered adapters when one stored secret can no longer be decrypted", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-acp-registry-"));
    const settingsPath = join(dir, "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        agentInstances: {
          "factory-droid": {
            id: "factory-droid",
            driver: "acp-generic",
            enabled: true,
            config: { binary: "npx", args: ["-y", "droid-acp"] },
          },
          "z-ai": {
            id: "z-ai",
            driver: "claude",
            displayName: "z.ai",
            environment: {
              ANTHROPIC_BASE_URL: { value: "https://api.z.ai/api/anthropic" },
              ANTHROPIC_AUTH_TOKEN: {
                value: "lc-safe:v1:invalid:invalid:invalid",
                sensitive: true,
              },
            },
            config: { configDir: "~/.poracode/claude-profiles/z-ai" },
          },
        },
      }),
      "utf8",
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const settings = readAcpRegistrySettings(settingsPath);

    expect(Object.keys(settings.agentInstances)).toEqual(["factory-droid", "z-ai"]);
    expect(settings.agentInstances["factory-droid"]?.driver).toBe("acp-generic");
    expect(settings.agentInstances["z-ai"]?.environment).toEqual({
      ANTHROPIC_BASE_URL: { value: "https://api.z.ai/api/anthropic" },
    });
    expect(warn).toHaveBeenCalledWith(
      "[agents] could not decrypt ANTHROPIC_AUTH_TOKEN for z-ai; omitting the unusable secret",
    );
    warn.mockRestore();
  });

  it("updates an installed ACP agent to a new registry version while preserving credentials", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-acp-registry-"));
    const settingsPath = join(dir, "settings.json");
    const initialRegistry: AcpRegistryListResult = {
      version: "1.0.0",
      agents: [
        {
          id: "codex-acp",
          name: "Codex ACP",
          version: "1.0.0",
          description: "Codex via ACP",
          distribution: { npx: { package: "codex-acp@1.0.0" } },
        },
      ],
    };
    const updatedRegistry: AcpRegistryListResult = {
      version: "1.0.0",
      agents: [
        {
          id: "codex-acp",
          name: "Codex ACP",
          version: "1.1.0",
          description: "Codex via ACP",
          distribution: { npx: { package: "codex-acp@1.1.0" } },
        },
      ],
    };

    const fetchMock =
      vi.fn<() => Promise<{ ok: boolean; json: () => Promise<AcpRegistryListResult> }>>();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => initialRegistry });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => updatedRegistry });
    vi.stubGlobal("fetch", fetchMock);
    try {
      await installAcpRegistryAgent({
        agentId: "codex-acp",
        baseDir: dir,
        settingsPath,
        iconsDir: join(dir, "acp-icons"),
      });
      setAcpRegistryAgentAuth({
        agentId: "codex-acp",
        environment: { OPENAI_API_KEY: "sk-secret" },
        settingsPath,
      });

      const installed = await updateAcpRegistryAgent({
        agentId: "codex-acp",
        baseDir: dir,
        settingsPath,
        iconsDir: join(dir, "acp-icons"),
      });
      expect(installed).toMatchObject([{ id: "codex-acp", version: "1.1.0" }]);

      const settings = readAcpRegistrySettings(settingsPath);
      expect(settings.agentInstances["codex-acp"]?.version).toBe("1.1.0");
      expect(settings.agentInstances["codex-acp"]?.config).toMatchObject({
        binary: "npx",
        args: ["-y", "codex-acp@1.1.0"],
      });
      expect(settings.agentInstances["codex-acp"]?.environment).toEqual({
        OPENAI_API_KEY: { value: "sk-secret", sensitive: true },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects updates for agents that are not installed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-acp-registry-"));
    const settingsPath = join(dir, "settings.json");
    await expect(
      updateAcpRegistryAgent({
        agentId: "codex-acp",
        baseDir: dir,
        settingsPath,
        iconsDir: join(dir, "acp-icons"),
      }),
    ).rejects.toThrow(/not installed/i);
  });

  it("auto-updates installed agents whose registry version differs", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-acp-registry-"));
    const settingsPath = join(dir, "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        acpRegistryInstalledAgents: {
          "codex-acp": {
            id: "codex-acp",
            name: "Codex ACP",
            version: "1.0.0",
            installedAt: new Date(0).toISOString(),
            adapterKind: "acp-generic:codex-acp",
            installKind: "generic",
          },
        },
        agentInstances: {
          "codex-acp": {
            id: "codex-acp",
            driver: "acp-generic",
            displayName: "Codex ACP",
            version: "1.0.0",
            enabled: true,
            config: {
              binary: "npx",
              args: ["-y", "codex-acp@1.0.0"],
              authMode: "none",
            },
          },
        },
      }),
      "utf8",
    );

    const registry: AcpRegistryListResult = {
      version: "1.0.0",
      agents: [
        {
          id: "codex-acp",
          name: "Codex ACP",
          version: "1.2.0",
          description: "Codex via ACP",
          distribution: { npx: { package: "codex-acp@1.2.0" } },
        },
      ],
    };

    const result = await autoUpdateAcpRegistryAgents({
      registry,
      baseDir: dir,
      settingsPath,
      iconsDir: join(dir, "acp-icons"),
    });
    expect(result.updated).toEqual(["codex-acp"]);
    expect(result.changed).toEqual(["codex-acp"]);
    expect(result.failed).toEqual([]);

    const settings = readAcpRegistrySettings(settingsPath);
    expect(settings.acpRegistryInstalledAgents["codex-acp"]?.version).toBe("1.2.0");
    expect(settings.agentInstances["codex-acp"]?.version).toBe("1.2.0");
    expect(settings.agentInstances["codex-acp"]?.config).toMatchObject({
      args: ["-y", "codex-acp@1.2.0"],
    });
  });

  it("leaves first-class aliases for their built-in update route", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-acp-registry-"));
    const settingsPath = join(dir, "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        acpRegistryInstalledAgents: {
          "antigravity-acp": {
            id: "antigravity-acp",
            name: "Google Antigravity",
            version: "0.9.0",
            installedAt: new Date(0).toISOString(),
            adapterKind: "antigravity",
            installKind: "first-class",
          },
        },
        agentInstances: {
          "antigravity-acp": {
            id: "antigravity-acp",
            driver: "acp-generic",
            displayName: "Google Antigravity",
            version: "0.9.0",
            enabled: true,
            config: { binary: "agy_acp_server.par", authMode: "none" },
          },
        },
      }),
      "utf8",
    );

    const result = await autoUpdateAcpRegistryAgents({
      registry: antigravityRegistry("1.0.0"),
      baseDir: dir,
      settingsPath,
      iconsDir: join(dir, "acp-icons"),
      firstClassAgents: { "antigravity-acp": "antigravity" },
    });

    expect(result).toEqual({ updated: [], changed: [], failed: [] });
    expect(
      readAcpRegistrySettings(settingsPath).acpRegistryInstalledAgents["antigravity-acp"],
    ).toMatchObject({ version: "0.9.0", installKind: "first-class" });
  });

  it("reports settings changes when one environment update succeeds and another fails", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-acp-registry-"));
    const settingsPath = join(dir, "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        acpRegistryInstalledAgents: {
          "binary-agent": {
            id: "binary-agent",
            name: "Binary Agent",
            version: "0.9.0",
            installedAt: new Date(0).toISOString(),
            adapterKind: "acp-generic:binary-agent",
            installKind: "generic",
            installations: {
              native: {
                version: "0.9.0",
                target: nativeTarget,
                installedAt: new Date(0).toISOString(),
              },
              wsl: {
                Ubuntu: {
                  version: "0.9.0",
                  target: "linux-x86_64",
                  installedAt: new Date(0).toISOString(),
                },
              },
            },
          },
        },
        agentInstances: {
          "binary-agent": {
            id: "binary-agent",
            driver: "acp-generic",
            displayName: "Binary Agent",
            version: "0.9.0",
            enabled: true,
            config: { binary: "binary-agent", authMode: "none" },
          },
        },
      }),
      "utf8",
    );
    const registry: AcpRegistryListResult = {
      version: "1.0.0",
      agents: [
        {
          id: "binary-agent",
          name: "Binary Agent",
          version: "1.0.0",
          description: "Binary agent via ACP",
          distribution: {
            binary: {
              [nativeTarget]: {
                archive: "https://example.com/binary-agent.zip",
                cmd: process.platform === "win32" ? "binary-agent.exe" : "binary-agent",
              },
            },
          },
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([1]), { status: 200 })),
    );
    try {
      const result = await autoUpdateAcpRegistryAgents({
        registry,
        baseDir: dir,
        settingsPath,
        iconsDir: join(dir, "acp-icons"),
      });

      expect(result.updated).toEqual([]);
      expect(result.changed).toEqual(["binary-agent"]);
      expect(result.failed).toEqual([
        expect.objectContaining({ id: "binary-agent", error: expect.any(String) }),
      ]);
      expect(
        readAcpRegistrySettings(settingsPath).acpRegistryInstalledAgents["binary-agent"]
          ?.installations,
      ).toMatchObject({
        native: { version: "1.0.0" },
        wsl: { Ubuntu: { version: "0.9.0" } },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("auto-update skips installs that are already current", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-acp-registry-"));
    const settingsPath = join(dir, "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        acpRegistryInstalledAgents: {
          "codex-acp": {
            id: "codex-acp",
            name: "Codex ACP",
            version: "1.0.0",
            installedAt: new Date(0).toISOString(),
            adapterKind: "acp-generic:codex-acp",
            installKind: "generic",
          },
        },
        agentInstances: {
          "codex-acp": {
            id: "codex-acp",
            driver: "acp-generic",
            displayName: "Codex ACP",
            version: "1.0.0",
            enabled: true,
            config: {
              binary: "npx",
              args: ["-y", "codex-acp@1.0.0"],
              authMode: "none",
            },
          },
        },
      }),
      "utf8",
    );

    const registry: AcpRegistryListResult = {
      version: "1.0.0",
      agents: [
        {
          id: "codex-acp",
          name: "Codex ACP",
          version: "1.0.0",
          description: "Codex via ACP",
          distribution: { npx: { package: "codex-acp@1.0.0" } },
        },
      ],
    };

    const result = await autoUpdateAcpRegistryAgents({
      registry,
      baseDir: dir,
      settingsPath,
      iconsDir: join(dir, "acp-icons"),
    });
    expect(result.updated).toEqual([]);
    expect(result.failed).toEqual([]);
  });

  it("repairs an already-current Factory Droid daemon command", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-acp-registry-"));
    const settingsPath = join(dir, "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        acpRegistryInstalledAgents: {
          "factory-droid": {
            id: "factory-droid",
            name: "Factory Droid",
            version: "0.170.0",
            installedAt: new Date(0).toISOString(),
            adapterKind: "acp-generic:factory-droid",
            installKind: "generic",
          },
        },
        agentInstances: {
          "factory-droid": {
            id: "factory-droid",
            driver: "acp-generic",
            displayName: "Factory Droid",
            version: "0.170.0",
            enabled: true,
            config: {
              binary: "npx",
              args: ["-y", "droid@0.170.0", "exec", "--output-format", "acp-daemon"],
              authMode: "none",
            },
          },
        },
      }),
      "utf8",
    );
    const registry: AcpRegistryListResult = {
      version: "1.0.0",
      agents: [
        {
          id: "factory-droid",
          name: "Factory Droid",
          version: "0.170.0",
          description: "Factory Droid",
          distribution: {
            npx: {
              package: "droid@0.170.0",
              args: ["exec", "--output-format", "acp-daemon"],
            },
          },
        },
      ],
    };

    const result = await autoUpdateAcpRegistryAgents({
      registry,
      baseDir: dir,
      settingsPath,
      iconsDir: join(dir, "acp-icons"),
    });

    expect(result.updated).toEqual(["factory-droid"]);
    expect(
      readAcpRegistrySettings(settingsPath).agentInstances["factory-droid"]?.config,
    ).toMatchObject({ args: ["-y", "droid@0.170.0", "exec", "--output-format", "acp"] });
  });
});
