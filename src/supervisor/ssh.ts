import { spawn } from "node:child_process";
import type { ProjectLocation } from "@/shared/contracts";
import { isSafeSshHost } from "@/shared/ssh";
import type { CommandSpec } from "./agents/base";
import { buildPosixExportPrefix, quotePosixShellArg } from "./agents/base/shellBasics";

export const SSH_DEFAULT_TIMEOUT = 15_000;

export interface SshCommandOutput {
  stdout: string;
  stderr: string;
}

export type SshLocation = Extract<ProjectLocation, { kind: "ssh" }>;
type SshCommandError = Error & { stdout?: string; stderr?: string; code?: number | null };
const sshHomeCache = new Map<string, string>();

function assertSshLocation(location: SshLocation): void {
  if (!isSafeSshHost(location.host)) {
    throw new Error("Invalid SSH host.");
  }
}

function baseSshArgs(
  location: SshLocation,
  options: { batchMode: "yes" | "no"; tty: boolean },
): string[] {
  assertSshLocation(location);
  return [...baseSshOptions(options), location.host];
}

function baseSshOptions(options: { batchMode: "yes" | "no"; tty: boolean }): string[] {
  return [
    "-o",
    `BatchMode=${options.batchMode}`,
    "-o",
    "ConnectTimeout=10",
    options.tty ? "-tt" : "-T",
  ];
}

function remoteScriptForCommand(
  location: SshLocation,
  command: string,
  args: string[],
  env?: Record<string, string>,
): string {
  const exports = buildPosixExportPrefix(env);
  const argv = [command, ...args].map(quotePosixShellArg).join(" ");
  const inner = `${exports}exec ${argv}`;
  return `cd ${quotePosixShellArg(location.path)} && exec "\${SHELL:-/bin/sh}" -l -c ${quotePosixShellArg(inner)}`;
}

export function buildSshPtyCommand(
  location: SshLocation,
  command: string,
  args: string[],
  env?: Record<string, string>,
): CommandSpec {
  return buildSshCommand(location, command, args, env, { batchMode: "no", tty: true });
}

export function buildSshCommand(
  location: SshLocation,
  command: string,
  args: string[],
  env?: Record<string, string>,
  options?: { batchMode?: "yes" | "no"; tty?: boolean },
): CommandSpec {
  const script = remoteScriptForCommand(location, command, args, env);
  return {
    command: "ssh",
    args: [
      ...baseSshArgs(location, {
        batchMode: options?.batchMode ?? "yes",
        tty: options?.tty ?? false,
      }),
      `sh -lc ${quotePosixShellArg(script)}`,
    ],
  };
}

export function buildSshShellCommand(
  location: SshLocation,
  options?: { startInHome?: boolean },
): CommandSpec {
  const cd = options?.startInHome ? "" : `cd ${quotePosixShellArg(location.path)} && `;
  const script = `${cd}exec "\${SHELL:-/bin/sh}" -l`;
  return {
    command: "ssh",
    args: [
      ...baseSshArgs(location, { batchMode: "no", tty: true }),
      `sh -lc ${quotePosixShellArg(script)}`,
    ],
  };
}

export async function readSshCommandOutput(
  location: SshLocation,
  command: string,
  args: string[],
  options?: { timeout?: number; maxBuffer?: number; env?: Record<string, string> },
): Promise<SshCommandOutput> {
  return runSshScript(
    location,
    `${buildPosixExportPrefix(options?.env)}exec ${[command, ...args].map(quotePosixShellArg).join(" ")}`,
    options,
  );
}

export function runSshScript(
  location: SshLocation,
  script: string,
  options?: { timeout?: number; maxBuffer?: number },
): Promise<SshCommandOutput> {
  assertSshLocation(location);
  const timeout = options?.timeout ?? SSH_DEFAULT_TIMEOUT;
  const maxBuffer = options?.maxBuffer ?? 10 * 1024 * 1024;
  const wrapped = `set -e\ncd ${quotePosixShellArg(location.path)}\n${script}\n`;

  return new Promise((resolve, reject) => {
    const child = spawn(
      "ssh",
      [...baseSshArgs(location, { batchMode: "yes", tty: false }), "sh", "-s"],
      {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      child.kill();
      reject(new Error(`SSH command timed out after ${timeout}ms.`));
    }, timeout);
    if (typeof timer.unref === "function") timer.unref();

    // Overflow has to settle the promise itself: otherwise the kill triggers a
    // `close` with a null exit code and the handler below rejects with a
    // misleading "SSH command exited null" instead of an explicit cap error.
    const failOverflow = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      reject(new Error(`SSH command output exceeded ${maxBuffer} bytes.`));
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > maxBuffer) failOverflow();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > maxBuffer) failOverflow();
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const error = new Error(stderr.trim() || `SSH command exited ${code}.`) as SshCommandError;
      error.stdout = stdout;
      error.stderr = stderr;
      error.code = code;
      reject(error);
    });
    child.stdin.end(wrapped);
  });
}

export async function resolveSshHomeDirectoryAsync(
  location: SshLocation,
): Promise<string | undefined> {
  assertSshLocation(location);
  const cached = sshHomeCache.get(location.host);
  if (cached) return cached;
  const result = await readSshCommandOutput(location, "sh", ["-lc", 'printf %s "$HOME"'], {
    timeout: 5_000,
  }).catch(() => undefined);
  const home = result?.stdout.trim() ?? "";
  if (!home) return undefined;
  sshHomeCache.set(location.host, home);
  return home;
}
