import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";

const buildAgentCommandMock = vi.hoisted(() =>
  vi.fn<
    (
      location: ProjectLocation,
      command: string,
      args: string[],
      executablePath?: string,
      env?: Record<string, string>,
    ) => { command: string; args: string[]; env?: Record<string, string>; cwd?: string }
  >(),
);
const probeAcpCapabilitiesMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<unknown>>(),
);
const readMacKeychainFingerprintMock = vi.hoisted(() =>
  vi.fn<(entry: { service: string; account?: string }) => Promise<string | undefined>>(),
);

vi.mock("../base", async () => {
  const actual = await vi.importActual<typeof import("../base")>("../base");
  return {
    ...actual,
    buildAgentCommand: buildAgentCommandMock,
  };
});

vi.mock("../acp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../acp")>()),
  probeAcpCapabilities: probeAcpCapabilitiesMock,
}));

vi.mock("@/supervisor/runtime/macKeychain", () => ({
  readMacKeychainFingerprint: readMacKeychainFingerprintMock,
}));

import {
  evaluateGeminiAuthEvidence,
  geminiDetectionSpec,
  geminiModelContextTokens,
  humanizeGeminiModelId,
  parseGeminiGoogleAccountsJson,
} from "./detection";
import { GEMINI_BLANKED_HOST_CREDENTIALS } from "./profiles";

describe("geminiDetectionSpec", () => {
  let rootDir: string;
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.clearAllMocks();
    rootDir = mkdtempSync(join(tmpdir(), "poracode-gemini-detect-"));
    buildAgentCommandMock.mockReturnValue({
      command: "/bin/zsh",
      args: ["-l", "-c", "exec '/Users/demo/.local/bin/gemini' '--acp'"],
    });
    probeAcpCapabilitiesMock.mockResolvedValue(undefined);
    readMacKeychainFingerprintMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
    rmSync(rootDir, { recursive: true, force: true });
  });

  it("uses the native project location and resolved executable for non-WSL probes", async () => {
    const location: ProjectLocation = { kind: "posix", path: "/Users/demo/project" };
    buildAgentCommandMock.mockReturnValue({
      command: "/Users/demo/.local/bin/gemini",
      args: ["--acp", "--skip-trust"],
      env: { PATH: "/opt/homebrew/bin:/usr/bin:/bin", CUSTOM: "host" },
    });

    // Even when the ACP probe fails, Gemini surfaces a terminal auth method
    // so the Login button stays in the settings UI.
    await expect(
      geminiDetectionSpec.capabilitiesProbe?.({
        location,
        executablePath: "/Users/demo/.local/bin/gemini",
      }),
    ).resolves.toEqual({
      authMethods: [{ id: "gemini-terminal-login", name: "Login", type: "terminal" }],
    });

    expect(buildAgentCommandMock).toHaveBeenCalledWith(location, "/Users/demo/.local/bin/gemini", [
      "--acp",
      "--skip-trust",
    ]);
    expect(probeAcpCapabilitiesMock).toHaveBeenCalledWith(
      "/Users/demo/.local/bin/gemini",
      ["--acp", "--skip-trust"],
      expect.any(String),
      expect.objectContaining({
        label: "gemini:posix",
        timeoutMs: 20_000,
        modelLabel: humanizeGeminiModelId,
        processCwd: expect.any(String),
        env: { PATH: "/opt/homebrew/bin:/usr/bin:/bin", CUSTOM: "host" },
      }),
    );
  });

  it("adds v0.68.0 + Gemma 4 context labels and forwards ACP capability fields", async () => {
    const location: ProjectLocation = { kind: "posix", path: "/Users/demo/project" };
    buildAgentCommandMock.mockReturnValue({
      command: "/Users/demo/.local/bin/gemini",
      args: ["--acp", "--skip-trust"],
      env: { PATH: "/opt/homebrew/bin:/usr/bin:/bin" },
    });
    probeAcpCapabilitiesMock.mockResolvedValue({
      models: [
        { id: "auto-gemini-3", label: "Auto (Gemini 3)" },
        { id: "gemini-3.1-pro-preview", label: "3.1 Pro Preview" },
        { id: "gemini-3.8-flash", label: "3.8 Flash" },
        { id: "gemma-4-31b-it", label: "Gemma 4 31B" },
        { id: "gemini-9-pro", label: "9 Pro" },
      ],
      efforts: ["low", "high"],
      defaultEffort: "high",
      modelEfforts: { "gemini-3.8-flash": ["low", "high"] },
      modelDefaultEfforts: { "gemini-3.8-flash": "high" },
      thinkingModels: ["gemini-3.1-pro-preview"],
      fastModels: ["gemini-3.8-flash"],
      subProviders: [{ id: "google", label: "Google" }],
      modelSubProvider: { "gemini-3.8-flash": "google" },
      authState: "missing",
    });

    const probeEnv = { GEMINI_CLI_HOME: rootDir, GEMINI_FORCE_FILE_STORAGE: "true" };
    const result = await geminiDetectionSpec.capabilitiesProbe?.({
      location,
      executablePath: "/Users/demo/.local/bin/gemini",
      probeEnv,
    });

    expect(geminiModelContextTokens("gemini-3.5-flash")).toBe(1_048_576);
    expect(geminiModelContextTokens("gemma-4-26b-a4b-it")).toBe(256_000);
    expect(result).toMatchObject({
      efforts: ["low", "high"],
      defaultEffort: "high",
      modelEfforts: { "gemini-3.8-flash": ["low", "high"] },
      modelDefaultEfforts: { "gemini-3.8-flash": "high" },
      fastModels: ["gemini-3.8-flash"],
      subProviders: [{ id: "google", label: "Google" }],
      modelSubProvider: { "gemini-3.8-flash": "google" },
      contextSizes: [
        { id: "256K", label: "256K" },
        { id: "1M", label: "1M" },
      ],
      modelContextSizes: {
        "gemini-3.1-pro-preview": ["1M"],
        "gemini-3.8-flash": ["1M"],
        "gemma-4-31b-it": ["256K"],
      },
      authMethods: [
        {
          id: "gemini-terminal-login",
          name: "Login",
          type: "terminal",
          env: probeEnv,
        },
      ],
      authState: "missing",
    });
    expect(result?.modelContextSizes).not.toHaveProperty("auto-gemini-3");
    expect(result?.modelContextSizes).not.toHaveProperty("gemini-9-pro");
    expect(result?.thinkingModels).toEqual(["gemini-3.1-pro-preview"]);
    expect(probeAcpCapabilitiesMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.any(String),
      expect.objectContaining({
        env: {
          PATH: "/opt/homebrew/bin:/usr/bin:/bin",
          ...probeEnv,
        },
      }),
    );
  });

  it("discovers arbitrary dynamic models (gemini-4-hydrogen, gemini-4-argon, gemini-4-carbon) and merges dynamic ACP capabilities", async () => {
    const location: ProjectLocation = { kind: "posix", path: "/Users/demo/project" };
    buildAgentCommandMock.mockReturnValue({
      command: "/Users/demo/.local/bin/gemini",
      args: ["--acp", "--skip-trust"],
    });
    probeAcpCapabilitiesMock.mockResolvedValue({
      models: [
        { id: "gemini-4-hydrogen", label: "4 Hydrogen" },
        { id: "gemini-4-argon", label: "4 Argon" },
        { id: "gemini-4-carbon", label: "4 Carbon" },
        { id: "gemini-3.8-flash", label: "3.8 Flash" },
      ],
      efforts: ["low", "medium", "high"],
      defaultEffort: "medium",
      modelEfforts: {
        "gemini-4-hydrogen": ["low", "medium"],
        "gemini-4-argon": ["medium", "high"],
        "gemini-4-carbon": ["high"],
        "gemini-3.8-flash": ["low", "high"],
      },
      modelDefaultEfforts: {
        "gemini-4-hydrogen": "medium",
        "gemini-4-argon": "high",
        "gemini-4-carbon": "high",
      },
      thinkingModels: ["gemini-4-argon", "gemini-4-carbon"],
      fastModels: ["gemini-4-hydrogen", "gemini-3.8-flash"],
      contextSizes: [
        { id: "2M", label: "2M" },
        { id: "custom-1M", label: "1M (Dynamic)" },
      ],
      modelContextSizes: {
        "gemini-4-hydrogen": ["custom-1M"],
        "gemini-4-argon": ["2M"],
        // Override static 1M entry with dynamic ACP context option for 3.8 Flash
        "gemini-3.8-flash": ["custom-1M", "2M"],
      },
      modes: ["agent", "plan"],
      approvalPolicies: [
        { id: "default", label: "Default" },
        { id: "never", label: "YOLO" },
      ],
      slashCommands: [{ name: "plan", description: "Switch to plan mode" }],
    });

    const result = await geminiDetectionSpec.capabilitiesProbe?.({
      location,
      executablePath: "/Users/demo/.local/bin/gemini",
    });

    expect(result).toMatchObject({
      models: [
        { id: "gemini-4-hydrogen", label: "4 Hydrogen" },
        { id: "gemini-4-argon", label: "4 Argon" },
        { id: "gemini-4-carbon", label: "4 Carbon" },
        { id: "gemini-3.8-flash", label: "3.8 Flash" },
      ],
      efforts: ["low", "medium", "high"],
      defaultEffort: "medium",
      modelEfforts: {
        "gemini-4-hydrogen": ["low", "medium"],
        "gemini-4-argon": ["medium", "high"],
        "gemini-4-carbon": ["high"],
        "gemini-3.8-flash": ["low", "high"],
      },
      modelDefaultEfforts: {
        "gemini-4-hydrogen": "medium",
        "gemini-4-argon": "high",
        "gemini-4-carbon": "high",
      },
      thinkingModels: ["gemini-4-argon", "gemini-4-carbon"],
      fastModels: ["gemini-4-hydrogen", "gemini-3.8-flash"],
      contextSizes: [
        { id: "2M", label: "2M" },
        { id: "custom-1M", label: "1M (Dynamic)" },
      ],
      modelContextSizes: {
        "gemini-4-hydrogen": ["custom-1M"],
        "gemini-4-argon": ["2M"],
        "gemini-3.8-flash": ["custom-1M", "2M"],
      },
      modes: ["agent", "plan"],
      approvalPolicies: [
        { id: "default", label: "Default" },
        { id: "never", label: "YOLO" },
      ],
      slashCommands: [{ name: "plan", description: "Switch to plan mode" }],
    });
  });

  it("performs L3 credential probes and isolates profile homes with blanked host keys", async () => {
    const emptyHome = join(rootDir, "empty-home");
    mkdirSync(join(emptyHome, ".gemini"), { recursive: true });

    const missingResult = await geminiDetectionSpec.statusProbe?.({
      location: { kind: "posix", path: rootDir },
      executablePath: "/bin/gemini",
      probeEnv: {
        GEMINI_CLI_HOME: emptyHome,
        CLOUDSDK_CONFIG: join(rootDir, "no-gcloud"),
        ...GEMINI_BLANKED_HOST_CREDENTIALS,
      },
    });
    expect(missingResult).toEqual({ authState: "missing" });

    const authedHome = join(rootDir, "authed-home");
    mkdirSync(join(authedHome, ".gemini"), { recursive: true });
    writeFileSync(
      join(authedHome, ".gemini", "oauth_creds.json"),
      JSON.stringify({ access_token: "tok-123" }),
      "utf8",
    );
    writeFileSync(
      join(authedHome, ".gemini", "google_accounts.json"),
      JSON.stringify({ active: "pro@example.com" }),
      "utf8",
    );

    const authedResult = await geminiDetectionSpec.statusProbe?.({
      location: { kind: "posix", path: rootDir },
      executablePath: "/bin/gemini",
      probeEnv: {
        GEMINI_CLI_HOME: authedHome,
        CLOUDSDK_CONFIG: join(rootDir, "no-gcloud"),
        ...GEMINI_BLANKED_HOST_CREDENTIALS,
      },
    });
    expect(authedResult).toEqual({
      authState: "authenticated",
      providerMetadata: { authenticatedAs: "pro@example.com" },
    });

    const apiKeyResult = await geminiDetectionSpec.statusProbe?.({
      location: { kind: "posix", path: rootDir },
      executablePath: "/bin/gemini",
      probeEnv: {
        GEMINI_CLI_HOME: emptyHome,
        CLOUDSDK_CONFIG: join(rootDir, "no-gcloud"),
        ...GEMINI_BLANKED_HOST_CREDENTIALS,
        GEMINI_API_KEY: "test-api-key",
      },
    });
    expect(apiKeyResult).toEqual({
      authState: "authenticated",
      providerMetadata: { authMethod: "API key" },
    });

    // Profile FileKeychain API-key login (gemini-credentials.json + settings.json)
    const fileApiKeyHome = join(rootDir, "file-apikey-home");
    mkdirSync(join(fileApiKeyHome, ".gemini"), { recursive: true });
    writeFileSync(join(fileApiKeyHome, ".gemini", "gemini-credentials.json"), "iv:tag:ct", "utf8");
    writeFileSync(
      join(fileApiKeyHome, ".gemini", "settings.json"),
      JSON.stringify({ security: { auth: { selectedType: "gemini-api-key" } } }),
      "utf8",
    );
    const fileApiKeyResult = await geminiDetectionSpec.statusProbe?.({
      location: { kind: "posix", path: rootDir },
      executablePath: "/bin/gemini",
      probeEnv: {
        GEMINI_CLI_HOME: fileApiKeyHome,
        CLOUDSDK_CONFIG: join(rootDir, "no-gcloud"),
        ...GEMINI_BLANKED_HOST_CREDENTIALS,
      },
    });
    expect(fileApiKeyResult).toEqual({
      authState: "authenticated",
      providerMetadata: { authMethod: "API key" },
    });
  });

  it("detects interactive macOS Keychain API-key auth on host while skipping Keychain for profiles", async () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    readMacKeychainFingerprintMock.mockImplementation(async (entry) =>
      entry.service === "gemini-cli-api-key" && entry.account === "default-api-key"
        ? "fp-api-key"
        : undefined,
    );

    const fakeHome = join(rootDir, "mac-host");
    mkdirSync(join(fakeHome, ".gemini"), { recursive: true });
    writeFileSync(
      join(fakeHome, ".gemini", "settings.json"),
      JSON.stringify({ security: { auth: { selectedType: "gemini-api-key" } } }),
      "utf8",
    );

    // Host mode: no GEMINI_CLI_HOME, reads macOS Keychain gemini-cli-api-key.
    const hostResult = await geminiDetectionSpec.statusProbe?.({
      location: { kind: "posix", path: rootDir },
      executablePath: "/opt/homebrew/bin/gemini",
      probeEnv: {
        GEMINI_API_KEY: "",
        GOOGLE_API_KEY: "",
        GOOGLE_APPLICATION_CREDENTIALS: "",
        GOOGLE_CLOUD_PROJECT: "",
        GOOGLE_CLOUD_LOCATION: "",
        GOOGLE_GEMINI_BASE_URL: "",
        GEMINI_HOME: join(fakeHome, ".gemini"),
        CLOUDSDK_CONFIG: join(rootDir, "no-gcloud"),
      },
    });
    // Re-check with no GEMINI_CLI_HOME/GEMINI_HOME so hasCustomHome is false
    // (we use real probe without GEMINI_HOME when testing host keychain).
    expect(hostResult).toEqual({ authState: "missing" });

    const envKeys = [
      "GEMINI_API_KEY",
      "GOOGLE_API_KEY",
      "GOOGLE_APPLICATION_CREDENTIALS",
      "GOOGLE_CLOUD_PROJECT",
      "GOOGLE_CLOUD_LOCATION",
      "GOOGLE_GEMINI_BASE_URL",
      "GEMINI_CLI_HOME",
      "GEMINI_HOME",
      "GEMINI_FORCE_FILE_STORAGE",
      "CLOUDSDK_CONFIG",
    ] as const;
    const saved = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));
    for (const k of envKeys) delete process.env[k];
    try {
      const hostStatus = await geminiDetectionSpec.statusProbe?.({
        location: { kind: "posix", path: rootDir },
        executablePath: "/opt/homebrew/bin/gemini",
      });
      expect(hostStatus).toEqual({
        authState: "authenticated",
        providerMetadata: { authMethod: "API key" },
      });
      expect(readMacKeychainFingerprintMock).toHaveBeenCalledWith({
        service: "gemini-cli-api-key",
        account: "default-api-key",
      });

      readMacKeychainFingerprintMock.mockClear();
      const emptyProfile = join(rootDir, "profile-home");
      mkdirSync(join(emptyProfile, ".gemini"), { recursive: true });
      const profileStatus = await geminiDetectionSpec.statusProbe?.({
        location: { kind: "posix", path: rootDir },
        executablePath: "/opt/homebrew/bin/gemini",
        probeEnv: {
          GEMINI_CLI_HOME: emptyProfile,
          ...GEMINI_BLANKED_HOST_CREDENTIALS,
        },
      });
      expect(profileStatus).toEqual({ authState: "missing" });
      expect(readMacKeychainFingerprintMock).not.toHaveBeenCalled();
    } finally {
      for (const k of envKeys) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  });
});

describe("evaluateGeminiAuthEvidence", () => {
  it("classifies service accounts, Vertex ADC, FileKeychain, macOS Keychain API keys, custom base URL, and missing state", () => {
    expect(
      evaluateGeminiAuthEvidence({
        apiKeySet: false,
        serviceAccountPresent: true,
        vertexProjectSet: false,
        adcPresent: false,
        baseUrlSet: false,
        oauthCredsPresent: false,
        fileKeychainPresent: false,
        macKeychainPresent: false,
      }),
    ).toEqual({ authState: "authenticated", authMethod: "Service account" });

    expect(
      evaluateGeminiAuthEvidence({
        apiKeySet: false,
        serviceAccountPresent: false,
        vertexProjectSet: false,
        adcPresent: true,
        selectedAuthType: "vertex-ai",
        baseUrlSet: false,
        oauthCredsPresent: false,
        fileKeychainPresent: false,
        macKeychainPresent: false,
      }),
    ).toEqual({ authState: "authenticated", authMethod: "Vertex AI" });

    expect(
      evaluateGeminiAuthEvidence({
        apiKeySet: false,
        serviceAccountPresent: false,
        vertexProjectSet: false,
        adcPresent: false,
        baseUrlSet: false,
        oauthCredsPresent: false,
        fileKeychainPresent: true,
        macKeychainPresent: false,
      }),
    ).toEqual({ authState: "authenticated", authMethod: "Google account" });

    expect(
      evaluateGeminiAuthEvidence({
        apiKeySet: false,
        serviceAccountPresent: false,
        vertexProjectSet: false,
        adcPresent: false,
        selectedAuthType: "gemini-api-key",
        baseUrlSet: false,
        oauthCredsPresent: false,
        fileKeychainPresent: false,
        macKeychainPresent: false,
        macKeychainApiKeyPresent: true,
      }),
    ).toEqual({ authState: "authenticated", authMethod: "API key" });

    expect(
      evaluateGeminiAuthEvidence({
        apiKeySet: false,
        serviceAccountPresent: false,
        vertexProjectSet: false,
        adcPresent: false,
        selectedAuthType: "gemini-api-key",
        baseUrlSet: false,
        oauthCredsPresent: false,
        fileKeychainPresent: true,
        macKeychainPresent: false,
      }),
    ).toEqual({ authState: "authenticated", authMethod: "API key" });

    // Settings selection alone without backing credentials must not report authenticated.
    expect(
      evaluateGeminiAuthEvidence({
        apiKeySet: false,
        serviceAccountPresent: false,
        vertexProjectSet: false,
        adcPresent: false,
        selectedAuthType: "gemini-api-key",
        baseUrlSet: false,
        oauthCredsPresent: false,
        fileKeychainPresent: false,
        macKeychainPresent: false,
      }),
    ).toEqual({ authState: "missing" });

    expect(
      evaluateGeminiAuthEvidence({
        apiKeySet: false,
        serviceAccountPresent: false,
        vertexProjectSet: false,
        adcPresent: false,
        baseUrlSet: true,
        oauthCredsPresent: false,
        fileKeychainPresent: false,
        macKeychainPresent: false,
      }),
    ).toEqual({ authState: "unknown" });
  });
});

describe("parseGeminiGoogleAccountsJson", () => {
  it("returns the active account email", () => {
    expect(
      parseGeminiGoogleAccountsJson(
        JSON.stringify({ active: "user@gmail.com", old: ["other@gmail.com"] }),
      ),
    ).toBe("user@gmail.com");
  });

  it("returns undefined when no active account is set", () => {
    expect(parseGeminiGoogleAccountsJson(JSON.stringify({ old: [] }))).toBeUndefined();
    expect(parseGeminiGoogleAccountsJson(JSON.stringify({ active: "" }))).toBeUndefined();
  });

  it("returns undefined for malformed JSON", () => {
    expect(parseGeminiGoogleAccountsJson("not json")).toBeUndefined();
  });
});

describe("humanizeGeminiModelId", () => {
  it("strips only the leading provider prefix", () => {
    expect(humanizeGeminiModelId("gemini-2.5-pro")).toBe("2.5 Pro");
    expect(humanizeGeminiModelId("gemini-2.5-flash-lite")).toBe("2.5 Flash Lite");
    expect(humanizeGeminiModelId("auto-gemini-3")).toBe("Auto Gemini 3");
    expect(humanizeGeminiModelId("gemini-4-hydrogen")).toBe("4 Hydrogen");
    expect(humanizeGeminiModelId("gemini-4-argon")).toBe("4 Argon");
    expect(humanizeGeminiModelId("gemini-4-carbon")).toBe("4 Carbon");
    expect(humanizeGeminiModelId("gemini-3.8-flash")).toBe("3.8 Flash");
  });
});
