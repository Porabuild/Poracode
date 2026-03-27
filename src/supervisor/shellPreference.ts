import { spawnSync } from "node:child_process";

export interface WindowsShellPreference {
  shell: string;
  kind: "pwsh" | "powershell" | "cmd";
  args: string[];
}

function resolveShell(name: string): string | undefined {
  const result = spawnSync(process.platform === "win32" ? "where.exe" : "which", [name], {
    encoding: "utf8",
    timeout: 5_000,
    windowsHide: true,
  });
  if (result.status !== 0) return undefined;
  return result.stdout.trim().split(/\r?\n/)[0];
}

export function detectWindowsShell(): WindowsShellPreference {
  const pwsh = resolveShell("pwsh.exe") ?? resolveShell("pwsh");
  if (pwsh) {
    return { shell: pwsh, kind: "pwsh", args: ["-NoLogo"] };
  }

  const powershell = resolveShell("powershell.exe") ?? resolveShell("powershell");
  if (powershell) {
    return { shell: powershell, kind: "powershell", args: ["-NoLogo"] };
  }

  return {
    shell: "C:\\Windows\\System32\\cmd.exe",
    kind: "cmd",
    args: ["/k"],
  };
}
