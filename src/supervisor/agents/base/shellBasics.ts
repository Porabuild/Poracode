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

/** A valid POSIX environment variable name; anything else is rejected outright. */
const POSIX_ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Build a `export K=V; ` prefix string for injecting env vars into a POSIX shell script.
 * Returns an empty string when there are no env vars to inject.
 *
 * Values are always single-quoted via `quotePosixShellArg`. Keys are validated
 * against `POSIX_ENV_NAME_RE` and skipped if invalid: the key is interpolated
 * raw into the `export` statement, so a key containing shell metacharacters
 * would otherwise break out of the script. All current callers pass constant
 * keys, but this keeps a future dynamic-key caller from introducing injection.
 */
export function buildPosixExportPrefix(env: Record<string, string> | undefined): string {
  if (!env) return "";
  const entries = Object.entries(env).filter(([k]) => POSIX_ENV_NAME_RE.test(k));
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

/**
 * Quote a single argument for a Windows `CreateProcess` command line so the
 * child's C runtime (`CommandLineToArgvW` rules) parses it back verbatim:
 * wrap in double quotes, double every backslash run that precedes a quote
 * (or the closing quote), and backslash-escape embedded quotes. Newlines are
 * legal inside the quoted region and round-trip unchanged.
 */
export function quoteWindowsCommandLineArg(arg: string): string {
  if (arg.length > 0 && !/[ \t\r\n"]/.test(arg)) return arg;
  let out = '"';
  let backslashes = 0;
  for (const ch of arg) {
    if (ch === "\\") {
      backslashes++;
      continue;
    }
    if (ch === '"') {
      out += "\\".repeat(backslashes * 2 + 1) + '"';
    } else {
      out += "\\".repeat(backslashes) + ch;
    }
    backslashes = 0;
  }
  return out + "\\".repeat(backslashes * 2) + '"';
}

/** Join args into a `CreateProcess`-ready command line (MSVC quoting rules). */
export function buildWindowsCommandLine(args: readonly string[]): string {
  return args.map(quoteWindowsCommandLineArg).join(" ");
}

export { getWindowsSystemCommand };
