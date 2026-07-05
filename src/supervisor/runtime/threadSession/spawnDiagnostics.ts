import { accessSync, constants as fsConstants, existsSync, statSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

export function describeSpawnFailure(
  kind: "shell" | "agent",
  cmd: { command: string; args: string[]; cwd?: string },
  env: Record<string, string>,
  error: unknown,
): string {
  const base = error instanceof Error ? error.message : String(error);
  const prefix = `Failed to spawn ${kind} (${cmd.command})`;

  if (cmd.cwd) {
    const cwdDiagnosis = diagnoseCwd(cmd.cwd);
    if (cwdDiagnosis) return cwdDiagnosis;
  }

  if (cmd.command.startsWith("/")) {
    const binaryDiagnosis = diagnoseShellBinary(cmd.command);
    if (binaryDiagnosis) return binaryDiagnosis;
  } else {
    // node-pty surfaces a bare "posix_spawnp failed." for PATH-lookup misses.
    // Do the lookup ourselves against the env actually handed to the child so
    // the user sees whether the binary was missing vs found-but-unspawnable.
    const lookup = diagnoseRelativeBinary(cmd.command, env);
    if (lookup) return `${prefix}: ${lookup}`;
  }

  // posix_spawn returns E2BIG when env+argv exceed ARG_MAX (~256KB on macOS).
  const envBytes = measureEnvBytes(env);
  const argvBytes = measureArgvBytes(cmd.command, cmd.args);
  // Leave headroom — ARG_MAX includes pointer overhead and string terminators.
  if (envBytes + argvBytes > 200_000) {
    return `${prefix}: environment is too large (${Math.round((envBytes + argvBytes) / 1024)} KB). This usually means a parent process leaked variables into the launch env.`;
  }

  return `${prefix}: ${base}`;
}

function diagnoseRelativeBinary(command: string, env: Record<string, string>): string | undefined {
  const pathValue = env.PATH ?? "";
  const entries = pathValue.split(":").filter((entry) => entry.length > 0);
  for (const entry of entries) {
    const candidate = resolvePath(entry, command);
    try {
      const stat = statSync(candidate);
      if (stat.isFile() && (stat.mode & 0o111) !== 0) return undefined;
    } catch {
      // continue
    }
  }
  if (entries.length === 0) {
    return `'${command}' could not be resolved — PATH is empty.`;
  }
  return `'${command}' was not found on PATH (${entries.length} entries searched). Check that the binary is installed and visible to the app's environment.`;
}

export function sanitizeEnv(source: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== "string") continue;
    // posix_spawn treats embedded NULs as terminators and rejects the env.
    if (value.indexOf("\0") !== -1) continue;
    out[key] = value;
  }
  return out;
}

// process.env is effectively static after supervisor boot — sanitize once
// instead of re-scanning ~150–300 entries on every startShell call.
export const sanitizedProcessEnv = sanitizeEnv(process.env);

function measureEnvBytes(env: Record<string, string>): number {
  let total = 0;
  for (const [key, value] of Object.entries(env)) {
    total += Buffer.byteLength(key) + Buffer.byteLength(value) + 2; // '=' and NUL
  }
  return total;
}

function measureArgvBytes(command: string, args: readonly string[]): number {
  let total = Buffer.byteLength(command) + 1;
  for (const arg of args) {
    total += Buffer.byteLength(arg) + 1;
  }
  return total;
}

function diagnoseCwd(cwd: string): string | undefined {
  let stat;
  try {
    stat = statSync(cwd);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return `Cannot start shell: working directory does not exist (${cwd}).`;
    }
    if (code === "EACCES") {
      return `Cannot start shell: working directory is not accessible (${cwd}).`;
    }
    return `Cannot start shell: working directory (${cwd}) error: ${(err as Error).message}`;
  }
  if (!stat.isDirectory()) {
    return `Cannot start shell: working directory path is not a directory (${cwd}).`;
  }
  try {
    accessSync(cwd, fsConstants.X_OK | fsConstants.R_OK);
  } catch {
    return `Cannot start shell: working directory lacks read/execute permission (${cwd}).`;
  }
  return undefined;
}

function diagnoseShellBinary(command: string): string | undefined {
  if (!existsSync(command)) {
    return `Cannot start shell: ${command} not found. Check $SHELL.`;
  }
  let stat;
  try {
    stat = statSync(command);
  } catch {
    return undefined;
  }
  if (!stat.isFile()) {
    return `Cannot start shell: ${command} is not an executable file.`;
  }
  try {
    accessSync(command, fsConstants.X_OK);
  } catch {
    return `Cannot start shell: ${command} is not executable (no +x permission).`;
  }
  return undefined;
}
