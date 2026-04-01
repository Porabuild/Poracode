import { describe, expect, it } from "vitest";
import type { ProjectLocation, SessionRef, ThreadConfig } from "../../shared/contracts";
import { buildWindowsCommand, getWslCommand } from "./base";
import { createClaudeAdapter } from "./claude";
import { buildCodexAppServerCommand, CODEX_REMOTE_TUI_FEATURE, createCodexAdapter } from "./codex";

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

describe("agent command builders", () => {
  it("builds a Windows Codex launch command", () => {
    const spec = createCodexAdapter().buildLaunchCommand(windowsProject, config, "hello");
    expect(spec.cwd).toBe("C:\\Users\\demo\\project");
    const { cmd, cmdArgs } = parseWindowsSpec(spec);
    expect(cmd).toBe("codex");
    expect(cmdArgs).toContain("hello");
  });

  it.skipIf(process.platform !== "win32")("builds a WSL Codex launch command via login shell", () => {
    const spec = createCodexAdapter().buildLaunchCommand(wslProject, config, "hello");
    expect(spec.command.toLowerCase()).toBe(getWslCommand().toLowerCase());
    expect(spec.args.slice(0, 5)).toEqual(["-d", "Ubuntu", "--cd", "/home/demo/project", "--"]);
    // After "--", the next args are: shellPath, "-l", "-i", "-c", script
    expect(spec.args[6]).toBe("-l");
    expect(spec.args[7]).toBe("-i");
    expect(spec.args[8]).toBe("-c");
    const script = spec.args[9]!;
    expect(script).toContain("--no-alt-screen");
    expect(script).toContain("-m");
    expect(script).toContain("gpt-5.4");
    expect(script).toContain("-a");
    expect(script).toContain("on-request");
    expect(script).toContain("workspace-write");
    expect(script).toContain("hello");
  });

  it("builds a remote Codex launch command with the TUI feature enabled", () => {
    const spec = createCodexAdapter().buildLaunchCommand(
      windowsProject,
      config,
      "hello",
      undefined,
      {
        enabledFeatures: [CODEX_REMOTE_TUI_FEATURE],
        remoteUrl: "ws://127.0.0.1:43123",
      },
    );

    const { cmdArgs } = parseWindowsSpec(spec);
    expect(cmdArgs).toContain("--enable");
    expect(cmdArgs).toContain(CODEX_REMOTE_TUI_FEATURE);
    expect(cmdArgs).toContain("--remote");
    expect(cmdArgs).toContain("ws://127.0.0.1:43123");
  });

  it("builds a Codex app-server command accepted by codex 0.117+", () => {
    const spec = buildCodexAppServerCommand(windowsProject, "ws://127.0.0.1:43123");

    const { cmd, cmdArgs } = parseWindowsSpec(spec);
    expect(cmd).toBe("codex");
    expect(cmdArgs).toContain("app-server");
    expect(cmdArgs).toContain("--listen");
    expect(cmdArgs).toContain("ws://127.0.0.1:43123");
    expect(cmdArgs).toContain("--enable");
    expect(cmdArgs).toContain(CODEX_REMOTE_TUI_FEATURE);
    expect(cmdArgs).not.toContain("--session-source");
  });

  it("resumes the server thread when structured session provides a threadId", () => {
    const spec = createCodexAdapter().buildLaunchCommand(windowsProject, config, "", undefined, {
      enabledFeatures: [CODEX_REMOTE_TUI_FEATURE],
      remoteUrl: "ws://127.0.0.1:43123",
      suppressResumeConfigOverrides: true,
      resumeThreadId: "019d19c4-8050-7270-b8fc-589eee8136c2",
    });

    const { cmdArgs } = parseWindowsSpec(spec);
    expect(cmdArgs[0]).toBe("resume");
    expect(cmdArgs).toContain("--enable");
    expect(cmdArgs).toContain(CODEX_REMOTE_TUI_FEATURE);
    expect(cmdArgs).toContain("--remote");
    expect(cmdArgs).toContain("ws://127.0.0.1:43123");
    expect(cmdArgs).not.toContain("-m");
    expect(cmdArgs[cmdArgs.length - 1]).toBe("019d19c4-8050-7270-b8fc-589eee8136c2");
  });

  it("omits an empty prompt when reopening Codex", () => {
    const sessionRef: SessionRef = {
      providerSessionId: "abc-123",
      discoveredAt: new Date().toISOString(),
    };
    const spec = createCodexAdapter().buildResumeCommand(windowsProject, config, "", sessionRef);
    const { cmdArgs } = parseWindowsSpec(spec);
    const resumeIndex = cmdArgs.indexOf("resume");

    expect(resumeIndex).toBeGreaterThan(-1);
    expect(cmdArgs[resumeIndex + 1]).toBe("--no-alt-screen");
    expect(cmdArgs[resumeIndex + 2]).toBe("-m");
    expect(cmdArgs).toContain("abc-123");
    expect(cmdArgs).not.toContain("");
  });

  it.skipIf(process.platform !== "win32")("builds a Claude launch command with a pre-assigned session id", () => {
    const claudeConfig: ThreadConfig = {
      model: "sonnet",
      effort: "high",
      mode: "agent",
      approvalPolicy: "default",
    };
    const spec = createClaudeAdapter().buildLaunchCommand(windowsProject, claudeConfig, "hello");
    const script = decodePowerShellEncodedCommand(spec.args[3] ?? "");

    expect(script).toContain("--session-id");
    expect(script).not.toContain("--resume");
    expect(script).toContain("--model");
    expect(script).toContain("sonnet");
    expect(script).toContain("hello");
    expect(spec.sessionRef).toBeDefined();
    expect(spec.sessionRef!.providerSessionId).toBeTruthy();
  });

  it.skipIf(process.platform !== "win32")("builds a Claude launch command without a trailing empty prompt", () => {
    const spec = createClaudeAdapter().buildLaunchCommand(windowsProject, config, "");
    const script = decodePowerShellEncodedCommand(spec.args[3] ?? "");

    expect(script).toContain("--session-id");
    expect(script).not.toContain(", '')\n& $cmd");
  });

  it.skipIf(process.platform !== "win32")("builds a Claude resume command", () => {
    const sessionRef: SessionRef = {
      providerSessionId: "abc-123",
      discoveredAt: new Date().toISOString(),
    };
    const spec = createClaudeAdapter().buildResumeCommand(
      windowsProject,
      config,
      "next",
      sessionRef,
    );
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
      args: ["exec", "-m", "gpt-5.4-mini", "-c", 'model_reasoning_effort="low"', "-"],
    });

    expect(createClaudeAdapter().buildOneShotCommand?.("haiku", "low")).toEqual({
      command: "claude",
      args: ["-p", "--model", "haiku", "--effort", "low"],
    });
  });

  it.skipIf(process.platform !== "win32")("prefers pwsh, then powershell, then cmd on Windows", () => {
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
      buildWindowsCommand("C:\\Users\\demo\\project", "codex", ["hello"], () => undefined).command,
    ).toBe("C:\\Windows\\System32\\cmd.exe");
  });

  it.skipIf(process.platform !== "win32")("uses encoded PowerShell commands for prompts with special characters", () => {
    const spec = buildWindowsCommand(
      "C:\\Users\\demo\\project",
      "codex",
      ["say 'hello' & more"],
      (name) => (name === "pwsh.exe" ? "C:\\Program Files\\PowerShell\\7\\pwsh.exe" : undefined),
    );

    expect(spec.args.slice(0, 3)).toEqual(["-NoLogo", "-NoProfile", "-EncodedCommand"]);
    expect(spec.args[3]).toBeTruthy();
  });

  it.skipIf(process.platform !== "win32")("omits an empty prompt when reopening Claude", () => {
    const sessionRef: SessionRef = {
      providerSessionId: "abc-123",
      discoveredAt: new Date().toISOString(),
    };
    const spec = createClaudeAdapter().buildResumeCommand(windowsProject, config, "", sessionRef);
    const script = decodePowerShellEncodedCommand(spec.args[3] ?? "");

    expect(script).toContain("--resume");
    expect(script).toContain("abc-123");
    expect(script).not.toContain(", ''");
  });
});
