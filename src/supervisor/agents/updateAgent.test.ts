import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import type { AgentAdapter, AgentEnvContext } from "./base";
import {
  clearLatestVersionCache,
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
  },
  opencode: {
    builtIn: { binary: "opencode", args: ["upgrade"] },
    npm: "opencode-ai",
  },
  cursor: {
    builtIn: { binary: "cursor-agent", args: ["update"] },
    homebrewCask: "cursor-cli",
  },
  grok: {
    builtIn: { binary: "grok", args: ["update"] },
    npm: "@xai-official/grok",
    latestVersionUrls: [
      "https://x.ai/cli/stable",
      "https://storage.googleapis.com/grok-build-public-artifacts/cli/stable",
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
