import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";

const bridge = vi.hoisted(() => ({
  platform: "darwin" as NodeJS.Platform,
  startShell: vi.fn<(payload: unknown) => Promise<void>>(),
  closeThread: vi.fn<() => Promise<void>>(),
  onSupervisorEvent: vi.fn<(handler: (event: SupervisorEvent) => void) => () => void>(),
  openExternal: vi.fn<(url: string) => Promise<void>>(),
  openExternalNative: vi.fn<(url: string) => Promise<void>>(),
  setRendererEventInterests: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

const supervisorHandlers = vi.hoisted(() => [] as Array<(event: SupervisorEvent) => void>);
const loginTerminalStore = vi.hoisted(() => ({
  open: vi.fn<(input: { shellId: string }) => void>(),
  close: vi.fn<() => void>(),
  markFailed: vi.fn<(shellId: string, exitCode: number) => void>(),
  active: undefined as { onForceClose?: () => void; shellId: string } | undefined,
}));
const writeScriptToShellMock = vi.hoisted(() => vi.fn<(shellId: string, script: string) => void>());
const startShellWithCurrentSettingsMock = vi.hoisted(() =>
  vi.fn<(payload: unknown) => Promise<void>>(),
);

vi.mock("@heroui/react", () => ({
  toast: {
    danger: vi.fn<(message: string) => void>(),
    success: vi.fn<(message: string) => void>(),
    warning: vi.fn<(message: string) => void>(),
  },
}));

vi.mock("@/renderer/bridge", () => ({
  isWindows: () => bridge.platform === "win32",
  readBridge: () => bridge,
}));

vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: {
    getState: () => ({ projects: [], threads: [], view: { kind: "draft", projectId: "project" } }),
  },
}));

vi.mock("@/renderer/state/devTerminalStore", () => ({
  useDevTerminalStore: {
    getState: () => ({ activeProjectId: undefined }),
  },
}));

vi.mock("@/renderer/state/loginTerminalStore", () => ({
  useLoginTerminalStore: {
    getState: () => loginTerminalStore,
  },
}));

vi.mock("@/renderer/state/panelStore", () => ({
  usePanelStore: {
    getState: () => ({ setRightPanelTab: vi.fn<(tab: string) => void>() }),
  },
}));

vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: {
    getState: () => ({ terminalPosition: "bottom" }),
  },
}));

vi.mock("@/renderer/utils/shellUtils", () => ({
  disposeRoutedShellSession: vi.fn<(shellId: string) => void>(),
  startShellWithCurrentSettings: startShellWithCurrentSettingsMock,
  writeScriptToShell: writeScriptToShellMock,
}));

import { toast } from "@heroui/react";
import { antigravityCliInstallCommand } from "@/renderer/views/SettingsOverlay/parts/antigravityRuntimeInstall";
import { runAgentInstallCommand, runAgentLoginCommand } from "./agentLoginActions";

const wslProject: Project = {
  id: "project",
  name: "Project",
  location: {
    kind: "wsl",
    distro: "Ubuntu",
    linuxPath: "/home/demo/project",
    uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\project",
  },
  createdAt: new Date(0).toISOString(),
};

const windowsProject: Project = {
  id: "windows-project",
  name: "Windows Project",
  location: {
    kind: "windows",
    path: "C:\\repo",
  },
  createdAt: new Date(0).toISOString(),
};

const posixProject: Project = {
  id: "posix-project",
  name: "Posix Project",
  location: {
    kind: "posix",
    path: "/Users/demo/project",
  },
  createdAt: new Date(0).toISOString(),
};

function emit(event: SupervisorEvent) {
  for (const handler of supervisorHandlers) handler(event);
}

function unwrapBashScript(script: string): string {
  const prefix = "command bash -lc ";
  expect(script.startsWith(prefix)).toBe(true);
  const quoted = script.slice(prefix.length);
  expect(quoted.startsWith("'")).toBe(true);
  expect(quoted.endsWith("'")).toBe(true);
  return quoted.slice(1, -1).replaceAll("'\\''", "'");
}

describe("runAgentLoginCommand", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    bridge.platform = "darwin";
    supervisorHandlers.length = 0;
    bridge.startShell.mockReset().mockResolvedValue(undefined);
    bridge.closeThread.mockReset().mockResolvedValue(undefined);
    bridge.openExternal.mockReset().mockResolvedValue(undefined);
    bridge.openExternalNative.mockReset().mockResolvedValue(undefined);
    bridge.onSupervisorEvent.mockReset().mockImplementation((handler) => {
      supervisorHandlers.push(handler);
      return () => {
        const index = supervisorHandlers.indexOf(handler);
        if (index >= 0) supervisorHandlers.splice(index, 1);
      };
    });
    loginTerminalStore.open.mockReset();
    loginTerminalStore.close.mockReset();
    loginTerminalStore.markFailed.mockReset();
    loginTerminalStore.active = undefined;
    writeScriptToShellMock.mockReset();
    startShellWithCurrentSettingsMock
      .mockReset()
      .mockImplementation((payload) => bridge.startShell(payload));
  });

  it("opens hard-wrapped WSL auth URLs in the native browser", () => {
    runAgentLoginCommand({
      label: "Grok",
      command: "grok login",
      project: wslProject,
    });

    const shellId = loginTerminalStore.open.mock.calls[0]?.[0].shellId;
    expect(shellId).toBeTruthy();
    const script = writeScriptToShellMock.mock.calls[0]?.[1] ?? "";
    const innerScript = unwrapBashScript(script);
    expect(script).not.toContain("cmd.exe /c start");
    expect(innerScript).toContain(
      "clear; BROWSER='/bin/true' DISPLAY='' WAYLAND_DISPLAY='' grok login",
    );

    emit({
      type: "thread-output",
      threadId: shellId!,
      data: "Open https://auth.x.ai/oauth2/authorize?response_type=code\n",
      outputLength: 0,
      terminalInstanceId: "gen-test",
    });
    vi.advanceTimersByTime(250);
    expect(bridge.openExternalNative).not.toHaveBeenCalled();

    emit({
      type: "thread-output",
      threadId: shellId!,
      data: "&client_id=grok-build\n&redirect_uri=http%3A%2F%2F127.0.0.1%3A3000%2Fcallback\n",
      outputLength: 0,
      terminalInstanceId: "gen-test",
    });
    vi.advanceTimersByTime(250);

    expect(bridge.openExternalNative).toHaveBeenCalledWith(
      "https://auth.x.ai/oauth2/authorize?response_type=code&client_id=grok-build&redirect_uri=http%3A%2F%2F127.0.0.1%3A3000%2Fcallback",
    );
  });

  it("opens complete long WSL auth URLs after suppressing the agent browser", () => {
    runAgentLoginCommand({
      label: "Grok",
      command: "grok login",
      project: wslProject,
    });

    const shellId = loginTerminalStore.open.mock.calls[0]?.[0].shellId;
    const url =
      "https://auth.x.ai/oauth2/authorize?response_type=code&client_id=b1a00492-073a-47ea-816f-4c329264a828&redirect_uri=http%3A%2F%2F127.0.0.1%3A45417%2Fcallback&scope=openid%20profile%20email%20offline_access%20grok-cli%3Aaccess%20api%3Aaccess&code_challenge=MDPixKrsA5K4QIgvDtSEPlQniofqpd2Rr8wT5HEzo5I&code_challenge_method=S256&state=019e5ddb-3198-7542-8504-714899198f01&nonce=019e5ddb-3198-7542-8504-7154a7bf6c98";

    expect(unwrapBashScript(writeScriptToShellMock.mock.calls[0]?.[1] ?? "")).toContain(
      "clear; BROWSER='/bin/true' DISPLAY='' WAYLAND_DISPLAY='' grok login",
    );

    emit({
      type: "thread-output",
      threadId: shellId!,
      data: `Open this URL to sign in:\n  ${url}\n`,
      outputLength: 0,
      terminalInstanceId: "gen-test",
    });
    vi.advanceTimersByTime(250);

    expect(bridge.openExternalNative).toHaveBeenCalledWith(url);
  });

  it("sets profile env via PowerShell assignments on native Windows, not a POSIX prefix", () => {
    runAgentLoginCommand({
      label: "Claude Code",
      command: "claude auth login",
      env: { CLAUDE_CONFIG_DIR: "C:\\Users\\sdsle\\.poracode\\claude-profiles\\home" },
      project: windowsProject,
    });

    const script = writeScriptToShellMock.mock.calls[0]?.[1] ?? "";
    // PowerShell can't run `KEY=value command`; it must assign $env: first.
    expect(script).toContain(
      "Clear-Host; $env:CLAUDE_CONFIG_DIR = 'C:\\Users\\sdsle\\.poracode\\claude-profiles\\home'; claude auth login",
    );
    expect(script).not.toContain("CLAUDE_CONFIG_DIR=C:");
    expect(startShellWithCurrentSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectLocation: windowsProject.location,
        startInHome: true,
        windowsShellRuntime: "powershell",
      }),
    );
  });

  it("sets profile env via an inline POSIX prefix on WSL", () => {
    runAgentLoginCommand({
      label: "Claude Code",
      command: "claude auth login",
      env: { CLAUDE_CONFIG_DIR: "/home/demo/.claude-profiles/home" },
      project: wslProject,
    });

    const script = writeScriptToShellMock.mock.calls[0]?.[1] ?? "";
    expect(unwrapBashScript(script)).toContain(
      "clear; CLAUDE_CONFIG_DIR='/home/demo/.claude-profiles/home' BROWSER='/bin/true' DISPLAY='' WAYLAND_DISPLAY='' claude auth login",
    );
  });

  it("does not intercept login URLs on native Windows so the CLI's own browser opener wins", () => {
    runAgentLoginCommand({
      label: "Grok",
      command: "grok login",
      project: windowsProject,
    });

    const shellId = loginTerminalStore.open.mock.calls[0]?.[0].shellId;
    const url =
      "https://auth.x.ai/oauth2/authorize?response_type=code&client_id=b1a00492-073a-47ea-816f-4c329264a828&redirect_uri=http%3A%2F%2F127.0.0.1%3A37155%2Fcallback&scope=openid%20profile%20email%20offline_access%20grok-cli%3Aaccess%20api%3Aaccess&code_challenge=XZGsVbiV8w8TRiC3gHnWDKL8TsuK2tFNeVR9md4tA34&code_challenge_method=S256&state=019e5e1e-040a-78c1-bbd6-1585cd381488&nonce=019e5e1e-040a-78c1-bbd6-159774c2afa3";

    // BROWSER override is WSL-only; Clear-Host runs as-is on native Windows.
    expect(writeScriptToShellMock.mock.calls[0]?.[1] ?? "").toContain("Clear-Host; grok login");

    emit({
      type: "thread-output",
      threadId: shellId!,
      data: `\r\nSigning in with Grok...\r\n\r\nOpen this URL to sign in:\r\n  ${url}\r\n\r\nPaste the URL here if it doesn't connect:\r\n`,
      outputLength: 0,
      terminalInstanceId: "gen-test",
    });
    vi.advanceTimersByTime(250);

    expect(bridge.openExternalNative).not.toHaveBeenCalled();
  });

  it("does not append following prompt text to xAI device auth URLs", () => {
    runAgentLoginCommand({
      label: "Grok",
      command: "grok login --device-auth",
      project: wslProject,
    });

    const shellId = loginTerminalStore.open.mock.calls[0]?.[0].shellId;

    emit({
      type: "thread-output",
      threadId: shellId!,
      data: [
        "To sign in, open this URL in your browser:\n\n",
        "  https://accounts.x.ai/oauth2/device?user_code=E9YP-N7CQIf prompted, confirm this code:\n\n",
        "  E9YP-N7CQ\n",
      ].join(""),
      outputLength: 0,
      terminalInstanceId: "gen-test",
    });
    vi.advanceTimersByTime(250);

    expect(bridge.openExternalNative).toHaveBeenCalledWith(
      "https://accounts.x.ai/oauth2/device?user_code=E9YP-N7CQ",
    );
  });

  it("normalizes Codex device auth URLs when auto-opening from WSL output", () => {
    runAgentLoginCommand({
      label: "Codex",
      command: "codex login --device-auth",
      project: wslProject,
    });

    const shellId = loginTerminalStore.open.mock.calls[0]?.[0].shellId;

    emit({
      type: "thread-output",
      threadId: shellId!,
      data: "1. Open this link in your browser and sign in to your account\n   https://auth.openai.com/codex/device2. Enter this one-time code\n",
      outputLength: 0,
      terminalInstanceId: "gen-test",
    });
    vi.advanceTimersByTime(250);

    expect(bridge.openExternalNative).toHaveBeenCalledWith("https://auth.openai.com/codex/device");
  });

  it("does not auto-open Codex's local callback server URL", () => {
    runAgentLoginCommand({
      label: "Codex",
      command: "codex login",
      project: wslProject,
    });

    const shellId = loginTerminalStore.open.mock.calls[0]?.[0].shellId;
    const authUrl =
      "https://auth.openai.com/oauth/authorize?response_type=code&client_id=app&redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback";

    emit({
      type: "thread-output",
      threadId: shellId!,
      data: `Starting local login server on http://localhost:1455.\nIf your browser did not open, navigate to this URL to authenticate:\n\n${authUrl}\n`,
      outputLength: 0,
      terminalInstanceId: "gen-test",
    });
    vi.advanceTimersByTime(250);

    expect(bridge.openExternalNative).toHaveBeenCalledTimes(1);
    expect(bridge.openExternalNative).toHaveBeenCalledWith(authUrl);
  });

  it("opens Cursor WSL browser login URLs", () => {
    runAgentLoginCommand({
      label: "Cursor",
      command: "cursor-agent login",
      env: { NO_OPEN_BROWSER: "1" },
      project: wslProject,
    });

    const shellId = loginTerminalStore.open.mock.calls[0]?.[0].shellId;
    const url =
      "https://cursor.com/loginDeepControl?challenge=C_7tIakH9LsaJ5eBDQVlz6IYoQvg93TP5qmAkdBFFY&uuid=801340c1-2708-4d80-afaa-197f054a7e58&mode=login&redirectTarget=cli";

    emit({
      type: "thread-output",
      threadId: shellId!,
      data: `Open a browser and navigate to this link: ${url}\n`,
      outputLength: 0,
      terminalInstanceId: "gen-test",
    });
    vi.advanceTimersByTime(250);

    expect(bridge.openExternalNative).toHaveBeenCalledWith(url);
  });

  it("keeps Kimi WSL login to one native browser launch", () => {
    runAgentLoginCommand({
      label: "Kimi Code",
      command: "'/home/demo/.kimi-code/bin/kimi' login",
      project: wslProject,
    });

    const shellId = loginTerminalStore.open.mock.calls[0]?.[0].shellId;
    expect(unwrapBashScript(writeScriptToShellMock.mock.calls[0]?.[1] ?? "")).toContain(
      "clear; BROWSER='/bin/true' DISPLAY='' WAYLAND_DISPLAY='' '/home/demo/.kimi-code/bin/kimi' login",
    );

    const url = "https://www.kimi.com/code/authorize_device?user_code=ABCD-EFGH";
    emit({
      type: "thread-output",
      threadId: shellId!,
      data: `Opening browser for Kimi device login: ${url}\n`,
      outputLength: 0,
      terminalInstanceId: "gen-test",
    });
    vi.advanceTimersByTime(250);
    emit({
      type: "thread-output",
      threadId: shellId!,
      data: `If the browser did not open, paste this URL: ${url}\n`,
      outputLength: 0,
      terminalInstanceId: "gen-test",
    });
    vi.advanceTimersByTime(250);

    expect(bridge.openExternalNative).toHaveBeenCalledTimes(1);
    expect(bridge.openExternalNative).toHaveBeenCalledWith(url);
  });

  it("does not auto-open Gemini WSL login links", () => {
    runAgentLoginCommand({
      label: "Gemini",
      command: "gemini /auth",
      project: wslProject,
    });

    const shellId = loginTerminalStore.open.mock.calls[0]?.[0].shellId;
    expect(unwrapBashScript(writeScriptToShellMock.mock.calls[0]?.[1] ?? "")).toContain(
      "clear; BROWSER='/bin/true' DISPLAY='' WAYLAND_DISPLAY='' gemini /auth",
    );

    emit({
      type: "thread-output",
      threadId: shellId!,
      data: "https://geminicli.com/docs/resources/tos-privacy/%E2%94%82\n",
      outputLength: 0,
      terminalInstanceId: "gen-test",
    });
    vi.advanceTimersByTime(250);

    expect(bridge.openExternalNative).not.toHaveBeenCalled();
  });

  it("marks the login overlay as failed when the command exits unsuccessfully", () => {
    runAgentLoginCommand({
      label: "Grok",
      command: "grok login",
      project: wslProject,
    });

    const shellId = loginTerminalStore.open.mock.calls[0]?.[0].shellId;
    const script = writeScriptToShellMock.mock.calls[0]?.[1] ?? "";
    const token = /poracode-login-complete=([^:]+):/u.exec(script)?.[1];
    expect(token).toBeTruthy();

    emit({
      type: "thread-output",
      threadId: shellId!,
      data: `\u001B]777;poracode-login-complete=${token}:1\u0007`,
      outputLength: 0,
      terminalInstanceId: "gen-test",
    });
    vi.advanceTimersByTime(1200);

    expect(loginTerminalStore.close).not.toHaveBeenCalled();
    expect(loginTerminalStore.markFailed).toHaveBeenCalledWith(shellId, 1);
    expect(toast.danger).not.toHaveBeenCalled();
  });

  it("auto-closes the login overlay after a successful command exit", () => {
    runAgentLoginCommand({
      label: "Grok",
      command: "grok login",
      project: wslProject,
    });

    const shellId = loginTerminalStore.open.mock.calls[0]?.[0].shellId;
    const script = writeScriptToShellMock.mock.calls[0]?.[1] ?? "";
    const token = /poracode-login-complete=([^:]+):/u.exec(script)?.[1];
    expect(token).toBeTruthy();

    emit({
      type: "thread-output",
      threadId: shellId!,
      data: `\u001B]777;poracode-login-complete=${token}:0\u0007`,
      outputLength: 0,
      terminalInstanceId: "gen-test",
    });

    expect(loginTerminalStore.close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1200);
    expect(loginTerminalStore.close).toHaveBeenCalledTimes(1);
  });

  it("wraps non-Windows install commands in bash so fish does not parse POSIX syntax", () => {
    runAgentInstallCommand({
      label: "OpenCode",
      command:
        "if command -v curl >/dev/null 2>&1; then curl -fsSL https://opencode.ai/install | bash; elif command -v brew >/dev/null 2>&1; then brew install anomalyco/tap/opencode; elif command -v npm >/dev/null 2>&1; then npm install -g opencode-ai; fi",
      project: posixProject,
    });

    const script = writeScriptToShellMock.mock.calls[0]?.[1] ?? "";
    expect(script).toMatch(/^command bash -lc '/u);

    const innerScript = unwrapBashScript(script);
    expect(innerScript).toContain("https://opencode.ai/install | bash");
    expect(innerScript).toContain("printf '\\033]777;poracode-login-complete=lc_");
    expect(innerScript).toContain('"$__lc_exit"');
  });

  it("keeps the completion marker reachable after the Antigravity POSIX installer", () => {
    const command = antigravityCliInstallCommand(posixProject);
    expect(command).toContain('test "$antigravity_install_status" -eq 0');
    expect(command).toContain("else printf");
    expect(command).toContain("; false; fi");
    expect(command).not.toMatch(/(?:^|[;}])\s*exit\b/u);

    runAgentInstallCommand({ label: "Antigravity", command, project: posixProject });

    const innerScript = unwrapBashScript(writeScriptToShellMock.mock.calls[0]?.[1] ?? "");
    expect(innerScript.indexOf("poracode-login-complete=")).toBeGreaterThan(
      innerScript.indexOf(command),
    );
  });

  it("keeps the completion marker reachable after Antigravity Windows failures", () => {
    bridge.platform = "win32";
    const command = antigravityCliInstallCommand(windowsProject);
    expect(command).toContain("cmd /c exit 1");
    expect(command).not.toMatch(/(?:^|[;}])\s*exit\b/u);

    runAgentInstallCommand({ label: "Antigravity", command, project: windowsProject });

    const script = writeScriptToShellMock.mock.calls[0]?.[1] ?? "";
    expect(script.indexOf("poracode-login-complete=")).toBeGreaterThan(script.indexOf(command));
    expect(script).toContain("$lcExit");
  });

  it("opens update commands with update-specific terminal state", () => {
    runAgentInstallCommand({
      label: "Update Cursor SDK",
      command: "npm install -g '@cursor/sdk@^1.0.24'",
      project: posixProject,
      purpose: "update",
    });

    expect(loginTerminalStore.open).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Update Cursor SDK",
        purpose: "update",
        shellId: expect.stringMatching(/^update:/u),
      }),
    );
    expect(startShellWithCurrentSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectLocation: posixProject.location,
        startInHome: true,
      }),
    );
    expect(startShellWithCurrentSettingsMock.mock.calls[0]?.[0]).not.toHaveProperty(
      "windowsShellRuntime",
    );
  });
});
