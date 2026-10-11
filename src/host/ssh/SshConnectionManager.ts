import { createServer } from "node:net";
import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from "node:child_process";
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
import {
  bootstrapRemoteRuntime,
  issueRemotePairingCredential,
  SSH_BOOTSTRAP_LOCK_WAIT_MS,
  SSH_COMMAND_TIMEOUT_MS,
  SSH_INSTALL_LOCK_WAIT_MS,
  SSH_INSTALL_TIMEOUT_MS,
  upgradeRemoteRuntime,
  waitForRemoteEndpoint,
  type RemoteScriptRunner,
  type RemoteRuntimeTransport,
} from "@/shared/sshBootstrap";
import {
  ensureSshRuntimeBundleAsync,
  type SshRuntimeBundleAsyncResult,
} from "./runtimeBundleAsync";
import type { SshRuntimeBundle } from "./runtimeBundleShared";
import {
  appendBoundedOutput,
  joinChildProcess,
  SSH_COMMAND_MAX_OUTPUT_BYTES,
  SshTrackedCommandRunner,
} from "./sshTrackedCommands";
import { ensureRemoteRuntimeInstalled } from "./sshRuntimeInstall";
import type { SshKnownHostsPolicy } from "./sshHostKeyTrust";
import {
  isSshOperationAbortError,
  sshOperationAbortError,
  type SshConnectOptions,
  type SshEnvironmentController,
} from "./sshEnvironmentController";

const SSH_EXISTING_TUNNEL_READY_TIMEOUT_MS = 2_000;

interface TunnelEntry {
  readonly configKey: string;
  readonly connection: SshConnectionConfig;
  readonly endpoint: string;
  readonly localPort: number;
  readonly remotePort: number;
  readonly runtimeHash: string;
  /** Manager operation generation that registered this tunnel. */
  readonly generation: number;
  readonly child: ChildProcessWithoutNullStreams;
}

/**
 * One in-flight connect operation. Callers await a per-caller wrapper around
 * `promise`; `waiters` counts live callers so a single caller's abort only
 * cancels work nobody else is waiting for.
 */
interface PendingConnect {
  readonly connectionId: string;
  readonly configKey: string;
  readonly kind: "connect" | "upgrade";
  readonly knownHosts?: SshKnownHostsPolicy;
  readonly generation: number;
  readonly controller: AbortController;
  waiters: number;
  cancelled: boolean;
  settled: boolean;
  promise: Promise<SshConnectResult>;
}

export interface SshConnectionManagerOptions {
  readonly mainBundleDir: string;
  readonly agentPluginsDir: string;
  readonly wslHelpersDir: string;
  readonly bundledSkillsDir?: string;
  readonly bundledPluginsDir?: string;
  readonly cacheDir: string;
  readonly tarCommand?: string;
  /** Immutable release archive directory, when the artifact pipeline ships one. */
  readonly preassembledArchiveDir?: string;
  /** Test seam: replaces the worker-side async bundle builder. */
  readonly bundleProvider?: (signal: AbortSignal) => Promise<SshRuntimeBundle>;
  readonly sshCommand?: string;
  readonly scpCommand?: string;
  readonly sshConfigFile?: string;
  readonly fetchImpl?: typeof fetch;
  /** Notified after a registered tunnel child exits on its own or is stopped. */
  readonly onTunnelExit?: (connectionId: string) => void;
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

/**
 * Known-hosts arguments for an environment trust policy. The per-environment
 * file is the only consulted trust store (`GlobalKnownHostsFile` is disabled),
 * `StrictHostKeyChecking=yes` fails closed on any change, and `UpdateHostKeys`
 * is off so OpenSSH never widens the accepted key set behind our back.
 */
function knownHostsArgs(knownHosts: SshKnownHostsPolicy | undefined): string[] {
  if (knownHosts === undefined) return [];
  return [
    "-o",
    "StrictHostKeyChecking=yes",
    "-o",
    `UserKnownHostsFile=${knownHosts.userKnownHostsFile}`,
    "-o",
    `GlobalKnownHostsFile=${process.platform === "win32" ? "NUL" : "/dev/null"}`,
    "-o",
    "UpdateHostKeys=no",
  ];
}

export function buildSshBaseArgs(
  connection: SshConnectionConfig,
  sshConfigFile?: string,
  knownHosts?: SshKnownHostsPolicy,
): string[] {
  return [
    "-T",
    ...(sshConfigFile ? ["-F", sshConfigFile] : []),
    ...COMMON_SSH_OPTS,
    ...knownHostsArgs(knownHosts),
    ...(connection.port ? ["-p", String(connection.port)] : []),
    ...(connection.identityFile ? ["-i", connection.identityFile] : []),
  ];
}

export function buildScpArgs(
  connection: SshConnectionConfig,
  localPath: string,
  remotePath: string,
  sshConfigFile?: string,
  knownHosts?: SshKnownHostsPolicy,
): string[] {
  return [
    "-q",
    ...(sshConfigFile ? ["-F", sshConfigFile] : []),
    ...COMMON_SSH_OPTS,
    ...knownHostsArgs(knownHosts),
    ...(connection.port ? ["-P", String(connection.port)] : []),
    ...(connection.identityFile ? ["-i", connection.identityFile] : []),
    localPath,
    `${connection.target}:${remotePath}`,
  ];
}

/**
 * A configured `hostKeyFingerprint` is never silently ignored: it requires a
 * known-hosts trust policy (the environment service supplies one from the
 * verified probe/pin). Without the policy there is no accepted key material to
 * enforce, so the connect refuses instead of dialing with default checking.
 */
function assertKnownHostsPolicy(
  connection: SshConnectionConfig,
  knownHosts: SshKnownHostsPolicy | undefined,
): void {
  if (connection.hostKeyFingerprint !== undefined && knownHosts === undefined) {
    throw new Error(
      "This SSH connection pins a host-key fingerprint; a known-hosts trust policy is required.",
    );
  }
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

/**
 * Dedupe identity for a connect/upgrade operation and its registered tunnel.
 *
 * It covers the dial configuration *and* the trust identity: authentication
 * mode, the configured host-key pin, and the known-hosts policy file. Two
 * requests that differ only by trust material (for example a re-trust or a
 * legacy config that set `hostKeyFingerprint`) must never share an in-flight
 * operation or reuse a tunnel established under the other policy.
 */
export function sshTunnelConfigKey(
  connection: SshConnectionConfig,
  knownHosts?: SshKnownHostsPolicy,
): string {
  return JSON.stringify({
    target: connection.target,
    port: connection.port ?? null,
    identityFile: connection.identityFile ?? null,
    authentication: connection.authentication ?? null,
    hostKeyFingerprint: connection.hostKeyFingerprint ?? null,
    knownHostsFile: knownHosts?.userKnownHostsFile ?? null,
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

/**
 * Host-owned SSH orchestration for one process.
 *
 * The manager owns the whole device-local mechanism — discovery, bundle
 * staging, probe/install/launch, uploads and tunnels — with operation
 * generations, config-keyed dedupe, waiter ownership and complete cancellation:
 * `disconnect`/`dispose` abort *and join* every in-flight stage, and a
 * cancelled or superseded operation can never register a tunnel afterwards.
 *
 * It is Electron-free on purpose: the desktop runs it inside the SSH utility
 * process, while a backend/headless composition can construct it directly.
 */
export class SshConnectionManager implements SshEnvironmentController {
  private readonly tunnels = new Map<string, TunnelEntry>();
  private readonly connecting = new Map<string, PendingConnect>();
  /** Long-lived tunnel children; one-shot commands are owned by `commands`. */
  private readonly tunnelChildren = new Set<ChildProcess>();
  private readonly tunnelExitListeners = new Set<(connectionId: string) => void>();
  private readonly commands = new SshTrackedCommandRunner({
    defaultTimeoutMs: SSH_COMMAND_TIMEOUT_MS,
  });
  private readonly fetchImpl: typeof fetch;
  private operationGeneration = 0;
  private disposed = false;
  private disposeStarted: Promise<void> | null = null;

  constructor(private readonly options: SshConnectionManagerOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /**
   * Subscribe to registered tunnel exits (service-level invalidation for the
   * environment proxy). Returns an unsubscribe function.
   */
  onTunnelExit(listener: (connectionId: string) => void): () => void {
    this.tunnelExitListeners.add(listener);
    return () => {
      this.tunnelExitListeners.delete(listener);
    };
  }

  private notifyTunnelExit(connectionId: string): void {
    try {
      this.options.onTunnelExit?.(connectionId);
    } catch {
      // A listener must never break tunnel bookkeeping.
    }
    for (const listener of [...this.tunnelExitListeners]) {
      try {
        listener(connectionId);
      } catch {
        // A listener must never break tunnel bookkeeping.
      }
    }
  }

  /** Operation generation counter (diagnostics; monotonic per manager). */
  get generation(): number {
    return this.operationGeneration;
  }

  discoverHosts(): SshDiscoveredHost[] {
    const configPath = join(homedir(), ".ssh", "config");
    if (!existsSync(configPath)) return [];
    return parseSshConfigHosts(readFileSync(configPath, "utf8"));
  }

  connect(input: SshConnectPayload, options: SshConnectOptions = {}): Promise<SshConnectResult> {
    const parsed = sshConnectPayloadSchema.parse(input);
    if (this.disposed) {
      return Promise.reject(sshOperationAbortError("The SSH connection manager was disposed."));
    }
    const key = sshTunnelConfigKey(parsed.connection, options.knownHosts);
    const existing = this.connecting.get(parsed.connection.id);
    if (existing && !existing.cancelled && existing.configKey === key) {
      return this.attach(existing, options.signal);
    }
    if (existing) {
      // A changed configuration must never receive the previous config's
      // result: the old operation is cancelled (and joins its children) before
      // a fresh one begins.
      this.cancelPending(
        existing,
        sshOperationAbortError("The SSH connection configuration changed while connecting."),
      );
    }
    return this.attach(this.begin(parsed, key, "connect", options.knownHosts), options.signal);
  }

  /**
   * Explicit owner-authorized runtime replacement (C1/D4). Ordinary connect
   * never calls this: the environment service serializes it as a manage
   * operation and re-verifies the child identity afterwards. The old owner is
   * drained and joined before the new runtime starts into the same data root.
   *
   * A transport that cannot carry the upgrade verb (for example the desktop SSH
   * utility until its protocol owns `upgrade`) simply does not implement this
   * method; the caller must refuse with a typed `upgrade-unavailable` instead
   * of substituting a connect.
   */
  async upgrade(
    input: SshConnectPayload,
    options: SshConnectOptions = {},
  ): Promise<SshConnectResult> {
    const parsed = sshConnectPayloadSchema.parse(input);
    if (this.disposed) {
      throw sshOperationAbortError("The SSH connection manager was disposed.");
    }
    const key = sshTunnelConfigKey(parsed.connection, options.knownHosts);
    const existing = this.connecting.get(parsed.connection.id);
    if (existing) {
      // An explicit upgrade always supersedes an in-flight ordinary connect,
      // and joins it before touching the remote so two operations can never
      // overlap on one target.
      this.cancelPending(
        existing,
        sshOperationAbortError("An explicit runtime upgrade superseded the connect."),
      );
      await existing.promise.catch(() => undefined);
    }
    return this.attach(this.begin(parsed, key, "upgrade", options.knownHosts), options.signal);
  }

  async disconnect(connectionId: string): Promise<void> {
    const pending = this.connecting.get(connectionId);
    if (pending) {
      this.cancelPending(
        pending,
        sshOperationAbortError("The SSH connection was disconnected while connecting."),
      );
      await pending.promise.catch(() => undefined);
    }
    const entry = this.tunnels.get(connectionId);
    if (entry) await this.stopTunnelEntry(connectionId, entry);
  }

  async dispose(): Promise<void> {
    if (!this.disposeStarted) {
      this.disposed = true;
      this.disposeStarted = this.disposeInternal();
    }
    return this.disposeStarted;
  }

  private async disposeInternal(): Promise<void> {
    const pending = [...this.connecting.values()];
    for (const operation of pending) {
      this.cancelPending(
        operation,
        sshOperationAbortError("The SSH connection manager was disposed."),
      );
    }
    // Join every operation before touching the tunnels: an operation may still
    // be between spawn and registration, and only its own settle proves the
    // child was reaped.
    await Promise.allSettled(pending.map((operation) => operation.promise));
    const tunnels = [...this.tunnels.values()];
    this.tunnels.clear();
    await Promise.all(tunnels.map((entry) => this.stopTunnelChild(entry.child)));
    // Belt and braces: any one-shot command or tunnel child spawned by a race
    // that escaped operation ownership is still joined before dispose resolves.
    await this.commands.dispose();
    await Promise.all([...this.tunnelChildren].map((child) => joinChildProcess(child)));
  }

  private begin(
    input: SshConnectPayload,
    key: string,
    kind: "connect" | "upgrade",
    knownHosts: SshKnownHostsPolicy | undefined,
  ): PendingConnect {
    const controller = new AbortController();
    const pending: PendingConnect = {
      connectionId: input.connection.id,
      configKey: key,
      kind,
      ...(knownHosts === undefined ? {} : { knownHosts }),
      generation: ++this.operationGeneration,
      controller,
      waiters: 0,
      cancelled: false,
      settled: false,
      promise: undefined as unknown as Promise<SshConnectResult>,
    };
    const work =
      kind === "upgrade"
        ? this.upgradeInternal(input, pending)
        : this.connectInternal(input, pending);
    const promise = work.finally(() => {
      pending.settled = true;
      if (this.connecting.get(pending.connectionId) === pending) {
        this.connecting.delete(pending.connectionId);
      }
    });
    pending.promise = promise;
    this.connecting.set(input.connection.id, pending);
    // Callers attach immediately; keep an early rejection observed either way.
    void promise.catch(() => undefined);
    return pending;
  }

  /**
   * Wait for one operation as one caller. An abort detaches this caller and
   * cancels the underlying work only when it was the last waiter: another
   * caller that still owns the operation is never cancelled by this caller's
   * decision.
   */
  private attach(pending: PendingConnect, signal?: AbortSignal): Promise<SshConnectResult> {
    return new Promise<SshConnectResult>((resolve, reject) => {
      let settled = false;
      const detach = (): boolean => {
        if (settled) return true;
        settled = true;
        pending.waiters -= 1;
        signal?.removeEventListener("abort", onAbort);
        return false;
      };
      const onAbort = () => {
        if (detach()) return;
        if (pending.waiters === 0) {
          this.cancelPending(pending, sshOperationAbortError(signal?.reason));
        }
        reject(sshOperationAbortError(signal?.reason));
      };
      pending.waiters += 1;
      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener("abort", onAbort, { once: true });
      pending.promise.then(
        (result) => {
          if (!detach()) resolve(result);
        },
        (error) => {
          if (!detach()) reject(error);
        },
      );
    });
  }

  private cancelPending(pending: PendingConnect, reason: Error): void {
    if (pending.cancelled) return;
    pending.cancelled = true;
    pending.controller.abort(reason);
  }

  private throwIfCancelled(pending: PendingConnect): void {
    if (pending.cancelled || this.disposed) {
      throw sshOperationAbortError(pending.controller.signal.reason);
    }
  }

  private async connectInternal(
    input: SshConnectPayload,
    pending: PendingConnect,
  ): Promise<SshConnectResult> {
    const connection = input.connection;
    const signal = pending.controller.signal;
    const knownHosts = pending.knownHosts;
    this.throwIfCancelled(pending);
    assertKnownHostsPolicy(connection, knownHosts);
    if (connection.identityFile && !existsSync(connection.identityFile)) {
      // The path is user-selected but stays out of surfaced errors.
      throw new Error("The selected SSH identity file does not exist on this device.");
    }

    const current = this.tunnels.get(connection.id);
    if (current && current.configKey === pending.configKey && current.child.exitCode === null) {
      try {
        // Reuse a live tunnel whenever the endpoint answers as this
        // protocol's helper. A runtime-hash or app-version difference is
        // never permission to replace a shared remote owner; explicit
        // upgrades are owner-authorized operations handled by the bootstrap.
        await waitForRemoteEndpoint(
          this.fetchImpl,
          current.endpoint,
          SSH_EXISTING_TUNNEL_READY_TIMEOUT_MS,
          {
            signal,
          },
        );
      } catch (error) {
        if (signal.aborted) throw sshOperationAbortError(signal.reason);
        if (isSshOperationAbortError(error)) throw error;
        await this.stopTunnelEntry(connection.id, current);
      }
      this.throwIfCancelled(pending);
      if (this.tunnels.get(connection.id) === current) {
        const pairingCredential = input.issuePairingCredential
          ? await this.issuePairingCredential(connection, current.runtimeHash, signal, knownHosts)
          : undefined;
        this.throwIfCancelled(pending);
        return {
          connectionId: connection.id,
          endpoint: current.endpoint,
          remotePort: current.remotePort,
          ...(pairingCredential ? { pairingCredential } : {}),
        };
      }
    }
    if (this.tunnels.has(connection.id)) {
      const stale = this.tunnels.get(connection.id)!;
      await this.stopTunnelEntry(connection.id, stale);
    }
    this.throwIfCancelled(pending);

    const bundle = await this.ensureBundle(signal);
    this.throwIfCancelled(pending);
    const launch = await bootstrapRemoteRuntime(
      this.remoteTransport(connection, bundle, signal, knownHosts),
      connection.id,
      bundle.hash,
    );
    const remotePort = launch.remotePort;
    this.throwIfCancelled(pending);

    const localPort = await reserveLoopbackPort();
    const endpoint = `http://127.0.0.1:${localPort}/`;
    // Pairing is an independent ssh exec (1-3s of remote node bootstrap); run
    // it alongside the tunnel instead of serializing the two.
    const [pairingSettled, tunnelSettled] = await Promise.allSettled([
      input.issuePairingCredential
        ? this.issuePairingCredential(connection, launch.ownerRuntimeHash, signal, knownHosts)
        : Promise.resolve(undefined),
      this.openTunnel(connection, localPort, remotePort, endpoint, signal, knownHosts),
    ]);
    if (pairingSettled.status === "rejected") {
      if (tunnelSettled.status === "fulfilled") await this.stopTunnelChild(tunnelSettled.value);
      throw pairingSettled.reason;
    }
    if (tunnelSettled.status === "rejected") throw tunnelSettled.reason;
    const pairingCredential = pairingSettled.value;
    const child = tunnelSettled.value;
    // No late registration: a cancelled or superseded operation (disconnect,
    // dispose, config change) must not publish its tunnel.
    if (pending.cancelled || this.disposed || this.connecting.get(connection.id) !== pending) {
      await this.stopTunnelChild(child);
      throw sshOperationAbortError(pending.controller.signal.reason);
    }
    this.registerTunnel(
      pending,
      connection,
      endpoint,
      localPort,
      remotePort,
      launch.ownerRuntimeHash,
      child,
    );

    return {
      connectionId: connection.id,
      endpoint,
      remotePort,
      ...(pairingCredential ? { pairingCredential } : {}),
    };
  }

  /**
   * Explicit owner-authorized replacement: ensure the host's content-addressed
   * runtime is installed (never a client-supplied URL/hash), drain and join the
   * verified old owner through the C2 upgrade script, then start the new owner
   * into the same data root and open a fresh tunnel. Identity re-verification
   * belongs to the caller before any child credential is handed out.
   */
  private async upgradeInternal(
    input: SshConnectPayload,
    pending: PendingConnect,
  ): Promise<SshConnectResult> {
    const connection = input.connection;
    const signal = pending.controller.signal;
    const knownHosts = pending.knownHosts;
    this.throwIfCancelled(pending);
    assertKnownHostsPolicy(connection, knownHosts);
    if (connection.identityFile && !existsSync(connection.identityFile)) {
      throw new Error("The selected SSH identity file does not exist on this device.");
    }
    // Stop-then-start: no local tunnel may outlive the owner it points at.
    const current = this.tunnels.get(connection.id);
    if (current) await this.stopTunnelEntry(connection.id, current);
    this.throwIfCancelled(pending);

    const bundle = await this.ensureBundle(signal);
    this.throwIfCancelled(pending);
    const transport = this.remoteTransport(connection, bundle, signal, knownHosts);
    await ensureRemoteRuntimeInstalled(transport, bundle.hash, {
      lockWaitMs: SSH_INSTALL_LOCK_WAIT_MS,
    });
    this.throwIfCancelled(pending);
    const launched = await upgradeRemoteRuntime(transport, connection.id, bundle.hash, {
      lockWaitMs: SSH_BOOTSTRAP_LOCK_WAIT_MS,
    });
    this.throwIfCancelled(pending);

    const localPort = await reserveLoopbackPort();
    const endpoint = `http://127.0.0.1:${localPort}/`;
    const child = await this.openTunnel(
      connection,
      localPort,
      launched.remotePort,
      endpoint,
      signal,
      knownHosts,
    );
    if (pending.cancelled || this.disposed || this.connecting.get(connection.id) !== pending) {
      await this.stopTunnelChild(child);
      throw sshOperationAbortError(pending.controller.signal.reason);
    }
    this.registerTunnel(
      pending,
      connection,
      endpoint,
      localPort,
      launched.remotePort,
      launched.ownerRuntimeHash,
      child,
    );
    return { connectionId: connection.id, endpoint, remotePort: launched.remotePort };
  }

  private registerTunnel(
    pending: PendingConnect,
    connection: SshConnectionConfig,
    endpoint: string,
    localPort: number,
    remotePort: number,
    runtimeHash: string,
    child: ChildProcessWithoutNullStreams,
  ): void {
    const entry: TunnelEntry = {
      configKey: pending.configKey,
      connection,
      endpoint,
      localPort,
      remotePort,
      runtimeHash,
      generation: pending.generation,
      child,
    };
    this.tunnels.set(connection.id, entry);
    child.once("exit", () => {
      // Only the currently registered tunnel reports an exit; an intentionally
      // stopped or superseded entry is custody, not a target invalidation.
      if (this.tunnels.get(connection.id) !== entry) return;
      this.tunnels.delete(connection.id);
      this.notifyTunnelExit(connection.id);
    });
  }

  private remoteTransport(
    connection: SshConnectionConfig,
    bundle: SshRuntimeBundle | SshRuntimeBundleAsyncResult,
    signal: AbortSignal,
    knownHosts?: SshKnownHostsPolicy,
  ): RemoteRuntimeTransport {
    return {
      runScript: this.scriptRunner(connection, signal, knownHosts),
      deliverArchive: async (remotePath) => {
        await this.commands.run(
          this.options.scpCommand ?? (process.platform === "win32" ? "scp.exe" : "scp"),
          buildScpArgs(
            connection,
            bundle.archivePath,
            remotePath,
            this.options.sshConfigFile,
            knownHosts,
          ),
          { timeoutMs: SSH_INSTALL_TIMEOUT_MS, signal },
        );
      },
    };
  }

  private ensureBundle(
    signal: AbortSignal,
  ): Promise<SshRuntimeBundle | SshRuntimeBundleAsyncResult> {
    if (this.options.bundleProvider) return this.options.bundleProvider(signal);
    return ensureSshRuntimeBundleAsync({
      mainBundleDir: this.options.mainBundleDir,
      agentPluginsDir: this.options.agentPluginsDir,
      wslHelpersDir: this.options.wslHelpersDir,
      ...(this.options.bundledSkillsDir ? { bundledSkillsDir: this.options.bundledSkillsDir } : {}),
      ...(this.options.bundledPluginsDir
        ? { bundledPluginsDir: this.options.bundledPluginsDir }
        : {}),
      cacheDir: this.options.cacheDir,
      ...(this.options.tarCommand ? { tarCommand: this.options.tarCommand } : {}),
      ...(this.options.preassembledArchiveDir
        ? { preassembledArchiveDir: this.options.preassembledArchiveDir }
        : {}),
      signal,
    });
  }

  private scriptRunner(
    connection: SshConnectionConfig,
    signal: AbortSignal,
    knownHosts?: SshKnownHostsPolicy,
  ): RemoteScriptRunner {
    return async (script, args, timeoutMs) => {
      const result = await this.commands.run(
        this.options.sshCommand ?? (process.platform === "win32" ? "ssh.exe" : "ssh"),
        [
          ...buildSshBaseArgs(connection, this.options.sshConfigFile, knownHosts),
          connection.target,
          "sh",
          "-s",
          "--",
          ...args,
        ],
        { stdin: script, timeoutMs, signal },
      );
      return result.stdout;
    };
  }

  private issuePairingCredential(
    connection: SshConnectionConfig,
    runtimeHash: string,
    signal: AbortSignal,
    knownHosts?: SshKnownHostsPolicy,
  ): Promise<string> {
    return issueRemotePairingCredential(
      this.scriptRunner(connection, signal, knownHosts),
      connection.id,
      runtimeHash,
    );
  }

  private async openTunnel(
    connection: SshConnectionConfig,
    localPort: number,
    remotePort: number,
    endpoint: string,
    signal?: AbortSignal,
    knownHosts?: SshKnownHostsPolicy,
  ): Promise<ChildProcessWithoutNullStreams> {
    const sshCommand =
      this.options.sshCommand ?? (process.platform === "win32" ? "ssh.exe" : "ssh");
    const args = [
      ...buildSshBaseArgs(connection, this.options.sshConfigFile, knownHosts),
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
    signal?.throwIfAborted();
    const child = spawn(sshCommand, args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.tunnelChildren.add(child);
    // A tunnel that exits immediately (ExitOnForwardFailure, refused
    // connection) can close stdin before the end() flushes. The exited
    // promise below owns every tunnel failure mode, so stdin stream errors
    // here never change the outcome — swallowing them only prevents an
    // unhandled 'error' from taking down the process.
    child.stdin.on("error", () => undefined);
    child.stdin.end();
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = appendBoundedOutput(stderr, chunk, SSH_COMMAND_MAX_OUTPUT_BYTES);
    });
    child.once("exit", () => {
      this.tunnelChildren.delete(child);
    });

    const exited = new Promise<never>((_resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => {
        reject(new Error(stderr.trim() || `SSH tunnel exited with code ${code ?? "unknown"}.`));
      });
    });
    void exited.catch(() => undefined);
    try {
      // The readiness poll owns its own cancellation: an aborted operation
      // cancels the in-flight request and the pause, so the race below settles
      // without a detached poll or timer.
      const ready = waitForRemoteEndpoint(this.fetchImpl, endpoint, undefined, {
        ...(signal === undefined ? {} : { signal }),
      });
      void ready.catch(() => undefined);
      await Promise.race([ready, exited]);
      signal?.throwIfAborted();
      return child;
    } catch (error) {
      await joinChildProcess(child);
      if (signal?.aborted) throw sshOperationAbortError(signal.reason);
      throw error;
    } finally {
      this.tunnelChildren.delete(child);
    }
  }

  private async stopTunnelEntry(connectionId: string, entry: TunnelEntry): Promise<void> {
    if (this.tunnels.get(connectionId) === entry) this.tunnels.delete(connectionId);
    await this.stopTunnelChild(entry.child);
  }

  private async stopTunnelChild(child: ChildProcessWithoutNullStreams): Promise<void> {
    if (child.exitCode !== null || child.signalCode != null) return;
    await joinChildProcess(child);
  }
}
