import { createServer } from "node:net";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  sshConnectPayloadSchema,
  type SshConnectPayload,
  type SshConnectResult,
  type SshConnectionConfig,
  type SshDiscoveredHost,
} from "@/shared/ssh";
import { ensureSshRuntimeBundle, type SshRuntimeBundleOptions } from "./runtimeBundle";
import {
  bootstrapRemoteRuntime,
  issueRemotePairingCredential,
  SSH_COMMAND_TIMEOUT_MS,
  SSH_INSTALL_TIMEOUT_MS,
  waitForRemoteEndpoint,
  type RemoteScriptRunner,
} from "@/shared/sshBootstrap";

const MAX_CAPTURED_OUTPUT_BYTES = 256 * 1024;

interface ProcessResult {
  readonly stdout: string;
  readonly stderr: string;
}

interface TunnelEntry {
  readonly configKey: string;
  readonly connection: SshConnectionConfig;
  readonly endpoint: string;
  readonly localPort: number;
  readonly remotePort: number;
  readonly runtimeHash: string;
  readonly child: ChildProcessWithoutNullStreams;
}

export interface SshConnectionManagerOptions extends SshRuntimeBundleOptions {
  readonly sshCommand?: string;
  readonly scpCommand?: string;
  readonly sshConfigFile?: string;
  readonly fetchImpl?: typeof fetch;
}

function appendBounded(current: string, chunk: Buffer): string {
  const next = current + chunk.toString("utf8");
  return next.length > MAX_CAPTURED_OUTPUT_BYTES
    ? next.slice(next.length - MAX_CAPTURED_OUTPUT_BYTES)
    : next;
}

function commandError(command: string, result: ProcessResult, code: number | null): Error {
  const detail = result.stderr.trim() || result.stdout.trim();
  return new Error(detail || `${command} exited with code ${code ?? "unknown"}.`);
}

function runProcess(
  command: string,
  args: readonly string[],
  options: { readonly stdin?: string; readonly timeoutMs?: number } = {},
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeoutMs = options.timeoutMs ?? SSH_COMMAND_TIMEOUT_MS;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`${command} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    timer.unref?.();

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = appendBounded(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = appendBounded(stderr, chunk);
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const result = { stdout, stderr };
      if (code === 0) resolve(result);
      else reject(commandError(command, result, code));
    });
    if (options.stdin !== undefined) child.stdin.end(options.stdin);
    else child.stdin.end();
  });
}

// Non-interactive safety options shared by every ssh/scp invocation.
const COMMON_SSH_OPTS = [
  "-o",
  "BatchMode=yes",
  "-o",
  "ConnectTimeout=10",
  "-o",
  "ForwardAgent=no",
] as const;

export function buildSshBaseArgs(
  connection: SshConnectionConfig,
  sshConfigFile?: string,
): string[] {
  return [
    "-T",
    ...(sshConfigFile ? ["-F", sshConfigFile] : []),
    ...COMMON_SSH_OPTS,
    ...(connection.port ? ["-p", String(connection.port)] : []),
    ...(connection.identityFile ? ["-i", connection.identityFile] : []),
  ];
}

export function buildScpArgs(
  connection: SshConnectionConfig,
  localPath: string,
  remotePath: string,
  sshConfigFile?: string,
): string[] {
  return [
    "-q",
    ...(sshConfigFile ? ["-F", sshConfigFile] : []),
    ...COMMON_SSH_OPTS,
    ...(connection.port ? ["-P", String(connection.port)] : []),
    ...(connection.identityFile ? ["-i", connection.identityFile] : []),
    localPath,
    `${connection.target}:${remotePath}`,
  ];
}

export function parseSshConfigHosts(contents: string): SshDiscoveredHost[] {
  const aliases = new Set<string>();
  for (const rawLine of contents.split(/\r?\n/g)) {
    const line = rawLine.replace(/\s+#.*$/, "").trim();
    const match = /^host\s+(.+)$/i.exec(line);
    if (!match) continue;
    for (const alias of match[1]!.trim().split(/\s+/g)) {
      if (!alias || /[*?!]/.test(alias) || alias.startsWith("-")) continue;
      aliases.add(alias);
    }
  }
  return [...aliases].sort((a, b) => a.localeCompare(b)).map((alias) => ({ alias }));
}

function configKey(connection: SshConnectionConfig): string {
  return JSON.stringify({
    target: connection.target,
    port: connection.port ?? null,
    identityFile: connection.identityFile ?? null,
  });
}

async function reserveLoopbackPort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => {
        if (error) reject(error);
        else if (port > 0) resolve(port);
        else reject(new Error("Could not reserve a local SSH tunnel port."));
      });
    });
  });
}

export class SshConnectionManager {
  private readonly tunnels = new Map<string, TunnelEntry>();
  private readonly connecting = new Map<string, Promise<SshConnectResult>>();
  private readonly fetchImpl: typeof fetch;
  private disposed = false;

  constructor(private readonly options: SshConnectionManagerOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  discoverHosts(): SshDiscoveredHost[] {
    const configPath = join(homedir(), ".ssh", "config");
    if (!existsSync(configPath)) return [];
    return parseSshConfigHosts(readFileSync(configPath, "utf8"));
  }

  connect(input: SshConnectPayload): Promise<SshConnectResult> {
    const parsed = sshConnectPayloadSchema.parse(input);
    const existing = this.connecting.get(parsed.connection.id);
    if (existing) return existing;
    const promise = this.connectInternal(parsed).finally(() => {
      if (this.connecting.get(parsed.connection.id) === promise) {
        this.connecting.delete(parsed.connection.id);
      }
    });
    this.connecting.set(parsed.connection.id, promise);
    return promise;
  }

  async disconnect(connectionId: string): Promise<void> {
    const entry = this.tunnels.get(connectionId);
    if (!entry) return;
    this.tunnels.delete(connectionId);
    await this.stopTunnel(entry.child);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const entries = [...this.tunnels.values()];
    this.tunnels.clear();
    await Promise.all(entries.map((entry) => this.stopTunnel(entry.child)));
  }

  private async connectInternal(input: SshConnectPayload): Promise<SshConnectResult> {
    if (this.disposed) throw new Error("SSH connection manager is disposed.");
    const connection = input.connection;
    if (connection.identityFile && !existsSync(connection.identityFile)) {
      throw new Error(`SSH identity file does not exist: ${connection.identityFile}`);
    }

    const current = this.tunnels.get(connection.id);
    if (current && current.configKey === configKey(connection) && current.child.exitCode === null) {
      const pairingCredential = input.issuePairingCredential
        ? await this.issuePairingCredential(connection, current.runtimeHash)
        : undefined;
      return {
        connectionId: connection.id,
        endpoint: current.endpoint,
        remotePort: current.remotePort,
        ...(pairingCredential ? { pairingCredential } : {}),
      };
    }
    if (current) await this.disconnect(connection.id);

    const bundle = ensureSshRuntimeBundle(this.options);
    const remotePort = await bootstrapRemoteRuntime(
      {
        runScript: this.scriptRunner(connection),
        deliverArchive: async (remotePath) => {
          await runProcess(
            this.options.scpCommand ?? (process.platform === "win32" ? "scp.exe" : "scp"),
            buildScpArgs(connection, bundle.archivePath, remotePath, this.options.sshConfigFile),
            { timeoutMs: SSH_INSTALL_TIMEOUT_MS },
          );
        },
      },
      connection.id,
      bundle.hash,
    );

    const localPort = await reserveLoopbackPort();
    const endpoint = `http://127.0.0.1:${localPort}/`;
    // Pairing is an independent ssh exec (1-3s of remote node bootstrap); run
    // it alongside the tunnel instead of serializing the two.
    const [pairingSettled, tunnelSettled] = await Promise.allSettled([
      input.issuePairingCredential
        ? this.issuePairingCredential(connection, bundle.hash)
        : Promise.resolve(undefined),
      this.openTunnel(connection, localPort, remotePort, endpoint),
    ]);
    if (pairingSettled.status === "rejected") {
      if (tunnelSettled.status === "fulfilled") tunnelSettled.value.kill();
      throw pairingSettled.reason;
    }
    if (tunnelSettled.status === "rejected") throw tunnelSettled.reason;
    const pairingCredential = pairingSettled.value;
    const child = tunnelSettled.value;
    const entry: TunnelEntry = {
      configKey: configKey(connection),
      connection,
      endpoint,
      localPort,
      remotePort,
      runtimeHash: bundle.hash,
      child,
    };
    this.tunnels.set(connection.id, entry);
    child.once("exit", () => {
      if (this.tunnels.get(connection.id) === entry) this.tunnels.delete(connection.id);
    });

    return {
      connectionId: connection.id,
      endpoint,
      remotePort,
      ...(pairingCredential ? { pairingCredential } : {}),
    };
  }

  private runSshScript(
    connection: SshConnectionConfig,
    script: string,
    scriptArgs: readonly string[] = [],
    options: { readonly timeoutMs?: number } = {},
  ): Promise<ProcessResult> {
    return runProcess(
      this.options.sshCommand ?? (process.platform === "win32" ? "ssh.exe" : "ssh"),
      [
        ...buildSshBaseArgs(connection, this.options.sshConfigFile),
        connection.target,
        "sh",
        "-s",
        "--",
        ...scriptArgs,
      ],
      { stdin: script, ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}) },
    );
  }

  private scriptRunner(connection: SshConnectionConfig): RemoteScriptRunner {
    return async (script, args, timeoutMs) => {
      const result = await this.runSshScript(connection, script, args, { timeoutMs });
      return result.stdout;
    };
  }

  private issuePairingCredential(
    connection: SshConnectionConfig,
    runtimeHash: string,
  ): Promise<string> {
    return issueRemotePairingCredential(this.scriptRunner(connection), connection.id, runtimeHash);
  }

  private async openTunnel(
    connection: SshConnectionConfig,
    localPort: number,
    remotePort: number,
    endpoint: string,
  ): Promise<ChildProcessWithoutNullStreams> {
    const sshCommand =
      this.options.sshCommand ?? (process.platform === "win32" ? "ssh.exe" : "ssh");
    const args = [
      ...buildSshBaseArgs(connection, this.options.sshConfigFile),
      "-o",
      "ExitOnForwardFailure=yes",
      "-o",
      "ServerAliveInterval=15",
      "-o",
      "ServerAliveCountMax=3",
      "-N",
      "-L",
      `127.0.0.1:${localPort}:127.0.0.1:${remotePort}`,
      connection.target,
    ];
    const child = spawn(sshCommand, args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdin.end();
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = appendBounded(stderr, chunk);
    });

    const exited = new Promise<never>((_resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => {
        reject(new Error(stderr.trim() || `SSH tunnel exited with code ${code ?? "unknown"}.`));
      });
    });
    try {
      await Promise.race([waitForRemoteEndpoint(this.fetchImpl, endpoint), exited]);
      return child;
    } catch (error) {
      child.kill();
      throw error;
    }
  }

  private async stopTunnel(child: ChildProcessWithoutNullStreams): Promise<void> {
    if (child.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 2_000);
      timer.unref?.();
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill();
    });
  }
}
