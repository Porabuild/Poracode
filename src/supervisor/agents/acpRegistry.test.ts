import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
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
  installAcpRegistryAgent,
  readAcpRegistrySettings,
  resolveRegistryAgentFamilyKind,
  setAcpRegistryAgentAuth,
  updateAcpRegistryAgent,
} from "./acpRegistry";
import { isEncryptedSecret } from "../secretStorage";

describe("ACP registry family mapping", () => {
  it("maps known registry agents to provider families for presentation only", () => {
    expect(resolveRegistryAgentFamilyKind("codex-acp")).toBe("codex");
    expect(resolveRegistryAgentFamilyKind("cursor")).toBe("cursor");
    expect(resolveRegistryAgentFamilyKind("gemini")).toBe("gemini");
    expect(resolveRegistryAgentFamilyKind("opencode")).toBe("opencode");
  });

  it("leaves unknown registry agents for the generic ACP adapter", () => {
    expect(resolveRegistryAgentFamilyKind("agoragentic-acp")).toBeUndefined();
  });

  it("installs known ACP wrappers as generic ACP instances", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lightcode-acp-registry-"));
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
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("backfills registry icons into existing generic installs and caches them locally", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lightcode-acp-registry-"));
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
      expect(installedIcon).toMatch(/^lightcode-local:\/\//);
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

  it("stores ACP registry auth env vars on the installed generic instance", () => {
    const dir = mkdtempSync(join(tmpdir(), "lightcode-acp-registry-"));
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

  it("updates an installed ACP agent to a new registry version while preserving credentials", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lightcode-acp-registry-"));
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
    const dir = mkdtempSync(join(tmpdir(), "lightcode-acp-registry-"));
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
    const dir = mkdtempSync(join(tmpdir(), "lightcode-acp-registry-"));
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
    const dir = mkdtempSync(join(tmpdir(), "lightcode-acp-registry-"));
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
});
