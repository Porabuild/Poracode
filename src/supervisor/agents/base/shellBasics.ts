import { join } from "node:path";

function getWindowsSystemCommand(name: string): string {
  const systemRoot = process.env.SystemRoot ?? process.env.windir ?? "C:\\Windows";
  return join(systemRoot, "System32", name);
}

export function getWslCommand(): string {
  return getWindowsSystemCommand("wsl.exe");
}

/**
 * Default PATH used inside a WSL distro when launching an agent CLI, before
 * prepending any resolved binary/node dirs. Shared by the per-provider argv
 * builders so the fallback search path stays consistent across providers.
 */
export const DEFAULT_WSL_EXEC_PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

/**
 * Build a `export K=V; ` prefix string for injecting env vars into a POSIX shell script.
 * Returns an empty string when there are no env vars to inject.
 */
export function buildPosixExportPrefix(env: Record<string, string> | undefined): string {
  if (!env) return "";
  const entries = Object.entries(env);
  if (entries.length === 0) return "";
  return entries.map(([k, v]) => `export ${k}=${quotePosixShellArg(v)}`).join("; ") + "; ";
}

export function getPosixLoginShellArgs(script: string): string[] {
  return process.platform === "darwin" ? ["-l", "-i", "-c", script] : ["-l", "-c", script];
}

export function quotePowerShellLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function quotePosixShellArg(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export { getWindowsSystemCommand };
