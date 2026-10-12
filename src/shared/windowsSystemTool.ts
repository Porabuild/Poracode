import { win32 } from "node:path";

/**
 * Absolute path of a Windows system executable. Bare names resolve through
 * PATH, and shells such as Git Bash put GNU tools first: GNU `whoami` rejects
 * `/user`, which stopped the server from starting there. System tools are
 * always invoked from System32 instead.
 */
export function windowsSystemTool(
  name: "whoami" | "icacls" | "reg" | "powershell",
  env: NodeJS.ProcessEnv = process.env,
): string {
  const root = env.SystemRoot ?? env.SYSTEMROOT ?? env.windir ?? env.WINDIR ?? "C:\\Windows";
  if (name === "powershell") {
    return win32.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  }
  return win32.join(root, "System32", `${name}.exe`);
}
