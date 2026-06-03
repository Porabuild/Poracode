import { randomInt } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
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

function normalizeLoopbackHost(hostname: string): string {
  return hostname === "localhost" ? "127.0.0.1" : hostname;
}

function parseTcpTarget(url: string): { host: string; port: number; path: string } | undefined {
  try {
    const parsed = new URL(url);
    const port = parsed.port
      ? Number(parsed.port)
      : parsed.protocol === "https:"
        ? 443
        : parsed.protocol === "http:"
          ? 80
          : undefined;
    if (!port) return undefined;
    return { host: normalizeLoopbackHost(parsed.hostname), port, path: parsed.pathname };
  } catch {
    return undefined;
  }
}

interface SshBrowserMcpTunnelState {
  child: ChildProcess;
  baseUrl: string;
  secret: string;
}

interface SshHookTunnelState {
  child: ChildProcess;
  url: string;
  secret: string;
  protocolVersion: number;
}

export class SshBrowserMcpTunnelManager {
  private readonly tunnels = new Map<string, SshBrowserMcpTunnelState>();
  private readonly inFlight = new Map<
    string,
    Promise<{ baseUrl: string; secret: string } | undefined>
  >();

  async ensureTunnel(
    location: SshLocation,
    upstream: { url: string; token: string },
  ): Promise<{ baseUrl: string; secret: string } | undefined> {
    assertSshLocation(location);
    const target = parseTcpTarget(upstream.url);
    if (!target) return undefined;
    const key = `${location.host}|${target.host}:${target.port}|${upstream.token}`;
    const existing = this.tunnels.get(key);
    if (existing && existing.child.exitCode === null && existing.child.signalCode === null) {
      return { baseUrl: existing.baseUrl, secret: existing.secret };
    }
    const pending = this.inFlight.get(key);
    if (pending) return pending;
    const task = this.startTunnel(location, upstream.token, target, key).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, task);
    return task;
  }

  dispose(): void {
    for (const tunnel of this.tunnels.values()) {
      tunnel.child.kill();
    }
    this.tunnels.clear();
  }

  private async startTunnel(
    location: SshLocation,
    token: string,
    target: { host: string; port: number; path: string },
    key: string,
  ): Promise<{ baseUrl: string; secret: string } | undefined> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const remotePort = randomInt(40_000, 60_000);
      const child = spawn(
        "ssh",
        [
          ...baseSshOptions({ batchMode: "yes", tty: false }),
          "-N",
          "-o",
          "ExitOnForwardFailure=yes",
          "-R",
          `127.0.0.1:${remotePort}:${target.host}:${target.port}`,
          location.host,
        ],
        { windowsHide: true, stdio: "ignore" },
      );

      const ready = await waitForTunnelReady(child);
      if (!ready) continue;

      const baseUrl = `http://127.0.0.1:${remotePort}`;
      const state: SshBrowserMcpTunnelState = { child, baseUrl, secret: token };
      this.tunnels.set(key, state);
      child.once("exit", () => {
        if (this.tunnels.get(key) === state) this.tunnels.delete(key);
      });
      return { baseUrl, secret: token };
    }
    return undefined;
  }
}

export class SshHookTunnelManager {
  private readonly tunnels = new Map<string, SshHookTunnelState>();
  private readonly inFlight = new Map<
    string,
    Promise<{ url: string; secret: string; protocolVersion: number } | undefined>
  >();

  async ensureTunnel(
    location: SshLocation,
    upstream: { url: string; secret: string; protocolVersion: number },
  ): Promise<{ url: string; secret: string; protocolVersion: number } | undefined> {
    assertSshLocation(location);
    const target = parseTcpTarget(upstream.url);
    if (!target) return undefined;
    const key = [
      location.host,
      target.host,
      target.port,
      upstream.secret,
      upstream.protocolVersion,
    ].join("|");
    const existing = this.tunnels.get(key);
    if (existing && existing.child.exitCode === null && existing.child.signalCode === null) {
      return {
        url: existing.url,
        secret: existing.secret,
        protocolVersion: existing.protocolVersion,
      };
    }
    const pending = this.inFlight.get(key);
    if (pending) return pending;
    const task = this.startTunnel(location, upstream, target, key).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, task);
    return task;
  }

  dispose(): void {
    for (const tunnel of this.tunnels.values()) {
      tunnel.child.kill();
    }
    this.tunnels.clear();
  }

  private async startTunnel(
    location: SshLocation,
    upstream: { secret: string; protocolVersion: number },
    target: { host: string; port: number; path: string },
    key: string,
  ): Promise<{ url: string; secret: string; protocolVersion: number } | undefined> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const remotePort = randomInt(40_000, 60_000);
      const child = spawn(
        "ssh",
        [
          ...baseSshOptions({ batchMode: "yes", tty: false }),
          "-N",
          "-o",
          "ExitOnForwardFailure=yes",
          "-R",
          `127.0.0.1:${remotePort}:${target.host}:${target.port}`,
          location.host,
        ],
        { windowsHide: true, stdio: "ignore" },
      );

      const ready = await waitForTunnelReady(child);
      if (!ready) continue;

      const state: SshHookTunnelState = {
        child,
        url: `http://127.0.0.1:${remotePort}${target.path}`,
        secret: upstream.secret,
        protocolVersion: upstream.protocolVersion,
      };
      this.tunnels.set(key, state);
      child.once("exit", () => {
        if (this.tunnels.get(key) === state) this.tunnels.delete(key);
      });
      return {
        url: state.url,
        secret: state.secret,
        protocolVersion: state.protocolVersion,
      };
    }
    return undefined;
  }
}

function waitForTunnelReady(child: ChildProcess): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(child.exitCode === null && child.signalCode === null);
    }, 600);
    if (typeof timer.unref === "function") timer.unref();

    const onExit = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve(false);
    };
    const onError = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve(false);
    };
    const cleanup = () => {
      child.off("exit", onExit);
      child.off("error", onError);
    };
    child.once("exit", onExit);
    child.once("error", onError);
  });
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

export function buildSshForwardedCommand(
  location: SshLocation,
  command: string,
  args: string[],
  env: Record<string, string> | undefined,
  forwards: Array<{
    localHost: string;
    localPort: number;
    remoteHost: string;
    remotePort: number;
  }>,
  options?: { batchMode?: "yes" | "no"; tty?: boolean },
): CommandSpec {
  assertSshLocation(location);
  const script = remoteScriptForCommand(location, command, args, env);
  const forwardArgs = forwards.flatMap((forward) => [
    "-L",
    `${forward.localHost}:${forward.localPort}:${forward.remoteHost}:${forward.remotePort}`,
  ]);
  return {
    command: "ssh",
    args: [
      ...baseSshOptions({
        batchMode: options?.batchMode ?? "yes",
        tty: options?.tty ?? false,
      }),
      "-o",
      "ExitOnForwardFailure=yes",
      ...forwardArgs,
      location.host,
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

export function readSshCommandOutputSync(
  location: SshLocation,
  command: string,
  args: string[],
  options?: { timeout?: number; maxBuffer?: number; env?: Record<string, string> },
): { ok: boolean; stdout: string; stderr: string } {
  const script = `${buildPosixExportPrefix(options?.env)}exec ${[command, ...args].map(quotePosixShellArg).join(" ")}`;
  return runSshScriptSync(location, script, options);
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

export function runSshScriptSync(
  location: SshLocation,
  script: string,
  options?: { timeout?: number; maxBuffer?: number },
): { ok: boolean; stdout: string; stderr: string } {
  assertSshLocation(location);
  const wrapped = `set -e\ncd ${quotePosixShellArg(location.path)}\n${script}\n`;
  const result = spawnSync(
    "ssh",
    [...baseSshArgs(location, { batchMode: "yes", tty: false }), "sh", "-s"],
    {
      input: wrapped,
      encoding: "utf8",
      windowsHide: true,
      timeout: options?.timeout ?? SSH_DEFAULT_TIMEOUT,
      maxBuffer: options?.maxBuffer ?? 10 * 1024 * 1024,
    },
  );
  return {
    ok: !result.error && result.status === 0,
    stdout: `${result.stdout ?? ""}`,
    stderr: `${result.stderr ?? ""}`,
  };
}

export function resolveSshHomeDirectory(location: SshLocation): string | undefined {
  assertSshLocation(location);
  const cached = sshHomeCache.get(location.host);
  if (cached) return cached;
  const result = readSshCommandOutputSync(location, "sh", ["-lc", 'printf %s "$HOME"'], {
    timeout: 5_000,
  });
  const home = result.ok ? result.stdout.trim() : "";
  if (!home) return undefined;
  sshHomeCache.set(location.host, home);
  return home;
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
