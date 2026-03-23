import { describe, expect, it } from "vitest";
import type { ProjectLocation, SessionRef, ThreadConfig } from "../../shared/contracts";
import { buildWindowsCommand } from "./base";
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
    expect(spec.command).toBe("wsl.exe");
    expect(spec.args.slice(0, 5)).toEqual(["-d", "Ubuntu", "--cd", "/home/demo/project", "--"]);
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
