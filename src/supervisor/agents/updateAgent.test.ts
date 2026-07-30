import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import type { AgentAdapter, AgentEnvContext } from "./base";
import {
  clearLatestVersionCache,
  getLatestSupportedNpmPackageVersion,
  getLatestVersionForAdapter,
  resolveUpdateCommand,
} from "./updateAgent";

const updateByKind: Record<string, AgentAdapter["update"]> = {
  claude: {
    builtIn: { binary: "claude", args: ["update"] },
    npm: "@anthropic-ai/claude-code",
    brew: "claude",
    winget: "Anthropic.ClaudeCode",
  },
  codex: {
    builtIn: { binary: "codex", args: ["update"] },
    npm: "@openai/codex",
  },
  gemini: {
    npm: "@google/gemini-cli",
    brew: "gemini-cli",
  },
  opencode: {
    builtIn: { binary: "opencode", args: ["upgrade"] },
    npm: "opencode-ai",
  },
  cursor: {
    builtIn: { binary: "cursor-agent", args: ["update"] },
    homebrewCask: "cursor-cli",
  },
  copilot: {
    builtIn: { binary: "copilot", args: ["update"] },
    npm: "@github/copilot",
    homebrewCask: "copilot-cli",
    winget: "GitHub.Copilot",
  },
  grok: {
    builtIn: { binary: "grok", args: ["update"] },
    npm: "@xai-official/grok",
    latestVersionUrls: [
      "https://x.ai/cli/stable",
      "https://storage.googleapis.com/grok-build-public-artifacts/cli/stable",
    ],
  },
  antigravity: {
    builtIn: { binary: "agy", args: ["update"] },
    latestVersionUrls: [
      "https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/linux_amd64.json",
    ],
  },
};

function makeStatus(overrides: Partial<AgentStatus>): AgentStatus {
  return {
    kind: overrides.kind ?? "codex",
    label: "Test",
    installed: true,
    authState: "unknown",
    capabilities: {
      models: [],
      efforts: [],
      modelEfforts: {},
      modes: [],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: false,
      supportsDirectInput: true,
      liveInputMode: "terminal",
      presentationMode: "terminal",
      settingDefs: [],
    },
    ...overrides,
  };
}

function makeAdapter(
  kind: string,
  override?: Partial<Pick<AgentAdapter, "buildUpdateCommand">>,
): AgentAdapter {
  const update = updateByKind[kind];
  return {
    kind,
    label: kind,
    capabilities: makeStatus({ kind }).capabilities,
    ...(update ? { update } : {}),
    detectInstall: async () => makeStatus({ kind }),
    buildLaunchArgv: () => ({ binary: kind, args: [] }),
    buildResumeArgv: () => ({ binary: kind, args: [] }),
    createInitialSessionRef: () => undefined,
    ...override,
  };
}

const NATIVE_WIN: AgentEnvContext = { envKind: "windows" };
const NATIVE_POSIX: AgentEnvContext = { envKind: "posix" };

describe("resolveUpdateCommand", () => {
  it("prefers an adapter-provided built-in updater", () => {
    const adapter = makeAdapter("claude", {
      buildUpdateCommand: () => ({ binary: "claude", args: ["update"], strategy: "built-in" }),
    });
    const command = resolveUpdateCommand(adapter, makeStatus({ kind: "claude" }), NATIVE_POSIX);
    expect(command).toEqual({ binary: "claude", args: ["update"], strategy: "built-in" });
  });

  it("uses claude's built-in updater regardless of install location", () => {
    // Claude ships `claude update`, which knows how to self-migrate across
    // install channels (brew, winget, native installer, npm). The shared
    // resolver always prefers it over package-manager paths.
    const adapter = makeAdapter("claude");
    const brewStatus = makeStatus({
      kind: "claude",
      executablePath: "/opt/homebrew/bin/claude",
    });
    expect(resolveUpdateCommand(adapter, brewStatus, NATIVE_POSIX)).toEqual({
      binary: "claude",
      args: ["update"],
      strategy: "built-in",
    });

    const wingetStatus = makeStatus({
      kind: "claude",
      executablePath:
        "C:\\Users\\me\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Anthropic.ClaudeCode\\claude.exe",
    });
    expect(resolveUpdateCommand(adapter, wingetStatus, NATIVE_WIN)).toEqual({
      binary: "claude",
      args: ["update"],
      strategy: "built-in",
    });
  });

  it("uses opencode's built-in upgrade command", () => {
    const adapter = makeAdapter("opencode");
    const status = makeStatus({ kind: "opencode", executablePath: "/usr/local/bin/opencode" });
    expect(resolveUpdateCommand(adapter, status, NATIVE_POSIX)).toEqual({
      binary: "opencode",
      args: ["upgrade"],
      strategy: "built-in",
    });
  });

  it("uses codex's built-in update command", () => {
    const adapter = makeAdapter("codex");
    const status = makeStatus({
      kind: "codex",
      executablePath: "C:\\Users\\me\\AppData\\Roaming\\npm\\codex.cmd",
    });
    expect(resolveUpdateCommand(adapter, status, NATIVE_WIN)).toEqual({
      binary: "codex",
      args: ["update"],
      strategy: "built-in",
    });
  });

  it("can resolve the fallback command when skipping a built-in updater", () => {
    const adapter = makeAdapter("codex");
    const status = makeStatus({
      kind: "codex",
      executablePath: "C:\\Users\\me\\AppData\\Roaming\\npm\\codex.cmd",
    });
    expect(resolveUpdateCommand(adapter, status, NATIVE_WIN, { skipBuiltIn: true })).toEqual({
      binary: "npm",
      args: ["install", "-g", "@openai/codex@latest"],
      strategy: "npm-global",
    });
  });

  it("falls back to the official Grok npm package when skipping the built-in updater", () => {
    const adapter = makeAdapter("grok");
    const status = makeStatus({
      kind: "grok",
      executablePath: "C:\\Users\\me\\.grok\\bin\\grok.exe",
    });
    expect(resolveUpdateCommand(adapter, status, NATIVE_WIN, { skipBuiltIn: true })).toEqual({
      binary: "npm",
      args: ["install", "-g", "@xai-official/grok@latest"],
      strategy: "npm-global",
    });
  });

  it("uses npm-global for gemini when the path is in an npm install location", () => {
    const adapter = makeAdapter("gemini");
    const status = makeStatus({
      kind: "gemini",
      executablePath: "C:\\Users\\me\\AppData\\Roaming\\npm\\gemini.cmd",
    });
    const command = resolveUpdateCommand(adapter, status, NATIVE_WIN);
    expect(command?.strategy).toBe("npm-global");
    expect(command?.binary).toBe("npm");
    expect(command?.args).toEqual(["install", "-g", "@google/gemini-cli@latest"]);
  });

  it("uses brew for Homebrew-installed Gemini", () => {
    const adapter = makeAdapter("gemini");
    const status = makeStatus({
      kind: "gemini",
      executablePath: "/opt/homebrew/bin/gemini",
    });
    const command = resolveUpdateCommand(adapter, status, NATIVE_POSIX);
    expect(command).toEqual({
      binary: "brew",
      args: ["upgrade", "gemini-cli"],
      strategy: "brew",
    });
  });

  it("uses Copilot's built-in updater with package-manager fallbacks", () => {
    const adapter = makeAdapter("copilot");
    const wingetStatus = makeStatus({
      kind: "copilot",
      executablePath:
        "C:\\Users\\me\\AppData\\Local\\Microsoft\\WinGet\\Packages\\GitHub.Copilot\\copilot.exe",
    });
    expect(resolveUpdateCommand(adapter, wingetStatus, NATIVE_WIN)).toEqual({
      binary: "copilot",
      args: ["update"],
      strategy: "built-in",
    });
    expect(resolveUpdateCommand(adapter, wingetStatus, NATIVE_WIN, { skipBuiltIn: true })).toEqual({
      binary: "winget",
      args: ["upgrade", "--id", "GitHub.Copilot", "--silent", "--accept-package-agreements"],
      strategy: "winget",
    });

    const brewStatus = makeStatus({
      kind: "copilot",
      executablePath: "/opt/homebrew/bin/copilot",
    });
    expect(resolveUpdateCommand(adapter, brewStatus, NATIVE_POSIX, { skipBuiltIn: true })).toEqual({
      binary: "brew",
      args: ["upgrade", "--cask", "copilot-cli"],
      strategy: "brew",
    });
  });

  it("does not use a Homebrew cask fallback for non-Homebrew Cursor installs", () => {
    const adapter = makeAdapter("cursor");
    const status = makeStatus({
      kind: "cursor",
      executablePath: "/home/user/.local/bin/cursor-agent",
    });
    expect(
      resolveUpdateCommand(adapter, status, NATIVE_POSIX, { skipBuiltIn: true }),
    ).toBeUndefined();
  });

  it("falls back to npm-global when the path doesn't match a known pattern but the kind has an npm package", () => {
    const adapter = makeAdapter("gemini");
    const status = makeStatus({
      kind: "gemini",
      executablePath: "/usr/local/bin/gemini", // non-brew, non-npm shape
    });
    const command = resolveUpdateCommand(adapter, status, NATIVE_POSIX);
    expect(command?.strategy).toBe("npm-global");
  });

  it("returns undefined when the adapter is unknown and no fallback exists", () => {
    const adapter = makeAdapter("homemade-agent");
    const status = makeStatus({ kind: "homemade-agent" });
    expect(resolveUpdateCommand(adapter, status, NATIVE_POSIX)).toBeUndefined();
  });
});

describe("getLatestVersionForAdapter", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    clearLatestVersionCache();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearLatestVersionCache();
  });

  it("fetches the latest npm version for a known adapter", async () => {
    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({ version: "0.150.0" }),
    } as Response);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await getLatestVersionForAdapter(makeAdapter("codex"));
    expect(result).toEqual({ version: "0.150.0", source: "npm" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const callUrl = fetchSpy.mock.calls[0]?.[0] as string;
    expect(callUrl).toContain("registry.npmjs.org");
    expect(callUrl).toContain("%40openai%2Fcodex");
  });

  it("caches per kind across calls", async () => {
    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({ version: "0.150.0" }),
    } as Response);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await getLatestVersionForAdapter(makeAdapter("codex"));
    await getLatestVersionForAdapter(makeAdapter("codex"));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("fetches the latest Homebrew cask version for Cursor", async () => {
    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      text: async () => 'cask "cursor-cli" do\n  version "2026.05.16-0338208"\nend',
    } as Response);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await getLatestVersionForAdapter(makeAdapter("cursor"));
    expect(result).toEqual({ version: "2026.05.16-0338208", source: "homebrew-cask" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const callUrl = fetchSpy.mock.calls[0]?.[0] as string;
    expect(callUrl).toContain("raw.githubusercontent.com/Homebrew/homebrew-cask");
    expect(callUrl).toContain("Casks/c/cursor-cli.rb");
  });

  it("fetches the latest version from provider version URLs", async () => {
    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      text: async () => "0.2.3\n",
    } as Response);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await getLatestVersionForAdapter(makeAdapter("grok"));
    expect(result).toEqual({ version: "0.2.3", source: "version-url" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("https://x.ai/cli/stable");
  });

  it("extracts a manifest version from provider version URLs", async () => {
    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ version: "1.0.4" }),
    } as Response);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await getLatestVersionForAdapter(makeAdapter("antigravity"));
    expect(result).toEqual({ version: "1.0.4", source: "version-url" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      "https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/linux_amd64.json",
    );
  });

  it("falls back to the next provider version URL", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 404 } as Response).mockResolvedValueOnce({
      ok: true,
      text: async () => "0.2.4",
    } as Response);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await getLatestVersionForAdapter(makeAdapter("grok"));
    expect(result).toEqual({ version: "0.2.4", source: "version-url" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1]?.[0]).toBe(
      "https://storage.googleapis.com/grok-build-public-artifacts/cli/stable",
    );
  });

  it("returns version: undefined for adapters without update metadata", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await getLatestVersionForAdapter(makeAdapter("homemade-agent"));
    expect(result.version).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns version: undefined on network failure (does not throw)", async () => {
    globalThis.fetch = (() => Promise.reject(new Error("network down"))) as unknown as typeof fetch;
    const result = await getLatestVersionForAdapter(makeAdapter("codex"));
    expect(result.version).toBeUndefined();
  });
});

describe("getLatestSupportedNpmPackageVersion", () => {
  const originalFetch = globalThis.fetch;
  const cursorSdkQuery = {
    name: "@cursor/sdk",
    minVersion: "1.0.24",
    maxExclusiveMajor: 2,
  };

  function registryResponse(versions: readonly string[]): Response {
    return {
      ok: true,
      json: async () => ({
        versions: Object.fromEntries(versions.map((version) => [version, { version }])),
      }),
    } as Response;
  }

  beforeEach(() => {
    clearLatestVersionCache();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearLatestVersionCache();
  });

  it("returns the newest supported version from the abbreviated registry document", async () => {
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockResolvedValue(registryResponse(["1.0.24", "1.0.31", "1.0.9"]));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await getLatestSupportedNpmPackageVersion(cursorSdkQuery);

    expect(result).toEqual({ version: "1.0.31", source: "npm" });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://registry.npmjs.org/%40cursor%2Fsdk");
    expect((init.headers as Record<string, string>).accept).toBe(
      "application/vnd.npm.install-v1+json",
    );
  });

  it("stays inside the window when a newer unsupported major is published", async () => {
    globalThis.fetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(registryResponse(["1.0.24", "2.0.0", "2.1.3"])) as unknown as typeof fetch;

    const result = await getLatestSupportedNpmPackageVersion(cursorSdkQuery);

    // Newest *supported* release only: a caller sitting on 1.0.24 sees nothing
    // newer, so no update is offered for the 2.x line the runtime can't load.
    expect(result).toEqual({ version: "1.0.24", source: "npm" });
  });

  it("ignores pre-releases and versions below the minimum", async () => {
    globalThis.fetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(registryResponse(["1.0.23", "1.1.0-beta.1"])) as unknown as typeof fetch;

    expect(await getLatestSupportedNpmPackageVersion(cursorSdkQuery)).toEqual({
      source: "unknown",
    });
  });

  it("returns no version on registry failure (does not throw)", async () => {
    globalThis.fetch = (() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;

    expect(await getLatestSupportedNpmPackageVersion(cursorSdkQuery)).toEqual({
      source: "unknown",
    });
  });

  it("caches per package and window", async () => {
    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(registryResponse(["1.0.31"]));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await getLatestSupportedNpmPackageVersion(cursorSdkQuery);
    await getLatestSupportedNpmPackageVersion(cursorSdkQuery);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
