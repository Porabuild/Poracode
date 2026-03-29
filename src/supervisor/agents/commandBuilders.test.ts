import { describe, expect, it } from "vitest";
import type { ProjectLocation, SessionRef, ThreadConfig } from "../../shared/contracts";
import { buildWindowsCommand, getWslCommand } from "./base";
import { createClaudeAdapter } from "./claude";
import { CODEX_REMOTE_TUI_FEATURE, createCodexAdapter } from "./codex";

function decodePowerShellEncodedCommand(encoded: string): string {
  return Buffer.from(encoded, "base64").toString("utf16le");
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
    expect(spec.command).toBe("C:\\Windows\\System32\\cmd.exe");
    expect(spec.cwd).toBe("C:\\Users\\demo\\project");
    expect(spec.args.slice(0, 4)).toEqual(["/d", "/s", "/c", "codex"]);
    expect(spec.args).toContain("hello");
  });

  it("builds a WSL Codex launch command", () => {
    const spec = createCodexAdapter().buildLaunchCommand(wslProject, config, "hello");
    expect(spec.command.toLowerCase()).toBe(getWslCommand().toLowerCase());
    expect(spec.args.slice(0, 5)).toEqual(["-d", "Ubuntu", "--cd", "/home/demo/project", "--"]);
    expect(spec.args).toContain("--no-alt-screen");
    expect(spec.args).toContain("-m");
    expect(spec.args).toContain("gpt-5.4");
    expect(spec.args).toContain("-a");
    expect(spec.args).toContain("on-request");
    expect(spec.args).toContain("workspace-write");
    expect(spec.args).toContain("hello");
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

    expect(spec.args).toContain("--enable");
    expect(spec.args).toContain(CODEX_REMOTE_TUI_FEATURE);
    expect(spec.args).toContain("--remote");
    expect(spec.args).toContain("ws://127.0.0.1:43123");
  });

  it("resumes the server thread when structured session provides a threadId", () => {
    const spec = createCodexAdapter().buildLaunchCommand(windowsProject, config, "", undefined, {
      enabledFeatures: [CODEX_REMOTE_TUI_FEATURE],
      remoteUrl: "ws://127.0.0.1:43123",
      suppressResumeConfigOverrides: true,
      resumeThreadId: "019d19c4-8050-7270-b8fc-589eee8136c2",
    });

    const codexArgs = spec.args.slice(spec.args.indexOf("codex") + 1);
    expect(codexArgs[0]).toBe("resume");
    expect(codexArgs).toContain("--enable");
    expect(codexArgs).toContain(CODEX_REMOTE_TUI_FEATURE);
    expect(codexArgs).toContain("--remote");
    expect(codexArgs).toContain("ws://127.0.0.1:43123");
    expect(codexArgs).not.toContain("-m");
    expect(codexArgs[codexArgs.length - 1]).toBe("019d19c4-8050-7270-b8fc-589eee8136c2");
  });

  it("omits an empty prompt when reopening Codex", () => {
    const sessionRef: SessionRef = {
      providerSessionId: "abc-123",
      discoveredAt: new Date().toISOString(),
    };
    const spec = createCodexAdapter().buildResumeCommand(windowsProject, config, "", sessionRef);
    const resumeIndex = spec.args.indexOf("resume");

    expect(resumeIndex).toBeGreaterThan(-1);
    expect(spec.args[resumeIndex + 1]).toBe("--no-alt-screen");
    expect(spec.args[resumeIndex + 2]).toBe("-m");
    expect(spec.args).toContain("abc-123");
    expect(spec.args).not.toContain("");
  });

  it("builds a Claude launch command with a pre-assigned session id", () => {
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

  it("builds a Claude launch command without a trailing empty prompt", () => {
    const spec = createClaudeAdapter().buildLaunchCommand(windowsProject, config, "");
    const script = decodePowerShellEncodedCommand(spec.args[3] ?? "");

    expect(script).toContain("--session-id");
    expect(script).not.toContain(", '')\n& $cmd");
  });

  it("builds a Claude resume command", () => {
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

  it("prefers pwsh, then powershell, then cmd on Windows", () => {
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

  it("uses encoded PowerShell commands for prompts with special characters", () => {
    const spec = buildWindowsCommand(
      "C:\\Users\\demo\\project",
      "codex",
      ["say 'hello' & more"],
      (name) => (name === "pwsh.exe" ? "C:\\Program Files\\PowerShell\\7\\pwsh.exe" : undefined),
    );

    expect(spec.args.slice(0, 3)).toEqual(["-NoLogo", "-NoProfile", "-EncodedCommand"]);
    expect(spec.args[3]).toBeTruthy();
  });

  it("omits an empty prompt when reopening Claude", () => {
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
