import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import type { AgentAdapter, AgentEnvContext } from "./base";
const readAgentCommandOutputMock = vi.hoisted(() =>
  vi.fn<typeof import("./base").readAgentCommandOutput>(),
);
const resolveAgentBinaryPathMock = vi.hoisted(() =>
  vi.fn<typeof import("./binaryResolver").resolveAgentBinaryPath>(),
);

vi.mock("./base", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./base")>();
  return { ...actual, readAgentCommandOutput: readAgentCommandOutputMock };
});

vi.mock("./binaryResolver", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./binaryResolver")>();
  return { ...actual, resolveAgentBinaryPath: resolveAgentBinaryPathMock };
});

import {
  clearLatestVersionCache,
  getLatestSupportedNpmPackageVersion,
  getLatestVersionForAdapter,
  resolveUpdateCommand,
  runUpdateCommandWithFallback,
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
  qwen: {
    builtIn: { binary: "qwen", args: ["update"] },
    verifyBuiltInVersionChange: true,
    npm: "@qwen-code/qwen-code",
    brew: "qwen-code",
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
  fx: {
    builtIn: { binary: "fx", args: ["upgrade"] },
    latestVersionUrls: ["https://releases.fx.sh/latest.txt"],
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

  it("distinguishes Homebrew Cellar from Homebrew global npm via installPath", () => {
    const adapter = makeAdapter("gemini");
    const status = makeStatus({
      kind: "gemini",
      executablePath: "/opt/homebrew/bin/gemini",
    });

    expect(
      resolveUpdateCommand(adapter, status, NATIVE_POSIX, {
        installPath:
          "/opt/homebrew/Cellar/gemini-cli/0.69.0/libexec/lib/node_modules/@google/gemini-cli/bundle/gemini.js",
      }),
    ).toEqual({
      binary: "brew",
      args: ["upgrade", "gemini-cli"],
      strategy: "brew",
    });

    expect(
      resolveUpdateCommand(adapter, status, NATIVE_POSIX, {
        installPath: "/opt/homebrew/lib/node_modules/@google/gemini-cli/bundle/gemini.js",
      }),
    ).toEqual({
      binary: "npm",
      args: ["install", "-g", "@google/gemini-cli@latest"],
      strategy: "npm-global",
    });

    const intelStatus = makeStatus({
      kind: "gemini",
      executablePath: "/usr/local/bin/gemini",
    });
    expect(
      resolveUpdateCommand(adapter, intelStatus, NATIVE_POSIX, {
        installPath: "/usr/local/Cellar/gemini-cli/0.69.0/bin/gemini",
      }),
    ).toEqual({
      binary: "brew",
      args: ["upgrade", "gemini-cli"],
      strategy: "brew",
    });

    const caskAdapter = makeAdapter("cursor");
    const caskStatus = makeStatus({
      kind: "cursor",
      executablePath: "/opt/homebrew/bin/cursor-agent",
    });
    expect(
      resolveUpdateCommand(caskAdapter, caskStatus, NATIVE_POSIX, {
        skipBuiltIn: true,
        installPath: "/Applications/Cursor.app/Contents/Resources/app/bin/cursor-agent",
      }),
    ).toEqual({
      binary: "brew",
      args: ["upgrade", "--cask", "cursor-cli"],
      strategy: "brew",
    });
  });

  it("uses Qwen's built-in command before its package-manager fallback", () => {
    const adapter = makeAdapter("qwen");
    const status = makeStatus({
      kind: "qwen",
      executablePath: "C:\\Users\\me\\AppData\\Roaming\\fnm\\aliases\\default\\qwen.cmd",
    });
    expect(resolveUpdateCommand(adapter, status, NATIVE_WIN)).toEqual({
      binary: "qwen",
      args: ["update"],
      strategy: "built-in",
    });
    expect(resolveUpdateCommand(adapter, status, NATIVE_WIN, { skipBuiltIn: true })).toEqual({
      binary: "npm",
      args: ["install", "-g", "@qwen-code/qwen-code@latest"],
      strategy: "npm-global",
    });
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

describe("runUpdateCommandWithFallback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearLatestVersionCache();
  });

  it.each([false, true])(
    "pins Windows pnpm updates to the advertised version (fallback: %s)",
    async (builtIn) => {
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>().mockResolvedValue({
          ok: true,
          json: async () => ({ version: "2.0.0" }),
        } as Response),
      );
      const adapter: AgentAdapter = {
        ...makeAdapter("test-agent"),
        update: {
          npm: "test-agent",
          ...(builtIn ? { builtIn: { binary: "test-agent", args: ["update"] } } : {}),
        },
      };
      readAgentCommandOutputMock.mockImplementation(async (_location, binary) => ({
        ok: binary === "pnpm",
        stdout: binary === "pnpm" ? "updated" : "",
        stderr: binary === "pnpm" ? "" : "failed",
      }));
      expect(
        await runUpdateCommandWithFallback(
          adapter,
          makeStatus({
            kind: "test-agent",
            version: "1.0.0",
            executablePath: "E:\\pnpm\\test-agent.cmd",
          }),
          NATIVE_WIN,
        ),
      ).toEqual({ ok: true, strategy: "pnpm-global", output: "updated" });
      expect(readAgentCommandOutputMock).toHaveBeenLastCalledWith(
        expect.anything(),
        "pnpm",
        ["add", "-g", "test-agent@2.0.0"],
        { timeoutMs: 300_000 },
      );
    },
  );

  it("keeps latest-tag updates available when the upstream version is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue({ ok: false, status: 503 } as Response),
    );
    readAgentCommandOutputMock.mockResolvedValue({ ok: true, stdout: "updated", stderr: "" });
    const adapter: AgentAdapter = { ...makeAdapter("test-agent"), update: { npm: "test-agent" } };
    await runUpdateCommandWithFallback(
      adapter,
      makeStatus({ kind: "test-agent", executablePath: "E:\\pnpm\\test-agent.cmd" }),
      NATIVE_WIN,
    );
    expect(readAgentCommandOutputMock).toHaveBeenLastCalledWith(
      expect.anything(),
      "pnpm",
      ["add", "-g", "test-agent@latest"],
      { timeoutMs: 300_000 },
    );
  });

  it("serializes package-manager self-updates and fallback commands", async () => {
    const selfUpdatingAdapter: AgentAdapter = {
      ...makeAdapter("test-a"),
      update: {
        builtIn: { binary: "test-a", args: ["update"] },
        npm: "test-agent-a",
      },
    };
    const packageAdapter: AgentAdapter = {
      ...makeAdapter("test-b"),
      update: { npm: "test-agent-b" },
    };
    let finishSelfUpdate!: () => void;
    let finishFallback!: () => void;
    readAgentCommandOutputMock.mockImplementation(async (_location, binary, args) => {
      if (binary === "test-a") {
        await new Promise<void>((resolve) => {
          finishSelfUpdate = resolve;
        });
        return { ok: false, stdout: "self-update failed", stderr: "" };
      }
      if (args.includes("test-agent-a@latest")) {
        await new Promise<void>((resolve) => {
          finishFallback = resolve;
        });
      }
      return { ok: true, stdout: "updated", stderr: "" };
    });
    const first = runUpdateCommandWithFallback(
      selfUpdatingAdapter,
      makeStatus({
        kind: "test-a",
        executablePath: "/usr/local/lib/node_modules/test-agent-a/bin.js",
      }),
      NATIVE_POSIX,
    );
    await vi.waitFor(() => expect(readAgentCommandOutputMock).toHaveBeenCalledTimes(1));
    const second = runUpdateCommandWithFallback(
      packageAdapter,
      makeStatus({ kind: "test-b" }),
      NATIVE_POSIX,
    );
    finishSelfUpdate();
    await vi.waitFor(() => expect(readAgentCommandOutputMock).toHaveBeenCalledTimes(3));
    expect(readAgentCommandOutputMock.mock.calls[1]?.[2]).toEqual([
      "install",
      "-g",
      "test-agent-b@latest",
    ]);
    finishFallback();
    expect(await first).toMatchObject({ ok: true, strategy: "npm-global" });
    expect(await second).toMatchObject({ ok: true, strategy: "npm-global" });
    expect(readAgentCommandOutputMock.mock.calls[2]?.[2]).toEqual([
      "install",
      "-g",
      "test-agent-a@latest",
    ]);
  });

  it("runs native self-updaters concurrently even when they advertise an npm fallback", async () => {
    const adapters = ["test-a", "test-b"].map((kind) => ({
      ...makeAdapter(kind),
      update: { builtIn: { binary: kind, args: ["update"] }, npm: kind },
    }));
    const finishes: Array<() => void> = [];
    readAgentCommandOutputMock.mockImplementation(async () => {
      await new Promise<void>((resolve) => finishes.push(resolve));
      return { ok: true, stdout: "updated", stderr: "" };
    });
    const results = adapters.map((adapter) =>
      runUpdateCommandWithFallback(
        adapter,
        makeStatus({ kind: adapter.kind, executablePath: `/Users/me/.local/bin/${adapter.kind}` }),
        NATIVE_POSIX,
      ),
    );
    await vi.waitFor(() => expect(finishes).toHaveLength(2));
    finishes.forEach((finish) => finish());
    expect(await Promise.all(results)).toEqual([
      { ok: true, strategy: "built-in", output: "updated" },
      { ok: true, strategy: "built-in", output: "updated" },
    ]);
  });

  it("uses the package-manager fallback when a successful built-in update is not verified", async () => {
    readAgentCommandOutputMock
      .mockResolvedValueOnce({ ok: true, stdout: "Run npm install -g", stderr: "" })
      .mockResolvedValueOnce({ ok: true, stdout: "updated", stderr: "" });
    const verifyBuiltInSuccess = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
    const adapter = makeAdapter("qwen");
    const status = makeStatus({
      kind: "qwen",
      version: "0.21.0",
      executablePath: "C:\\Users\\me\\AppData\\Roaming\\npm\\qwen.cmd",
    });

    const result = await runUpdateCommandWithFallback(adapter, status, NATIVE_WIN, {
      verifyBuiltInSuccess,
    });

    expect(result).toEqual({ ok: true, strategy: "npm-global", output: "updated" });
    expect(verifyBuiltInSuccess).toHaveBeenCalledOnce();
    expect(readAgentCommandOutputMock).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      "qwen",
      ["update"],
      { timeoutMs: 5 * 60 * 1000 },
    );
    expect(readAgentCommandOutputMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      "npm",
      ["install", "-g", "@qwen-code/qwen-code@latest"],
      { timeoutMs: 5 * 60 * 1000 },
    );
  });

  describe("post-update health check", () => {
    const EXECUTABLE = "/usr/local/lib/node_modules/test-agent/bin.js";
    const NPM_INSTALL = ["install", "-g", "test-agent@latest"];
    const MISSING_NATIVE =
      "Error: Missing optional dependency test-agent-native. Reinstall: npm install -g test-agent@latest";

    function healthAdapter(update: AgentAdapter["update"] = { npm: "test-agent" }): AgentAdapter {
      return { ...makeAdapter("test-agent"), update, postUpdateHealthArgs: ["--version"] };
    }

    function runHealthUpdate(adapter: AgentAdapter = healthAdapter()) {
      return runUpdateCommandWithFallback(
        adapter,
        makeStatus({ kind: "test-agent", version: "1.0.0", executablePath: EXECUTABLE }),
        NATIVE_POSIX,
      );
    }

    /** Scripts npm and the health probe: each probe result is consumed in order. */
    function scriptCommands(options: { npm: boolean[]; health: boolean[] }) {
      const npmResults = [...options.npm];
      const healthResults = [...options.health];
      readAgentCommandOutputMock.mockReset();
      readAgentCommandOutputMock.mockImplementation(async (_location, binary) => {
        if (binary === "npm") {
          const ok = npmResults.shift() ?? true;
          return { ok, stdout: ok ? "npm ran" : "npm failed: EBUSY", stderr: "" };
        }
        const ok = healthResults.shift() ?? true;
        return ok
          ? { ok, stdout: "test-agent 2.0.0", stderr: "" }
          : { ok, stdout: "", stderr: MISSING_NATIVE };
      });
      const calls = () =>
        readAgentCommandOutputMock.mock.calls.map(
          ([, binary, args]) => `${binary} ${args.join(" ")}`,
        );
      return { calls };
    }

    it("runs the declared health check once after a successful update", async () => {
      const { calls } = scriptCommands({ npm: [true], health: [true] });

      expect(await runHealthUpdate()).toEqual({
        ok: true,
        strategy: "npm-global",
        output: "npm ran",
      });
      expect(calls()).toEqual([`npm ${NPM_INSTALL.join(" ")}`, `${EXECUTABLE} --version`]);
    });

    it("re-runs the update once when the CLI does not start afterwards", async () => {
      const { calls } = scriptCommands({ npm: [true, true], health: [false, true] });

      expect(await runHealthUpdate()).toEqual({
        ok: true,
        strategy: "npm-global",
        output: "npm ran",
      });
      expect(calls()).toEqual([
        `npm ${NPM_INSTALL.join(" ")}`,
        `${EXECUTABLE} --version`,
        `npm ${NPM_INSTALL.join(" ")}`,
        `${EXECUTABLE} --version`,
      ]);
    });

    it("reports a failure with the CLI error when the repair does not help", async () => {
      const { calls } = scriptCommands({ npm: [true, true], health: [false, false] });

      const result = await runHealthUpdate();

      expect(result).toMatchObject({ ok: false, strategy: "npm-global" });
      expect(result.output).toContain(`${EXECUTABLE} --version`);
      expect(result.output).toContain(MISSING_NATIVE);
      expect(result.output).toContain("did not repair it");
      expect(calls()).toHaveLength(4);
    });

    it("shows PowerShell CLIXML errors from the check as plain text", async () => {
      const clixml =
        '#< CLIXML\n<Objs Version="1.1.0.1" xmlns="http://schemas.microsoft.com/powershell/2004/04">' +
        '<S S="Error">The term &apos;test-agent&apos; is not recognized_x000D__x000A_</S></Objs>';
      readAgentCommandOutputMock.mockReset();
      readAgentCommandOutputMock.mockImplementation(async (_location, binary) =>
        binary === "npm"
          ? { ok: true, stdout: "npm ran", stderr: "" }
          : { ok: false, stdout: "", stderr: clixml },
      );

      const result = await runHealthUpdate();

      expect(result.ok).toBe(false);
      expect(result.output).toContain("The term 'test-agent' is not recognized");
      expect(result.output).not.toContain("CLIXML");
    });

    it("leads with the reason so a truncated message still names it", async () => {
      // A Node launcher's uncaught error opens with source-line noise, and the
      // renderer shows only the first 240 characters of the update output.
      const nodeStack = [
        "file:///C:/Users/me/AppData/Roaming/npm/node_modules/test-agent/bin/launcher.js:108",
        "  throw new Error(",
        "        ^",
        "",
        MISSING_NATIVE,
        "    at findExecutable (file:///launcher.js:108:9)",
        "Node.js v26.13.0",
      ].join("\n");
      readAgentCommandOutputMock.mockReset();
      readAgentCommandOutputMock.mockImplementation(async (_location, binary) =>
        binary === "npm"
          ? { ok: true, stdout: "npm ran", stderr: "" }
          : { ok: false, stdout: "", stderr: nodeStack },
      );

      const { output = "" } = await runHealthUpdate();

      expect(output.slice(0, 240)).toContain("Missing optional dependency test-agent-native");
      expect(output.slice(0, 240)).not.toContain("throw new Error(");
      expect(output).toContain("did not repair it");
      expect(output).toContain("at findExecutable");
    });

    it("keeps the lead visible when a failing repair prints a very long log", async () => {
      const longLog = Array.from({ length: 400 }, (_, i) => `npm warn cleanup line ${i}`).join(
        "\n",
      );
      readAgentCommandOutputMock.mockReset();
      readAgentCommandOutputMock.mockImplementation(async (_location, binary) =>
        binary === "npm"
          ? { ok: readAgentCommandOutputMock.mock.calls.length < 2, stdout: longLog, stderr: "" }
          : { ok: false, stdout: "", stderr: MISSING_NATIVE },
      );

      const { output = "" } = await runHealthUpdate();

      expect(output.startsWith("The update finished but the installed CLI does not start")).toBe(
        true,
      );
      expect(output.slice(0, 240)).toContain("Missing optional dependency test-agent-native");
      expect(output.length).toBeLessThan(4_096);
    });

    it("keeps the repair command's own error when the repair fails", async () => {
      scriptCommands({ npm: [true, false], health: [false] });

      const { output = "" } = await runHealthUpdate();

      expect(output).toContain("failed:\nnpm failed: EBUSY");
      expect(output).toContain(MISSING_NATIVE);
    });

    it("keeps the diagnosis when the queue deadline lapsed during a long update", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        let installs = 0;
        readAgentCommandOutputMock.mockReset();
        readAgentCommandOutputMock.mockImplementation(async (_location, binary) => {
          if (binary !== "npm") return { ok: false, stdout: "", stderr: MISSING_NATIVE };
          installs += 1;
          // The first install outlasts the 20 minute queue-admission deadline.
          vi.setSystemTime(Date.now() + 21 * 60_000);
          return { ok: true, stdout: "npm ran", stderr: "" };
        });

        const result = await runHealthUpdate();

        expect(installs).toBe(1);
        expect(result).toMatchObject({ ok: false, strategy: "npm-global" });
        expect(result.output).toContain("could not run: The update waited too long");
        expect(result.output).toContain(MISSING_NATIVE);
      } finally {
        vi.useRealTimers();
      }
    });

    it("checks the install after a built-in update fails and the package manager fallback runs", async () => {
      const { calls } = scriptCommands({ npm: [true, true], health: [false, true] });
      readAgentCommandOutputMock.mockImplementationOnce(async () => ({
        ok: false,
        stdout: "",
        stderr: "update failed",
      }));
      const adapter = healthAdapter({
        builtIn: { binary: "test-agent", args: ["update"] },
        npm: "test-agent",
      });

      const result = await runUpdateCommandWithFallback(
        adapter,
        makeStatus({ kind: "test-agent", version: "1.0.0", executablePath: EXECUTABLE }),
        NATIVE_POSIX,
      );

      expect(result).toMatchObject({ ok: true, strategy: "npm-global" });
      expect(calls()).toEqual([
        "test-agent update",
        `npm ${NPM_INSTALL.join(" ")}`,
        `${EXECUTABLE} --version`,
        `npm ${NPM_INSTALL.join(" ")}`,
        `${EXECUTABLE} --version`,
      ]);
    });

    it("cannot check an install whose executable path is unknown", async () => {
      const { calls } = scriptCommands({ npm: [true], health: [] });

      const result = await runUpdateCommandWithFallback(
        healthAdapter(),
        makeStatus({ kind: "test-agent", version: "1.0.0" }),
        NATIVE_POSIX,
      );

      expect(result).toMatchObject({ ok: true, strategy: "npm-global" });
      expect(calls()).toEqual([`npm ${NPM_INSTALL.join(" ")}`]);
    });

    it("reports a failure when the repair command itself fails", async () => {
      const { calls } = scriptCommands({ npm: [true, false], health: [false] });

      const result = await runHealthUpdate();

      expect(result).toMatchObject({ ok: false, strategy: "npm-global" });
      expect(result.output).toContain(MISSING_NATIVE);
      expect(calls()).toEqual([
        `npm ${NPM_INSTALL.join(" ")}`,
        `${EXECUTABLE} --version`,
        `npm ${NPM_INSTALL.join(" ")}`,
      ]);
    });

    it("skips the health check when the update itself failed", async () => {
      const { calls } = scriptCommands({ npm: [false], health: [] });

      expect(await runHealthUpdate()).toMatchObject({ ok: false, strategy: "npm-global" });
      expect(calls()).toEqual([`npm ${NPM_INSTALL.join(" ")}`]);
    });

    it("does not run any check for adapters that declare none", async () => {
      const { calls } = scriptCommands({ npm: [true], health: [] });
      const adapter: AgentAdapter = { ...makeAdapter("test-agent"), update: { npm: "test-agent" } };

      expect(await runHealthUpdate(adapter)).toMatchObject({ ok: true });
      expect(calls()).toEqual([`npm ${NPM_INSTALL.join(" ")}`]);
    });

    it("never re-runs a self-updater that leaves a broken CLI", async () => {
      readAgentCommandOutputMock.mockReset();
      readAgentCommandOutputMock.mockImplementation(async (_location, _binary, args) =>
        args[0] === "update"
          ? { ok: true, stdout: "self-updated", stderr: "" }
          : { ok: false, stdout: "", stderr: MISSING_NATIVE },
      );
      const adapter = healthAdapter({
        builtIn: { binary: "test-agent", args: ["update"] },
        npm: "test-agent",
      });

      const result = await runUpdateCommandWithFallback(
        adapter,
        makeStatus({ kind: "test-agent", executablePath: "/Users/me/.local/bin/test-agent" }),
        NATIVE_POSIX,
      );

      expect(result).toMatchObject({ ok: false, strategy: "built-in" });
      expect(result.output).toContain(MISSING_NATIVE);
      expect(result.output).not.toContain("did not repair it");
      expect(readAgentCommandOutputMock.mock.calls.map(([, , args]) => args.join(" "))).toEqual([
        "update",
        "--version",
      ]);
    });
  });

  it("does not apply adapter baseSpawnEnv to the explicit update spawn", async () => {
    readAgentCommandOutputMock.mockResolvedValue({ ok: true, stdout: "updated", stderr: "" });
    const adapter = {
      ...makeAdapter("antigravity"),
      baseSpawnEnv: { AGY_CLI_DISABLE_AUTO_UPDATE: "1" },
    };
    const status = makeStatus({
      kind: "antigravity",
      executablePath: "C:\\agy.exe",
    });

    const result = await runUpdateCommandWithFallback(adapter, status, NATIVE_WIN);

    expect(result).toEqual({ ok: true, strategy: "built-in", output: "updated" });
    expect(readAgentCommandOutputMock).toHaveBeenCalledWith(expect.anything(), "agy", ["update"], {
      timeoutMs: 5 * 60 * 1000,
    });
    expect(readAgentCommandOutputMock.mock.calls[0]?.[3]).not.toHaveProperty("env");
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

  it("fetches the Homebrew formula stable version when preferHomebrewFormula is set", async () => {
    const fetchSpy = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("formulae.brew.sh/api/formula/gemini-cli.json")) {
        return {
          ok: true,
          json: async () => ({ name: "gemini-cli", versions: { stable: "0.69.0" } }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ version: "0.70.0" }),
      } as Response;
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const brewResult = await getLatestVersionForAdapter(makeAdapter("gemini"), {
      preferHomebrewFormula: true,
    });
    const npmResult = await getLatestVersionForAdapter(makeAdapter("gemini"));

    expect(brewResult).toEqual({ version: "0.69.0", source: "version-url" });
    expect(npmResult).toEqual({ version: "0.70.0", source: "npm" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(
      "https://formulae.brew.sh/api/formula/gemini-cli.json",
    );
  });

  it("does not fall back to npm when the Homebrew formula probe fails", async () => {
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockResolvedValue({ ok: false, status: 503 } as Response);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await getLatestVersionForAdapter(makeAdapter("gemini"), {
      preferHomebrewFormula: true,
    });

    expect(result).toEqual({ source: "unknown" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("auto-selects Homebrew formula vs npm channel from cached native status", async () => {
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: { stable: "0.69.0" } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: "0.70.0" }),
      } as Response);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const brewResult = await getLatestVersionForAdapter(makeAdapter("gemini"), {
      getNativeStatus: () =>
        makeStatus({
          kind: "gemini",
          executablePath: "/opt/homebrew/Cellar/gemini-cli/0.69.0/bin/gemini",
          envKind: "posix",
        }),
    });
    expect(brewResult).toEqual({ version: "0.69.0", source: "version-url" });
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      "https://formulae.brew.sh/api/formula/gemini-cli.json",
    );

    const npmResult = await getLatestVersionForAdapter(makeAdapter("gemini"), {
      getNativeStatus: () =>
        makeStatus({
          kind: "gemini",
          executablePath: "/opt/homebrew/lib/node_modules/@google/gemini-cli/bundle/gemini.js",
          envKind: "posix",
        }),
    });
    expect(npmResult).toEqual({ version: "0.70.0", source: "npm" });
    expect(fetchSpy.mock.calls[1]?.[0]).toBe(
      "https://registry.npmjs.org/%40google%2Fgemini-cli/latest",
    );
  });

  it("resolves Homebrew channel from PATH when the native status cache is cold", async () => {
    resolveAgentBinaryPathMock
      .mockReset()
      .mockReturnValue("/opt/homebrew/Cellar/gemini-cli/0.69.0/bin/gemini");
    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({ versions: { stable: "0.69.0" } }),
    } as Response);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const geminiWithBinary = { ...makeAdapter("gemini"), binary: "gemini" };
    const result = await getLatestVersionForAdapter(geminiWithBinary, {
      getNativeStatus: () => undefined,
    });

    expect(result).toEqual({ version: "0.69.0", source: "version-url" });
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      "https://formulae.brew.sh/api/formula/gemini-cli.json",
    );
  });

  it("skips native status lookup when a built-in updater outranks Homebrew", async () => {
    const getNativeStatus = vi.fn<() => AgentStatus | undefined>();
    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({ version: "2.1.0" }),
    } as Response);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await getLatestVersionForAdapter(makeAdapter("claude"), { getNativeStatus });

    expect(result).toEqual({ version: "2.1.0", source: "npm" });
    expect(getNativeStatus).not.toHaveBeenCalled();
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

  it("strips a leading v from plain-text provider version URLs", async () => {
    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      text: async () => "v0.0.15\n",
    } as Response);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await getLatestVersionForAdapter(makeAdapter("fx"));
    expect(result).toEqual({ version: "0.0.15", source: "version-url" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("https://releases.fx.sh/latest.txt");
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

  it("offers no version when a plain-text version URL answers with a page", async () => {
    // An intercepting proxy's block or sign-in page arrives as a 200 body.
    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      text: async () => "<!doctype html><html><body>Sign in to continue</body></html>",
    } as Response);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await getLatestVersionForAdapter(makeAdapter("fx"));

    expect(result).toEqual({ source: "unknown" });
  });

  it("moves past a plain-text version URL that answers with a page", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        text: async () => "<html><body>Blocked by policy</body></html>",
      } as Response)
      .mockResolvedValueOnce({ ok: true, text: async () => "0.2.4" } as Response);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await getLatestVersionForAdapter(makeAdapter("grok"));

    expect(result).toEqual({ version: "0.2.4", source: "version-url" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
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
