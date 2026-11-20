import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentInstanceConfig, ProjectLocation } from "@/shared/contracts";

const detectAgentInstallMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
    kind: "gemini",
    label: "Gemini",
    installed: true,
    authState: "authenticated" as const,
    capabilities: {
      models: [],
      efforts: [],
      modelEfforts: {},
      modes: [],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsOneShot: true,
      supportsDirectInput: true,
      liveInputMode: "terminal" as const,
      presentationMode: "terminal" as const,
      settingDefs: [],
    },
  })),
);

const createAcpStructuredSessionMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => unknown>(() => ({
    launchOptions: {},
    setListener: () => {},
    dispose: async () => {},
  })),
);

vi.mock("../base", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../base")>();
  return {
    ...actual,
    detectAgentInstall: detectAgentInstallMock,
    prepareAgentLocationEnvironment: async () => undefined,
  };
});

vi.mock("../acp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../acp")>();
  return {
    ...actual,
    createAcpStructuredSession: createAcpStructuredSessionMock,
  };
});

import { createGeminiAdapter, createGeminiProfileAdapter } from ".";
import { GEMINI_BLANKED_HOST_CREDENTIALS, createGeminiProfileContext } from "./profiles";

describe("Gemini profile support", () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), "poracode-gemini-profile-"));
    detectAgentInstallMock.mockClear();
    createAcpStructuredSessionMock.mockClear();
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  const location = (): ProjectLocation => ({ kind: "posix", path: rootDir });

  it("creates profile env with GEMINI_CLI_HOME and blanked host credential variables", async () => {
    const profileHome = join(rootDir, "work-profile");
    const ctx = createGeminiProfileContext({
      kind: "gemini:work",
      label: "Gemini Work",
      profileId: "work",
      homeDir: profileHome,
    });

    const env = await ctx.profileEnv(location());
    expect(existsSync(profileHome)).toBe(true);
    expect(GEMINI_BLANKED_HOST_CREDENTIALS.GEMINI_FORCE_FILE_STORAGE).toBe("true");
    expect(env).toEqual({
      GEMINI_CLI_HOME: profileHome,
      ...GEMINI_BLANKED_HOST_CREDENTIALS,
    });
  });

  it("propagates profile env across detectInstall, launch, resume, ACP, auth, and one-shot", async () => {
    const profileHome = join(rootDir, "team-profile");
    const instance: AgentInstanceConfig = {
      id: "team",
      driver: "gemini",
      displayName: "Team",
      config: { homeDir: profileHome },
    };
    const adapter = createGeminiProfileAdapter(instance);
    expect(adapter.kind).toBe("gemini:team");
    expect(adapter.label).toBe("Gemini Team");
    expect(adapter.sessionImport?.roots).toEqual([join(profileHome, ".gemini", "tmp")]);
    expect(adapter.skillSupport?.roots[0]?.globalBasePath).toBe(profileHome);

    const status = await adapter.detectInstall({ envKind: "posix" });
    expect(status.kind).toBe("gemini:team");
    expect(status.label).toBe("Gemini Team");
    expect(detectAgentInstallMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: "gemini:team",
        label: "Gemini Team",
        probeEnv: {
          GEMINI_CLI_HOME: profileHome,
          ...GEMINI_BLANKED_HOST_CREDENTIALS,
        },
      }),
    );

    const launch = await adapter.buildLaunchArgv(location(), { model: "gemini-3.5-flash" }, "hi");
    expect(launch?.env).toMatchObject({
      GEMINI_CLI_HOME: profileHome,
      GEMINI_API_KEY: "",
    });

    const resume = await adapter.buildResumeArgv(
      location(),
      { model: "gemini-3.5-flash" },
      "continue",
      { providerSessionId: "s-1", discoveredAt: "2026-05-01T00:00:00.000Z" },
    );
    expect(resume?.env).toMatchObject({
      GEMINI_CLI_HOME: profileHome,
      GEMINI_API_KEY: "",
    });

    const authCmd = await adapter.buildAcpAuthCommand?.({
      envKind: "posix",
    });
    expect(authCmd?.args.join(" ")).toContain("--acp");
    expect(authCmd?.env).toMatchObject({
      GEMINI_CLI_HOME: profileHome,
      GEMINI_API_KEY: "",
    });

    const oneShot = await adapter.buildOneShotCommand?.(
      "gemini-3.5-flash",
      "",
      "summarize",
      location(),
      false,
    );
    expect(oneShot?.env).toMatchObject({
      GEMINI_CLI_HOME: profileHome,
      GEMINI_API_KEY: "",
    });

    const extract = await adapter.buildContextExtractionCommand?.(
      { providerSessionId: "s-1", discoveredAt: "2026-05-01T00:00:00.000Z" },
      location(),
      "gemini-3.5-flash",
    );
    expect(extract?.env).toMatchObject({
      GEMINI_CLI_HOME: profileHome,
      GEMINI_API_KEY: "",
    });

    await adapter.createStructuredSession?.({
      threadId: "t-1",
      projectLocation: location(),
      config: { model: "gemini-3.5-flash" },
      presentationMode: "gui",
    });
    expect(createAcpStructuredSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.objectContaining({
          GEMINI_CLI_HOME: profileHome,
          GEMINI_API_KEY: "",
        }),
      }),
      expect.objectContaining({
        env: expect.objectContaining({
          GEMINI_CLI_HOME: profileHome,
          GEMINI_API_KEY: "",
        }),
      }),
      expect.objectContaining({
        behavior: {
          promptUsageCounterKind: "per-call",
          promptUsageReportsContext: false,
        },
      }),
    );
  });

  it("keeps base Gemini adapter un-scoped without GEMINI_CLI_HOME overrides", async () => {
    const adapter = createGeminiAdapter();
    expect(adapter.kind).toBe("gemini");
    const launch = await adapter.buildLaunchArgv(location(), { model: "gemini-2.5-pro" }, "hello");
    expect(launch?.env?.GEMINI_CLI_HOME).toBeUndefined();
  });
});
