import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const bridgeMock = vi.hoisted(() => ({
  isRemoteSession: vi.fn<() => boolean>(() => false),
  isWindows: vi.fn<() => boolean>(() => true),
  getAvailableWindowsShells: vi.fn<
    () => Promise<Array<{ kind: "pwsh" | "powershell" | "cmd"; path: string; version?: string }>>
  >(async () => [
    { kind: "pwsh", path: "C:\\Program Files\\WindowsApps\\PowerShell\\pwsh.exe" },
    {
      kind: "powershell",
      path: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    },
    { kind: "cmd", path: "C:\\Windows\\System32\\cmd.exe" },
  ]),
}));

vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: bridgeMock.isRemoteSession,
  isWindows: bridgeMock.isWindows,
  readBridge: () => ({ getAvailableWindowsShells: bridgeMock.getAvailableWindowsShells }),
}));

import { WINDOWS_SHELL_AUTO } from "@/shared/settings";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { TerminalSettings } from "./TerminalSettings";

describe("TerminalSettings", () => {
  beforeEach(() => {
    bridgeMock.isRemoteSession.mockReturnValue(false);
    bridgeMock.isWindows.mockReturnValue(true);
    bridgeMock.getAvailableWindowsShells.mockReset().mockResolvedValue([
      { kind: "pwsh", path: "C:\\Program Files\\WindowsApps\\PowerShell\\pwsh.exe" },
      {
        kind: "powershell",
        path: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      },
      { kind: "cmd", path: "C:\\Windows\\System32\\cmd.exe" },
    ]);
    useSharedSettings.setState({
      windowsShellPath: WINDOWS_SHELL_AUTO,
      windowsInternalShellPath: WINDOWS_SHELL_AUTO,
      windowsShellArguments: "",
    });
  });

  it("shows desktop panel controls in local sessions", () => {
    render(<TerminalSettings />);

    expect(screen.getByText("Terminal position")).toBeInTheDocument();
    expect(screen.getByText("Auto-show terminal panel")).toBeInTheDocument();
    expect(screen.getByText("Browser pick target (CLI threads)")).toBeInTheDocument();
    expect(screen.getByText("Windows shells")).toBeInTheDocument();
    expect(screen.getByText("Windows shells").closest("[data-slot='card']")).toHaveClass(
      "card--transparent",
      "border-y",
    );
    expect(screen.getByText("Terminal panel shell")).toBeInTheDocument();
    expect(screen.getByText("Internal commands and agents")).toBeInTheDocument();
    expect(screen.getByText("Terminal shell arguments")).toBeInTheDocument();
  });

  it("lists detected Windows shells and persists the selected path and arguments", async () => {
    render(<TerminalSettings />);

    const select = screen.getByLabelText("Terminal panel shell");
    await waitFor(() => expect(select).toHaveTextContent("PowerShell 7"));
    fireEvent.click(select);
    const powershell = await screen.findByRole("option", { name: /^Windows PowerShell 5\.1/u });
    expect(powershell).toHaveTextContent(
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    );
    fireEvent.click(powershell);
    fireEvent.change(screen.getByLabelText("Terminal shell arguments"), {
      target: { value: '-NoProfile -File "C:\\profile scripts\\init.ps1"' },
    });

    expect(useSharedSettings.getState()).toMatchObject({
      windowsShellPath: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      windowsShellArguments: '-NoProfile -File "C:\\profile scripts\\init.ps1"',
    });
  });

  it("preselects PowerShell 7 without showing an Auto option", async () => {
    render(<TerminalSettings />);

    const select = screen.getByLabelText("Terminal panel shell");
    await waitFor(() => expect(select).toHaveTextContent("PowerShell 7"));

    fireEvent.click(select);
    expect(
      await screen.findByRole("option", { name: /PowerShell 7 \(recommended\)/u }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /^Auto/u })).toBeNull();
  });

  it("does not mark PowerShell 5.1 as recommended when PowerShell 7 is not available", async () => {
    bridgeMock.getAvailableWindowsShells.mockResolvedValueOnce([
      {
        kind: "powershell",
        path: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      },
      { kind: "cmd", path: "C:\\Windows\\System32\\cmd.exe" },
    ]);
    render(<TerminalSettings />);

    const select = screen.getByLabelText("Terminal panel shell");
    await waitFor(() => expect(select).toHaveTextContent("Windows PowerShell 5.1"));

    fireEvent.click(select);
    expect(
      await screen.findByRole("option", { name: /^Windows PowerShell 5.1/u }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /recommended/iu })).toBeNull();
  });

  it("keeps an undetected saved override visible so a detected shell can replace it", async () => {
    useSharedSettings.setState({ windowsShellPath: "C:\\removed\\pwsh.exe" });
    render(<TerminalSettings />);

    const select = screen.getByLabelText("Terminal panel shell");
    await waitFor(() => expect(select).toHaveTextContent("Saved shell"));
    fireEvent.click(select);
    const saved = await screen.findByRole("option", { name: /^Saved shell/u });
    expect(saved).toHaveTextContent("C:\\removed\\pwsh.exe");
    fireEvent.click(screen.getByRole("option", { name: /PowerShell 7 \(recommended\)/u }));

    expect(useSharedSettings.getState().windowsShellPath).toBe(
      "C:\\Program Files\\WindowsApps\\PowerShell\\pwsh.exe",
    );
  });

  it("does not treat a saved detected path as missing before inventory loads", async () => {
    let finishDetection!: (
      shells: Array<{ kind: "pwsh" | "powershell" | "cmd"; path: string }>,
    ) => void;
    bridgeMock.getAvailableWindowsShells.mockReturnValueOnce(
      new Promise((resolve) => {
        finishDetection = resolve;
      }),
    );
    useSharedSettings.setState({
      windowsShellPath: "C:\\Program Files\\WindowsApps\\PowerShell\\pwsh.exe",
    });
    render(<TerminalSettings />);

    const select = screen.getByLabelText("Terminal panel shell");
    expect(select).not.toHaveTextContent("Saved shell");

    finishDetection([
      { kind: "pwsh", path: "C:\\Program Files\\WindowsApps\\PowerShell\\pwsh.exe" },
      {
        kind: "powershell",
        path: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      },
      { kind: "cmd", path: "C:\\Windows\\System32\\cmd.exe" },
    ]);
    await waitFor(() => expect(select).toHaveTextContent("PowerShell 7"));
    expect(select).not.toHaveTextContent("Saved shell");
  });

  it("matches a saved detected path case-insensitively", async () => {
    useSharedSettings.setState({
      windowsShellPath: "c:\\program files\\windowsapps\\powershell\\pwsh.exe",
    });
    render(<TerminalSettings />);

    const select = screen.getByLabelText("Terminal panel shell");
    await waitFor(() => expect(select).toHaveTextContent("PowerShell 7"));
    expect(select).not.toHaveTextContent("Saved shell");
  });

  it("lists side-by-side PowerShell versions so the user can pick a specific install", async () => {
    bridgeMock.getAvailableWindowsShells.mockResolvedValueOnce([
      { kind: "pwsh", path: "C:\\Program Files\\PowerShell\\7.2\\pwsh.exe", version: "7.2" },
      { kind: "pwsh", path: "C:\\Program Files\\PowerShell\\7.1\\pwsh.exe", version: "7.1" },
      { kind: "cmd", path: "C:\\Windows\\System32\\cmd.exe" },
    ]);
    render(<TerminalSettings />);

    const select = screen.getByLabelText("Terminal panel shell");
    await waitFor(() => expect(select).toHaveTextContent("PowerShell 7.2"));
    fireEvent.click(select);
    expect(
      await screen.findByRole("option", { name: /PowerShell 7\.2 \(recommended\)/u }),
    ).toBeInTheDocument();
    const older = await screen.findByRole("option", { name: /^PowerShell 7\.1/u });
    fireEvent.click(older);

    expect(useSharedSettings.getState().windowsShellPath).toBe(
      "C:\\Program Files\\PowerShell\\7.1\\pwsh.exe",
    );
  });

  it("persists a separate PowerShell choice for internal commands and agents", async () => {
    bridgeMock.getAvailableWindowsShells.mockResolvedValueOnce([
      { kind: "pwsh", path: "C:\\Program Files\\PowerShell\\7.2\\pwsh.exe", version: "7.2" },
      { kind: "pwsh", path: "C:\\Program Files\\PowerShell\\7.1\\pwsh.exe", version: "7.1" },
      { kind: "cmd", path: "C:\\Windows\\System32\\cmd.exe" },
    ]);
    render(<TerminalSettings />);

    const select = screen.getByLabelText("Internal commands and agents");
    await waitFor(() => expect(select).toHaveTextContent("PowerShell 7.2"));
    fireEvent.click(select);
    expect(screen.queryByRole("option", { name: /Command Prompt/u })).toBeNull();
    fireEvent.click(await screen.findByRole("option", { name: /^PowerShell 7\.1/u }));

    expect(useSharedSettings.getState()).toMatchObject({
      windowsShellPath: WINDOWS_SHELL_AUTO,
      windowsInternalShellPath: "C:\\Program Files\\PowerShell\\7.1\\pwsh.exe",
    });
  });

  it("hides desktop panel controls in remote sessions", () => {
    bridgeMock.isRemoteSession.mockReturnValue(true);

    render(<TerminalSettings />);

    expect(screen.queryByText("Terminal position")).not.toBeInTheDocument();
    expect(screen.queryByText("Auto-show terminal panel")).not.toBeInTheDocument();
    expect(screen.queryByText("Browser pick target (CLI threads)")).not.toBeInTheDocument();
    expect(screen.queryByText("Windows shells")).not.toBeInTheDocument();
    expect(screen.queryByText("Terminal panel shell")).not.toBeInTheDocument();
    expect(screen.queryByText("Internal commands and agents")).not.toBeInTheDocument();
    expect(screen.queryByText("Terminal shell arguments")).not.toBeInTheDocument();
    expect(screen.getByText("Collapse terminal composer")).toBeInTheDocument();
    expect(screen.getByText("Agent terminal font size")).toBeInTheDocument();
    expect(screen.getByText("Terminal panel font size")).toBeInTheDocument();
    expect(screen.getByText("Terminal scroll speed")).toBeInTheDocument();
  });
});
