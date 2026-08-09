import { randomUUID } from "node:crypto";
import { resolve as resolvePosixPath } from "node:path/posix";
import { resolve as resolveWindowsPath } from "node:path/win32";
import type { ProjectLocation, ResolvedMcpServer } from "@/shared/contracts";
import { resolveWslHomeDirectoryAsync, type AgentEnvContext } from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { buildOpenCodeServerCommand } from "./argv";
import { buildOpenCodeMcp } from "../userMcp";
import { classifyOpenCodeError, isOpenCodeConnectionLoss } from "./opencodeErrors";
import { installOpenCodePlugin } from "./plugin/install";
import type { LegacyOpenCodeClient } from "./legacySdk";
import {
  disposeSpawnedOpenCodeServerHandles,
  spawnOpenCodeServer,
  type OpenCodeServerHandle,
} from "./sdkServer";

/** Agent-side cwd that the SDK passes through to the server's session config. */
export function resolveOpenCodeSessionDirectory(location: ProjectLocation): string {
  switch (location.kind) {
    case "windows":
      return resolveWindowsPath(location.path);
    case "wsl":
      return resolvePosixPath(location.linuxPath);
    case "posix":
      return resolvePosixPath(location.path);
  }
}

function poolKey(location: ProjectLocation): string {
  switch (location.kind) {
    case "windows":
      return "windows";
    case "wsl":
      return `wsl:${location.distro}`;
    case "posix":
      return "posix";
  }
}

export interface AcquiredOpenCodeServer {
  /** Directory-scoped legacy SDK client for this acquisition's project. */
  client: LegacyOpenCodeClient;
  /** Shared directoryless legacy SDK client for the runtime-wide global event stream. */
  eventClient: LegacyOpenCodeClient;
  baseUrl: string;
  handle: OpenCodeServerHandle;
  onServerExit?(callback: () => void): () => void;
  updateMcpServers(servers: readonly ResolvedMcpServer[]): Promise<void>;
  dispose(options?: { closeServerIfIdle?: boolean }): Promise<void>;
}

interface ServerSnapshot {
  eventClient: LegacyOpenCodeClient;
  baseUrl: string;
  handle: OpenCodeServerHandle;
  authorization: string;
}

interface DirectoryMcpState {
  managedMcpServers?: ReturnType<typeof buildOpenCodeMcp>;
  managedMcpFingerprint?: string;
  sync: Promise<void>;
}

interface PoolEntry {
  ready: Promise<ServerSnapshot>;
  /** Dynamic MCP state is isolated by OpenCode directory instance. */
  directoryMcp: Map<string, DirectoryMcpState>;
  leases: number;
  idleTimer: ReturnType<typeof setTimeout> | undefined;
}

async function installSharedServerPlugin(projectLocation: ProjectLocation): Promise<void> {
  try {
    const baseDir = process.env.PORACODE_DATA_DIR?.trim();
    const ctx: AgentEnvContext =
      projectLocation.kind === "wsl"
        ? {
            envKind: "wsl",
            wslDistro: projectLocation.distro,
            ...(baseDir ? { baseDir } : {}),
          }
        : { envKind: projectLocation.kind, ...(baseDir ? { baseDir } : {}) };
    if (projectLocation.kind === "wsl") {
      await resolveWslHomeDirectoryAsync(projectLocation.distro);
    }
    const result = installOpenCodePlugin(ctx);
    if (!result.ok) {
      console.warn(`[opencode] failed to install shared-server plugin: ${result.reason}`);
    }
  } catch (error) {
    console.warn("[opencode] failed to install shared-server plugin:", error);
  }
}

// One shared server per active execution runtime: one native process for the
// host platform, plus one process per WSL distro. OpenCode routes each SDK
// request to a lazily-created directory instance via x-opencode-directory,
// matching the official Desktop app's shared-server compatibility path.
const pool = new Map<string, PoolEntry>();
const IDLE_SHUTDOWN_MS = 30_000;

function clearIdleShutdown(entry: PoolEntry): void {
  if (entry.idleTimer === undefined) return;
  clearTimeout(entry.idleTimer);
  entry.idleTimer = undefined;
}

async function closeServerIfIdle(key: string, entry: PoolEntry): Promise<void> {
  if (entry.leases > 0 || pool.get(key) !== entry) return;
  clearIdleShutdown(entry);
  pool.delete(key);
  const snapshot = await entry.ready;
  await snapshot.handle.dispose();
}

function scheduleIdleShutdown(key: string, entry: PoolEntry): void {
  if (entry.leases > 0 || pool.get(key) !== entry) return;
  clearIdleShutdown(entry);
  entry.idleTimer = setTimeout(() => {
    entry.idleTimer = undefined;
    void closeServerIfIdle(key, entry).catch((error) =>
      console.warn("[opencode] failed to dispose idle server:", error),
    );
  }, IDLE_SHUTDOWN_MS);
  entry.idleTimer.unref();
}

// Total budget for confirming the server is reachable once it has announced
// its URL, and the per-attempt fetch timeout inside that budget.
const REACHABLE_TIMEOUT_MS = 10_000;
const REACHABLE_ATTEMPT_TIMEOUT_MS = 1_000;

/**
 * Confirm the freshly-spawned server actually answers over HTTP before handing
 * the client back. The server announces its URL the instant it binds, but for
 * WSL projects it binds `127.0.0.1:<ephemeral>` *inside* the distro and WSL's
 * localhost relay needs a moment to register the newly-bound port. Issuing
 * `session.create` the instant the "listening" line appears can beat the relay
 * and surface as `socket hang up`. (The long-lived fs/git bridge never hits
 * this because it is spawned once at startup, well before its first request.)
 * Callers gate this to WSL projects; native loopback servers are reachable the
 * instant they announce their URL.
 *
 * We poll the root route — any HTTP response, including a 404, proves the
 * round-trip works — backing off until it answers or the budget expires.
 */
async function waitForOpenCodeReachable(baseUrl: string, authorization: string): Promise<void> {
  const deadline = Date.now() + REACHABLE_TIMEOUT_MS;
  let backoffMs = 50;
  for (;;) {
    try {
      await fetch(baseUrl, {
        method: "GET",
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(REACHABLE_ATTEMPT_TIMEOUT_MS),
      });
      return;
    } catch (err) {
      if (Date.now() >= deadline) {
        throw new Error(
          classifyOpenCodeError({
            cause: err,
            serverUrl: baseUrl,
            operation: "connect opencode server",
          }),
          { cause: err },
        );
      }
    }
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
    backoffMs = Math.min(backoffMs * 2, 500);
  }
}

async function createLegacySdkClient(
  baseUrl: string,
  authorization: string,
  directory?: string,
): Promise<LegacyOpenCodeClient> {
  const { createOpencodeClient } = await import("@opencode-ai/sdk/v2/client");
  return createOpencodeClient({
    baseUrl,
    headers: { Authorization: authorization },
    throwOnError: true,
    ...(directory !== undefined ? { directory } : {}),
  });
}

async function spawnAndWire(projectLocation: ProjectLocation): Promise<ServerSnapshot> {
  // The shared process must load the Poracode plugin before it starts. Besides
  // lifecycle hooks for terminal launches, the plugin injects the trusted
  // provider session id used to route Crossagents calls from pooled GUI
  // sessions. Installing after `opencode serve` starts is too late because its
  // plugin set is fixed for the lifetime of the shared process.
  await installSharedServerPlugin(projectLocation);
  const resolvedExecPath = resolveAgentBinaryPath(projectLocation, "opencode");
  const username = "opencode";
  const password = randomUUID();
  const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  const command = buildOpenCodeServerCommand(projectLocation, resolvedExecPath, {
    OPENCODE_SERVER_USERNAME: username,
    OPENCODE_SERVER_PASSWORD: password,
    PORACODE_OPENCODE_SESSION_ROUTING: "1",
  });
  const handle = spawnOpenCodeServer(command);

  try {
    const baseUrl = await handle.baseUrl;
    if (projectLocation.kind === "wsl") {
      await waitForOpenCodeReachable(baseUrl, authorization);
    }

    const eventClient = await createLegacySdkClient(baseUrl, authorization);
    return { eventClient, baseUrl, handle, authorization };
  } catch (err) {
    await handle.dispose();
    throw err;
  }
}

/**
 * Spawn (or reuse) an authenticated `opencode serve` for the given execution
 * runtime, wait for the ready URL, and return a project-directory SDK client.
 *
 * Each acquisition leases the shared sidecar. The last release leaves it warm
 * briefly for follow-up requests, then tears it down after the idle grace.
 */
export interface AcquireOpenCodeServerInput {
  projectLocation: ProjectLocation;
  mcpServers?: readonly ResolvedMcpServer[];
}

async function addMcpServers(
  directory: string,
  servers: ReturnType<typeof buildOpenCodeMcp>,
  client: LegacyOpenCodeClient,
): Promise<void> {
  await Promise.all(
    Object.entries(servers).map(([name, config]) => client.mcp.add({ directory, name, config })),
  );
}

async function syncDirectoryMcpServers(
  entry: PoolEntry,
  directory: string,
  servers: ReturnType<typeof buildOpenCodeMcp>,
  client: LegacyOpenCodeClient,
): Promise<void> {
  const existing = entry.directoryMcp.get(directory);
  const state = existing ?? { sync: Promise.resolve() };
  if (!existing) entry.directoryMcp.set(directory, state);

  const nextFingerprint = JSON.stringify(
    Object.entries(servers).sort(([left], [right]) => left.localeCompare(right)),
  );
  const nextNames = new Set(Object.keys(servers));
  const operation = state.sync.then(async () => {
    if (state.managedMcpFingerprint === nextFingerprint) return;

    let serversToAdd = servers;
    if (state.managedMcpFingerprint !== undefined) {
      const previousServers = state.managedMcpServers ?? {};
      const removedNames = Object.keys(previousServers).filter((name) => !nextNames.has(name));
      if (removedNames.length > 0) {
        await Promise.all(
          removedNames.map((name) =>
            client.mcp.disconnect({ directory, name }).catch((error) => {
              if (isOpenCodeConnectionLoss(error)) throw error;
            }),
          ),
        );

        // The legacy SDK surface has no dynamic mcp.remove endpoint. Dispose only this
        // directory instance to clear removed runtime config, then rebuild
        // the current set. Other project instances and the server stay live.
        await client.instance.dispose({ directory });
      } else {
        serversToAdd = Object.fromEntries(
          Object.entries(servers).filter(
            ([name, config]) => JSON.stringify(previousServers[name]) !== JSON.stringify(config),
          ),
        );
      }
    }

    await addMcpServers(directory, serversToAdd, client);
    state.managedMcpServers = servers;
    state.managedMcpFingerprint = nextFingerprint;
  });

  // Serialize concurrent settings reloads for this directory without leaving
  // a rejected promise that would poison later retries.
  state.sync = operation.catch(() => undefined);
  await operation;
}

export async function acquireOpenCodeServer(
  input: AcquireOpenCodeServerInput,
): Promise<AcquiredOpenCodeServer> {
  return acquireOpenCodeServerInner(input, true);
}

async function acquireOpenCodeServerInner(
  input: AcquireOpenCodeServerInput,
  retryMcpConnectionLoss: boolean,
): Promise<AcquiredOpenCodeServer> {
  const key = poolKey(input.projectLocation);
  let entry = pool.get(key);

  if (!entry) {
    const ready = spawnAndWire(input.projectLocation);
    const createdEntry: PoolEntry = {
      ready,
      directoryMcp: new Map(),
      leases: 0,
      idleTimer: undefined,
    };
    entry = createdEntry;
    pool.set(key, entry);

    // If spawn fails, evict so the next acquire respawns instead of resolving
    // a poisoned promise forever.
    ready.catch(() => {
      if (pool.get(key) === createdEntry) pool.delete(key);
    });

    // If the server crashes after wiring, evict so subsequent acquires get a
    // fresh process. Live acquirers will see I/O errors on next request and
    // surface them through the SDK.
    void ready.then(
      (snapshot) => {
        snapshot.handle.child.once("exit", () => {
          clearIdleShutdown(createdEntry);
          if (pool.get(key) === createdEntry) pool.delete(key);
        });
      },
      () => undefined,
    );
  }

  const acquiringEntry = entry;
  clearIdleShutdown(acquiringEntry);
  acquiringEntry.leases += 1;
  let released = false;
  const releaseLease = (scheduleIdle = true): boolean => {
    if (released) return false;
    released = true;
    acquiringEntry.leases -= 1;
    if (scheduleIdle) scheduleIdleShutdown(key, acquiringEntry);
    return true;
  };

  let snapshot: ServerSnapshot;
  try {
    snapshot = await acquiringEntry.ready;
  } catch (error) {
    releaseLease(false);
    throw error;
  }

  const directory = resolveOpenCodeSessionDirectory(input.projectLocation);
  let client: LegacyOpenCodeClient;
  try {
    client = await createLegacySdkClient(snapshot.baseUrl, snapshot.authorization, directory);
    // Omitted MCP config means this caller (notably one-shot generation) does
    // not own provider settings and must leave the directory instance alone.
    // An explicit empty array is the settings-level request to clear the set.
    if (input.mcpServers !== undefined) {
      const nextMcp = buildOpenCodeMcp(input.mcpServers);
      await syncDirectoryMcpServers(acquiringEntry, directory, nextMcp, client);
    }
  } catch (error) {
    if (!retryMcpConnectionLoss || !isOpenCodeConnectionLoss(error)) {
      releaseLease();
      throw error;
    }
    releaseLease(false);
    clearIdleShutdown(acquiringEntry);
    if (pool.get(key) === acquiringEntry) pool.delete(key);
    await snapshot.handle.dispose().catch((disposeErr) => {
      console.warn("[opencode] failed to dispose handle during retry:", disposeErr);
    });
    return acquireOpenCodeServerInner(input, false);
  }

  return {
    client,
    eventClient: snapshot.eventClient,
    baseUrl: snapshot.baseUrl,
    handle: snapshot.handle,
    onServerExit: (callback) => {
      if (snapshot.handle.child.exitCode !== null) {
        queueMicrotask(callback);
        return () => {};
      }
      snapshot.handle.child.once("exit", callback);
      return () => snapshot.handle.child.off("exit", callback);
    },
    updateMcpServers: async (servers) => {
      await syncDirectoryMcpServers(acquiringEntry, directory, buildOpenCodeMcp(servers), client);
    },
    dispose: async (options) => {
      const closeImmediately = options?.closeServerIfIdle === true;
      if (!releaseLease(!closeImmediately) || !closeImmediately) return;
      await closeServerIfIdle(key, acquiringEntry);
    },
  };
}

/**
 * Supervisor shutdown helper. Releases pool bookkeeping, then terminates
 * only Poracode-spawned `opencode serve` processes still tracked in
 * {@link disposeSpawnedOpenCodeServerHandles}. Does not touch unrelated
 * `opencode.exe` processes the user started outside the app.
 */
export function shutdownSpawnedOpenCodeServers(): void {
  for (const entry of pool.values()) clearIdleShutdown(entry);
  pool.clear();
  disposeSpawnedOpenCodeServerHandles();
}
