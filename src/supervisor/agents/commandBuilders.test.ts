import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation, SessionRef, ThreadConfig } from "@/shared/contracts";

vi.mock("./codex/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./codex/session")>();
  return {
    ...actual,
    readCodexSessionIndexForLocation: () => [],
    readCodexRolloutsForLocation: () => [],
    readCodexRolloutMetaForLocation: () => undefined,
  };
});

vi.mock("./codex/plugin/install", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./codex/plugin/install")>();
  return {
    ...actual,
    isCodexSemverSupportedForGoals: () => true,
    probeCodexCliSemver: () => [999, 0, 0] as [number, number, number],
  };
});

// Skip slow PATH / WSL probes. These tests only exercise argv-shaping logic;
// resolving the binary against the host or distro PATH is irrelevant and
// flakes under parallel load when many suites spawn wsl.exe at once.
vi.mock("./binaryResolver", async (importActual) => {
  const actual = await importActual<typeof import("./binaryResolver")>();
  return {
    ...actual,
    resolveAgentBinaryPath: (location: { kind: string }, binary: string) =>
      location.kind === "posix"
        ? actual.resolveAgentBinaryPath(location as never, binary)
        : undefined,
  };
});

vi.mock("./base/processRuntime", async (importActual) => {
  const actual = await importActual<typeof import("./base/processRuntime")>();
  const shellBinaries = new Set(["pwsh.exe", "pwsh", "powershell.exe", "powershell"]);
  return {
    ...actual,
    resolveWslShellPath: () => "/bin/bash",
    // Keep shell detection real, but skip PATH resolution for agent CLIs so
    // Windows tests assert argv shaping (`codex`, `copilot`) instead of fnm
    // node.exe / .cmd shim expansion on the host machine.
    resolveExecutablePath: (binary: string) =>
      shellBinaries.has(binary) ? actual.resolveExecutablePath(binary) : undefined,
  };
});

import {
  buildWindowsCommand,
  getWslCommand,
  resolveLaunchSpec,
  type AgentAdapter,
  type AgentLaunchOptions,
  type CommandSpec,
} from "./base";
import { createClaudeAdapter } from "./claude";
import { createCopilotAdapter } from "./copilot";
import { buildCodexAppServerCommand, createCodexAdapter } from "./codex";
import { primeCodexGoalsSupport } from "./codex/argv";
import { createCursorAdapter } from "./cursor";

function launch(
  adapter: AgentAdapter,
  location: ProjectLocation,
  config: ThreadConfig,
  prompt: string,
  sessionRef?: SessionRef,
  launchOptions?: AgentLaunchOptions,
): CommandSpec {
  return resolveLaunchSpec(
    location,
    adapter.buildLaunchArgv(location, config, prompt, sessionRef, launchOptions),
  );
}

function resume(
  adapter: AgentAdapter,
  location: ProjectLocation,
  config: ThreadConfig,
  prompt: string,
  sessionRef: SessionRef,
  launchOptions?: AgentLaunchOptions,
): CommandSpec {
  return resolveLaunchSpec(
    location,
    adapter.buildResumeArgv(location, config, prompt, sessionRef, launchOptions),
  );
}

function decodePowerShellEncodedCommand(encoded: string): string {
  return Buffer.from(encoded, "base64").toString("utf16le");
}

/** Parse the logical command and its arguments from a Windows CommandSpec (handles both PowerShell and cmd.exe). */
function parseWindowsSpec(spec: { args: string[] }): { cmd: string; cmdArgs: string[] } {
  if (spec.args[0] === "-NoLogo") {
    const script = decodePowerShellEncodedCommand(spec.args[3]!);
    const cmd = script.match(/\$cmd = '((?:[^']|'')*)'/)?.[1]?.replaceAll("''", "'") ?? "";
    const argsStr = script.match(/\$args = @\((.*)\)/)?.[1] ?? "";
    const cmdArgs = argsStr
      ? argsStr.split(", ").map((a) => a.replace(/^'|'$/g, "").replaceAll("''", "'"))
      : [];
    return { cmd, cmdArgs };
  }
  return { cmd: spec.args[3]!, cmdArgs: spec.args.slice(4) };
}

const windowsProject: ProjectLocation = {
  kind: "windows",
  path: "C:\\Users\\demo\\project",
};

const wslProject: ProjectLocation = {
  kind: "wsl",
  distro: "Ubuntu",
  linuxPath: "/home/demo/project",
  uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\project",
};

const config: ThreadConfig = {
  model: "gpt-5.4",
  effort: "high",
  mode: "agent",
  approvalPolicy: "on-request",
  sandboxMode: "workspace-write",
};

function clearBrowserMcpEnv(): void {
  delete process.env.LIGHTCODE_BROWSER_MCP_URL;
  delete process.env.LIGHTCODE_BROWSER_MCP_TOKEN;
}

describe("agent command builders", () => {
  beforeEach(() => {
    clearBrowserMcpEnv();
  });
  it.skipIf(process.platform !== "win32")("builds a Windows Codex launch command", () => {
    const spec = launch(createCodexAdapter(), windowsProject, config, "hello");
    expect(spec.cwd).toBe("C:\\Users\\demo\\project");
    const { cmd, cmdArgs } = parseWindowsSpec(spec);
    expect(cmd).toBe("codex");
    expect(cmdArgs).toContain("hello");
  });

  it.skipIf(process.platform !== "win32")(
    "builds a WSL Codex launch command via login shell",
    () => {
      const spec = launch(createCodexAdapter(), wslProject, config, "hello");
      expect(spec.command.toLowerCase()).toBe(getWslCommand().toLowerCase());
      expect(spec.args.slice(0, 5)).toEqual(["-d", "Ubuntu", "--cd", "/home/demo/project", "--"]);
      // After "--", the next args are: shellPath, "-l", "-i", "-c", script
      expect(spec.args[6]).toBe("-l");
      expect(spec.args[7]).toBe("-i");
      expect(spec.args[8]).toBe("-c");
      const script = spec.args[9]!;
      expect(script).toContain("-m");
      expect(script).toContain("gpt-5.4");
      expect(script).toContain("-a");
      expect(script).toContain("on-request");
      expect(script).toContain("workspace-write");
      expect(script).toContain("hello");
    },
    20_000,
  );

  it("builds a Codex app-server stdio command", () => {
    const spec = buildCodexAppServerCommand(windowsProject);

    const { cmd, cmdArgs } = parseWindowsSpec(spec);
    expect(cmd).toBe("codex");
    expect(cmdArgs).toEqual(["--enable", "goals", "app-server"]);
    expect(cmdArgs).not.toContain("--listen");
    expect(cmdArgs).not.toContain("--remote");
    expect(cmdArgs).not.toContain("--session-source");
  });

  it("injects Codex browser MCP config when enabled, using a token env var", () => {
    const oldUrl = process.env.LIGHTCODE_BROWSER_MCP_URL;
    const oldToken = process.env.LIGHTCODE_BROWSER_MCP_TOKEN;
    process.env.LIGHTCODE_BROWSER_MCP_URL = "http://127.0.0.1:9123";
    process.env.LIGHTCODE_BROWSER_MCP_TOKEN = "secret-token";
    try {
      const spec = buildCodexAppServerCommand(windowsProject, { browserMcpEnabled: true });
      const { cmdArgs } = parseWindowsSpec(spec);

      expect(cmdArgs).toContain('mcp_servers.browser.url="http://127.0.0.1:9123/mcp"');
      expect(cmdArgs).toContain(
        'mcp_servers.browser.bearer_token_env_var="LIGHTCODE_BROWSER_MCP_TOKEN"',
      );
      expect(cmdArgs).not.toContain('mcp_servers.browser.bearer_token="secret-token"');

      const disabledSpec = buildCodexAppServerCommand(windowsProject);
      const { cmdArgs: disabledArgs } = parseWindowsSpec(disabledSpec);
      expect(disabledArgs.some((a) => a.startsWith("mcp_servers.browser"))).toBe(false);
    } finally {
      if (oldUrl === undefined) {
        delete process.env.LIGHTCODE_BROWSER_MCP_URL;
      } else {
        process.env.LIGHTCODE_BROWSER_MCP_URL = oldUrl;
      }
      if (oldToken === undefined) {
        delete process.env.LIGHTCODE_BROWSER_MCP_TOKEN;
      } else {
        process.env.LIGHTCODE_BROWSER_MCP_TOKEN = oldToken;
      }
    }
  });

  it("resumes the server thread when structured session provides a threadId", () => {
    const spec = launch(createCodexAdapter(), windowsProject, config, "", undefined, {
      suppressResumeConfigOverrides: true,
      resumeThreadId: "019d19c4-8050-7270-b8fc-589eee8136c2",
    });

    const { cmdArgs } = parseWindowsSpec(spec);
    expect(cmdArgs[0]).toBe("resume");
    expect(cmdArgs.slice(1, 3)).toEqual(["--enable", "goals"]);
    expect(cmdArgs).not.toContain("--remote");
    expect(cmdArgs).not.toContain("-m");
    expect(cmdArgs[cmdArgs.length - 1]).toBe("019d19c4-8050-7270-b8fc-589eee8136c2");
  });

  it("builds a WSL Codex app-server command without a login shell", () => {
    // WSL goals support is detected asynchronously and cached during detection
    // (see codex/index.ts), so prime it the way detection would before building
    // the launch command — otherwise it defaults to off and `--enable goals`
    // is omitted.
    primeCodexGoalsSupport(wslProject, "codex-cli 0.130.0", "/home/demo/.local/bin/codex");
    const spec = buildCodexAppServerCommand(wslProject, {
      wslExecPath: "/home/demo/.local/bin/codex",
      wslNodePath: "/home/demo/.nvm/versions/node/v24.10.0/bin/node",
    });

    expect(spec.command.toLowerCase()).toBe(getWslCommand().toLowerCase());
    expect(spec.args).toEqual([
      "-d",
      "Ubuntu",
      "--cd",
      "/home/demo/project",
      "--",
      "/usr/bin/env",
      "PATH=/home/demo/.nvm/versions/node/v24.10.0/bin:/home/demo/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      "/home/demo/.local/bin/codex",
      "--enable",
      "goals",
      "app-server",
    ]);
  });

  it("omits an empty prompt when reopening Codex", () => {
    const sessionRef: SessionRef = {
      providerSessionId: "abc-123",
      discoveredAt: new Date().toISOString(),
    };
    const spec = resume(createCodexAdapter(), windowsProject, config, "", sessionRef);
    const { cmdArgs } = parseWindowsSpec(spec);
    const resumeIndex = cmdArgs.indexOf("resume");

    expect(resumeIndex).toBeGreaterThan(-1);
    expect(cmdArgs[resumeIndex + 1]).toBe("--enable");
    expect(cmdArgs[resumeIndex + 2]).toBe("goals");
    // OSC 9 notifications (always-on) precede model / config flags.
    expect(cmdArgs[resumeIndex + 3]).toBe("-c");
    expect(cmdArgs[resumeIndex + 4]).toBe("tui.notifications=true");
    expect(cmdArgs[resumeIndex + 5]).toBe("-c");
    expect(cmdArgs[resumeIndex + 6]).toBe('tui.notification_method="osc9"');
    expect(cmdArgs[resumeIndex + 7]).toBe("-c");
    expect(cmdArgs[resumeIndex + 8]).toBe("suppress_unstable_features_warning=true");
    expect(cmdArgs[resumeIndex + 9]).toBe("-m");
    expect(cmdArgs).toContain("abc-123");
    expect(cmdArgs).not.toContain("");
  });

  it.skipIf(process.platform !== "win32")(
    "builds a Claude launch command with a pre-assigned session id",
    () => {
      const claudeConfig: ThreadConfig = {
        model: "sonnet",
        effort: "high",
        mode: "agent",
        approvalPolicy: "default",
      };
      const spec = launch(createClaudeAdapter(), windowsProject, claudeConfig, "hello");
      const script = decodePowerShellEncodedCommand(spec.args[3] ?? "");

      expect(script).toContain("--session-id");
      expect(script).not.toContain("--resume");
      expect(script).toContain("--model");
      expect(script).toContain("sonnet");
      expect(script).toContain("hello");
      expect(spec.sessionRef).toBeDefined();
      expect(spec.sessionRef!.providerSessionId).toBeTruthy();
    },
  );

  it.skipIf(process.platform !== "win32")(
    "builds a Claude launch command without a trailing empty prompt",
    () => {
      const spec = launch(createClaudeAdapter(), windowsProject, config, "");
      const script = decodePowerShellEncodedCommand(spec.args[3] ?? "");

      expect(script).toContain("--session-id");
      expect(script).not.toContain(", '')\n& $cmd");
    },
  );

  it.skipIf(process.platform !== "win32")("builds a Claude resume command", () => {
    const sessionRef: SessionRef = {
      providerSessionId: "abc-123",
      discoveredAt: new Date().toISOString(),
    };
    const spec = resume(createClaudeAdapter(), windowsProject, config, "next", sessionRef);
    expect(spec.command).toBeTruthy();
    expect(spec.args.length).toBeGreaterThan(0);

    const script = decodePowerShellEncodedCommand(spec.args[3] ?? "");
    expect(script).toContain("--resume");
    expect(script).toContain("abc-123");
    expect(script).not.toContain("--session-id");
  });

  it("passes reasoning effort through one-shot commit generation commands", () => {
    expect(createCodexAdapter().buildOneShotCommand?.("gpt-5.4-mini", "low")).toEqual({
      command: "codex",
      args: [
        "exec",
        "--skip-git-repo-check",
        "-m",
        "gpt-5.4-mini",
        "-c",
        'model_reasoning_effort="low"',
        "-",
      ],
    });

    expect(
      createClaudeAdapter().buildOneShotCommand?.("haiku", "low", "Summarize this diff"),
    ).toEqual({
      command: "claude",
      args: [
        "-p",
        "Summarize this diff",
        "--model",
        "haiku",
        "--fallback-model",
        "haiku",
        "--no-session-persistence",
        "--effort",
        "low",
      ],
      stdin: "",
    });

    expect(
      createCopilotAdapter().buildOneShotCommand?.("gpt-5", "low", "Summarize this diff"),
    ).toEqual({
      command: "copilot",
      args: [
        "-p",
        "Summarize this diff",
        "-s",
        "--allow-all-tools",
        "--model",
        "gpt-5",
        "--effort",
        "low",
      ],
      stdin: "",
    });
  });

  it("appends fast-mode settings to the Claude one-shot command when fast is set", () => {
    expect(
      createClaudeAdapter().buildOneShotCommand?.(
        "claude-opus-4-8",
        "high",
        "Summarize this diff",
        undefined,
        true,
      ),
    ).toEqual({
      command: "claude",
      args: [
        "-p",
        "Summarize this diff",
        "--model",
        "claude-opus-4-8",
        "--fallback-model",
        "haiku",
        "--no-session-persistence",
        "--effort",
        "high",
        "--settings",
        '{"fastMode":true}',
      ],
      stdin: "",
    });

    // Without the flag the command is unchanged (no stray --settings).
    expect(
      createClaudeAdapter()
        .buildOneShotCommand?.("claude-opus-4-8", "high", "Summarize this diff")
        ?.args.includes("--settings"),
    ).toBe(false);
  });

  it.skipIf(process.platform !== "win32")(
    "builds a Copilot launch command with a pre-assigned session id",
    () => {
      const spec = launch(
        createCopilotAdapter(),
        windowsProject,
        { model: "gpt-5", effort: "high", approvalPolicy: "never" },
        "hello",
      );
      const { cmd, cmdArgs } = parseWindowsSpec(spec);

      expect(cmd).toBe("copilot");
      expect(cmdArgs.some((arg) => arg.startsWith("--session-id="))).toBe(true);
      expect(cmdArgs).toContain("--model");
      expect(cmdArgs).toContain("gpt-5");
      expect(cmdArgs).toContain("--effort");
      expect(cmdArgs).toContain("high");
      expect(cmdArgs).toContain("--yolo");
      expect(cmdArgs).not.toContain("--autopilot");
      expect(cmdArgs).toContain("hello");
      expect(spec.sessionRef).toBeDefined();
    },
  );

  it.skipIf(process.platform !== "win32")(
    "omits --yolo for default approval policy on Copilot",
    () => {
      const spec = launch(
        createCopilotAdapter(),
        windowsProject,
        { model: "gpt-5", approvalPolicy: "default" },
        "hello",
      );
      const { cmdArgs } = parseWindowsSpec(spec);

      expect(cmdArgs).not.toContain("--yolo");
      expect(cmdArgs).not.toContain("--autopilot");
      expect(cmdArgs).not.toContain("--allow-all");
    },
  );

  it.skipIf(process.platform !== "win32")(
    "keeps Copilot model and effort flags when resuming an ACP-backed session",
    () => {
      const spec = launch(
        createCopilotAdapter(),
        windowsProject,
        { model: "gpt-5.4", effort: "high", approvalPolicy: "never" },
        "",
        undefined,
        {
          suppressResumeConfigOverrides: true,
          resumeThreadId: "019d19c4-8050-7270-b8fc-589eee8136c2",
        },
      );
      const { cmd, cmdArgs } = parseWindowsSpec(spec);

      expect(cmd).toBe("copilot");
      expect(cmdArgs).toContain("--session-id=019d19c4-8050-7270-b8fc-589eee8136c2");
      expect(cmdArgs).toContain("--model");
      expect(cmdArgs).toContain("gpt-5.4");
      expect(cmdArgs).toContain("--effort");
      expect(cmdArgs).toContain("high");
    },
  );

  it.skipIf(process.platform !== "win32")(
    "passes --plan and an unmodified initial prompt when launching in plan mode",
    () => {
      const spec = launch(
        createCopilotAdapter(),
        windowsProject,
        { model: "claude-haiku-4.5", effort: "high", mode: "plan", approvalPolicy: "never" },
        "hi",
      );
      const { cmd, cmdArgs } = parseWindowsSpec(spec);

      expect(cmd).toBe("copilot");
      expect(cmdArgs).toContain("--plan");
      expect(cmdArgs).toContain("-i");
      expect(cmdArgs).toContain("hi");
      expect(cmdArgs).not.toContain("/plan hi");
    },
  );

  it.skipIf(process.platform !== "win32")(
    "prefers pwsh, then powershell, then cmd on Windows",
    () => {
      expect(
        buildWindowsCommand("C:\\Users\\demo\\project", "codex", ["hello"], (name) =>
          name === "pwsh.exe" ? "C:\\Program Files\\PowerShell\\7\\pwsh.exe" : undefined,
        ).command,
      ).toBe("C:\\Program Files\\PowerShell\\7\\pwsh.exe");

      expect(
        buildWindowsCommand("C:\\Users\\demo\\project", "codex", ["hello"], (name) =>
          name === "powershell.exe"
            ? "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
            : undefined,
        ).command,
      ).toBe("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");

      expect(
        buildWindowsCommand("C:\\Users\\demo\\project", "codex", ["hello"], () => undefined)
          .command,
      ).toBe("C:\\Windows\\System32\\cmd.exe");
    },
  );

  it.skipIf(process.platform !== "win32")(
    "uses encoded PowerShell commands for prompts with special characters",
    () => {
      const spec = buildWindowsCommand(
        "C:\\Users\\demo\\project",
        "codex",
        ["say 'hello' & more"],
        (name) => (name === "pwsh.exe" ? "C:\\Program Files\\PowerShell\\7\\pwsh.exe" : undefined),
      );

      expect(spec.args.slice(0, 3)).toEqual(["-NoLogo", "-NoProfile", "-EncodedCommand"]);
      expect(spec.args[3]).toBeTruthy();
    },
  );

  it.skipIf(process.platform !== "win32")("omits an empty prompt when reopening Claude", () => {
    const sessionRef: SessionRef = {
      providerSessionId: "abc-123",
      discoveredAt: new Date().toISOString(),
    };
    const spec = resume(createClaudeAdapter(), windowsProject, config, "", sessionRef);
    const script = decodePowerShellEncodedCommand(spec.args[3] ?? "");

    expect(script).toContain("--resume");
    expect(script).toContain("abc-123");
    expect(script).not.toContain(", ''");
  });

  it.skipIf(process.platform !== "win32")("builds a Windows Cursor launch command", () => {
    const spec = launch(createCursorAdapter(), windowsProject, { model: "auto" }, "hello");
    expect(spec.cwd).toBe("C:\\Users\\demo\\project");
    const { cmd, cmdArgs } = parseWindowsSpec(spec);
    expect(cmd).toBe("cursor-agent");
    expect(cmdArgs).toContain("hello");
    expect(cmdArgs).toContain("auto");
  });

  it("builds a Cursor resume command with --resume", () => {
    const sessionRef: SessionRef = {
      providerSessionId: "chat_019d6099-45a3-7962-a595-2d7f59276118",
      discoveredAt: new Date().toISOString(),
    };
    const spec = resume(createCursorAdapter(), windowsProject, { model: "auto" }, "", sessionRef);
    const { cmdArgs } = parseWindowsSpec(spec);

    expect(cmdArgs).toContain("--resume=chat_019d6099-45a3-7962-a595-2d7f59276118");
    expect(cmdArgs).toContain("auto");
    expect(cmdArgs).not.toContain("");
  });

  it.skipIf(process.platform !== "win32")("builds a Cursor launch command with plan mode", () => {
    const spec = launch(
      createCursorAdapter(),
      windowsProject,
      { model: "gpt-5.4-medium", mode: "plan" },
      "analyze code",
    );
    const { cmd, cmdArgs } = parseWindowsSpec(spec);
    expect(cmd).toBe("cursor-agent");
    expect(cmdArgs).toContain("--model");
    expect(cmdArgs).toContain("gpt-5.4-medium");
    expect(cmdArgs).toContain("--mode");
    expect(cmdArgs).toContain("plan");
  });

  it("builds a Cursor launch command with --yolo for bypass approvals", () => {
    const spec = launch(
      createCursorAdapter(),
      windowsProject,
      { model: "auto", approvalPolicy: "never" },
      "hello",
    );
    const { cmdArgs } = parseWindowsSpec(spec);
    expect(cmdArgs).toContain("--yolo");
    expect(cmdArgs).not.toContain("--force");
    expect(cmdArgs).toContain("auto");
  });

  it("omits --yolo for default approval policy on Cursor", () => {
    const spec = launch(
      createCursorAdapter(),
      windowsProject,
      { model: "auto", approvalPolicy: "default" },
      "hello",
    );
    const { cmdArgs } = parseWindowsSpec(spec);
    expect(cmdArgs).not.toContain("--yolo");
  });

  it("uses Cursor print mode with --trust for one-shot commands", () => {
    expect(createCursorAdapter().buildOneShotCommand?.("auto")).toEqual({
      command: "cursor-agent",
      args: ["--print", "--force", "--trust", "--output-format", "json"],
    });
    expect(createCursorAdapter().buildOneShotCommand?.("composer-2.5")).toEqual({
      command: "cursor-agent",
      args: ["--print", "--force", "--trust", "--output-format", "json", "--model", "composer-2.5"],
    });
  });
});
