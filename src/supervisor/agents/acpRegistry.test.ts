import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AcpRegistryListResult } from "@/shared/contracts";
import { REGISTRY_INSTALL_PROBE_TIMEOUT_MS } from "./acp-generic";

const probeAcpGenericInstanceMock = vi.hoisted(() =>
  vi
    .fn<
      (...args: unknown[]) => Promise<{
        authState: string;
        authMethods: Array<{ id: string; name: string }>;
      }>
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
  readAcpRegistrySettings,
  setAcpRegistryAgentAuth,
  updateAcpRegistryAgent,
} from "./acpRegistry";
import { isEncryptedSecret } from "../secretStorage";

describe("ACP registry installs", () => {
  beforeEach(() => {
    execFileMock.mockClear();
    probeAcpGenericInstanceMock.mockClear();
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
    expect(result.failed).toEqual([]);

    const settings = readAcpRegistrySettings(settingsPath);
    expect(settings.acpRegistryInstalledAgents["codex-acp"]?.version).toBe("1.2.0");
    expect(settings.agentInstances["codex-acp"]?.version).toBe("1.2.0");
    expect(settings.agentInstances["codex-acp"]?.config).toMatchObject({
      args: ["-y", "codex-acp@1.2.0"],
    });
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
