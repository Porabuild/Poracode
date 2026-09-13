import { resolve as resolvePosixPath } from "node:path/posix";
import { resolve as resolveWindowsPath } from "node:path/win32";
import type { ProjectLocation, ResolvedMcpServer } from "@/shared/contracts";
import { resolveOpenCode2Binary } from "./binary";
import { buildOpenCode2ServerCommand } from "./argv";
import type { OpenCode2Client } from "./clientTypes";
import { buildOpenCode2McpServers, type OpenCode2McpServerConfig } from "./mcp";
import { classifyOpenCode2Error, isOpenCode2ConnectionLoss } from "./opencode2Errors";
import {
  disposeSpawnedOpenCode2ServerHandles,
  spawnOpenCode2Server,
  type OpenCode2ServerHandle,
} from "./server";

/** Directory the V2 client scopes catalog/MCP requests to for a project. */
export function resolveOpenCode2SessionDirectory(location: ProjectLocation): string {
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
  return location.kind === "wsl" ? `wsl:${location.distro}` : location.kind;
}

export interface AcquiredOpenCode2Server {
  /** Directory-scoped OpenCode 2 HTTP client for this acquisition's project. */
  client: OpenCode2Client;
  baseUrl: string;
  handle: OpenCode2ServerHandle;
  onServerExit?(callback: () => void): () => void;
  updateMcpServers(servers: readonly ResolvedMcpServer[]): Promise<void>;
  dispose(options?: { closeServerIfIdle?: boolean }): Promise<void>;
}

interface ServerSnapshot {
  client: OpenCode2Client;
  baseUrl: string;
  handle: OpenCode2ServerHandle;
  authorization: string;
}

interface LocationMcpState {
  managedMcpServers?: Record<string, OpenCode2McpServerConfig>;
  managedMcpFingerprint?: string;
  sync: Promise<void>;
}

interface PoolEntry {
  ready: Promise<ServerSnapshot>;
  /** Dynamic MCP state is isolated by OpenCode location directory. */
  locationMcp: Map<string, LocationMcpState>;
  leases: number;
  idleTimer: ReturnType<typeof setTimeout> | undefined;
}

export function buildOpenCode2Authorization(password: string): string {
  return `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`;
}

async function createOpenCode2Client(
  baseUrl: string,
  authorization: string,
): Promise<OpenCode2Client> {
  // @opencode/client is ESM-only; the CJS supervisor loads it through a
  // dynamic import. Named exports are top-level — no `.default` unwrap.
  const { OpenCode } = await import("@opencode/client");
  return OpenCode.make({
    baseUrl,
    headers: { Authorization: authorization },
  });
}

// One shared server per active execution runtime: one native process for the
// host platform, plus one process per WSL distro. The V2 client scopes every
// catalog/MCP request to a location directory, matching how the official
// Desktop app reuses one background service across projects.
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
      console.warn("[opencode2] failed to dispose idle server:", error),
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
 * localhost relay needs a moment to register the newly-bound port. Issuing a
 * request the instant the "listening" line appears can beat the relay and
 * surface as `socket hang up`. Callers gate this to WSL projects; native
 * loopback servers are reachable the instant they announce their URL.
 *
 * We poll the root route — any HTTP response, including a 401 (the server
 * generates its own password, so 401 is the expected answer for a bare GET) —
 * backing off until it answers or the budget expires.
 */
async function waitForOpenCode2Reachable(baseUrl: string, authorization: string): Promise<void> {
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
          classifyOpenCode2Error({
            cause: err,
            serverUrl: baseUrl,
            operation: "connect opencode2 server",
          }),
          { cause: err },
        );
      }
    }
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
    backoffMs = Math.min(backoffMs * 2, 500);
  }
}

async function spawnAndWire(projectLocation: ProjectLocation): Promise<ServerSnapshot> {
  const resolvedExecPath = await resolveOpenCode2Binary(projectLocation);
  if (!resolvedExecPath)
    throw new Error("OpenCode 2 is not installed or its executable is unavailable.");
  const command = buildOpenCode2ServerCommand(projectLocation, resolvedExecPath, {});
  const handle = spawnOpenCode2Server(command);

  try {
    const [baseUrl, password] = await Promise.all([handle.baseUrl, handle.password]);
    const authorization = buildOpenCode2Authorization(password);
    if (projectLocation.kind === "wsl") {
      await waitForOpenCode2Reachable(baseUrl, authorization);
    }

    const client = await createOpenCode2Client(baseUrl, authorization);
    return { client, baseUrl, handle, authorization };
  } catch (err) {
    await handle.dispose();
    throw err;
  }
}

/**
 * Spawn (or reuse) an authenticated `opencode2 serve` for the given execution
 * runtime, wait for its URL and generated password, and return a
 * location-scoped HTTP client.
 *
 * Each acquisition leases the shared sidecar. The last release leaves it warm
 * briefly for follow-up requests, then tears it down after the idle grace.
 */
export interface AcquireOpenCode2ServerInput {
  projectLocation: ProjectLocation;
  mcpServers?: readonly ResolvedMcpServer[];
}

async function addMcpServers(
  directory: string,
  servers: Record<string, OpenCode2McpServerConfig>,
  client: OpenCode2Client,
): Promise<void> {
  await settleMcpOperations(
    Object.entries(servers).map(([server, config]) =>
      client.mcp.add({ server, location: { directory }, config }),
    ),
  );
}

async function removeMcpServers(
  directory: string,
  names: readonly string[],
  client: OpenCode2Client,
): Promise<void> {
  // Let revocation failures propagate: the caller must not advance the managed
  // fingerprint while a removed server may still be active.
  await settleMcpOperations(
    names.map((server) => client.mcp.remove({ server, location: { directory } })),
  );
}

async function settleMcpOperations(operations: Promise<unknown>[]): Promise<void> {
  const results = await Promise.allSettled(operations);
  const failed = results.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
}

async function syncLocationMcpServers(
  entry: PoolEntry,
  directory: string,
  servers: Record<string, OpenCode2McpServerConfig>,
  client: OpenCode2Client,
): Promise<void> {
  const existing = entry.locationMcp.get(directory);
  const state = existing ?? { sync: Promise.resolve() };
  if (!existing) entry.locationMcp.set(directory, state);

  const nextFingerprint = JSON.stringify(
    Object.entries(servers).sort(([left], [right]) => left.localeCompare(right)),
  );
  const nextNames = new Set(Object.keys(servers));
  const operation = state.sync.then(async () => {
    if (state.managedMcpFingerprint === nextFingerprint) return;

    const previousServers = state.managedMcpServers ?? {};
    const previouslySynced = state.managedMcpFingerprint !== undefined;
    delete state.managedMcpFingerprint;
    let serversToAdd = servers;
    const removedNames = Object.keys(previousServers).filter((name) => !nextNames.has(name));
    // V2 has a first-class mcp.remove endpoint, so removed runtime config is
    // deleted directly and the location instance stays live.
    await removeMcpServers(directory, removedNames, client);
    if (previouslySynced)
      serversToAdd = Object.fromEntries(
        Object.entries(servers).filter(
          ([name, config]) => JSON.stringify(previousServers[name]) !== JSON.stringify(config),
        ),
      );

    // A failed batch can still install some servers. Retain every attempted
    // name so the next update can revoke it, and retry configs after failure.
    state.managedMcpServers = { ...previousServers, ...servers };
    await addMcpServers(directory, serversToAdd, client);
    state.managedMcpServers = servers;
    state.managedMcpFingerprint = nextFingerprint;
  });

  // Serialize concurrent settings reloads for this location without leaving
  // a rejected promise that would poison later retries.
  state.sync = operation.catch(() => undefined);
  await operation;
}

export async function acquireOpenCode2Server(
  input: AcquireOpenCode2ServerInput,
): Promise<AcquiredOpenCode2Server> {
  return acquireOpenCode2ServerInner(input, true);
}

async function acquireOpenCode2ServerInner(
  input: AcquireOpenCode2ServerInput,
  retryMcpConnectionLoss: boolean,
): Promise<AcquiredOpenCode2Server> {
  const key = poolKey(input.projectLocation);
  let entry = pool.get(key);

  if (!entry) {
    const ready = spawnAndWire(input.projectLocation);
    const createdEntry: PoolEntry = {
      ready,
      locationMcp: new Map(),
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
    // surface them through the client.
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

  const directory = resolveOpenCode2SessionDirectory(input.projectLocation);
  try {
    // Omitted MCP config means this caller does not own provider settings and
    // must leave the location's dynamic set alone. An explicit empty array is
    // the settings-level request to clear the set.
    if (input.mcpServers !== undefined) {
      const nextMcp = buildOpenCode2McpServers(input.mcpServers);
      await syncLocationMcpServers(acquiringEntry, directory, nextMcp, snapshot.client);
    }
  } catch (error) {
    if (!retryMcpConnectionLoss || !isOpenCode2ConnectionLoss(error)) {
      releaseLease();
      throw error;
    }
    releaseLease(false);
    clearIdleShutdown(acquiringEntry);
    if (pool.get(key) === acquiringEntry) pool.delete(key);
    await snapshot.handle.dispose().catch((disposeErr) => {
      console.warn("[opencode2] failed to dispose handle during retry:", disposeErr);
    });
    return acquireOpenCode2ServerInner(input, false);
  }

  return {
    client: snapshot.client,
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
      await syncLocationMcpServers(
        acquiringEntry,
        directory,
        buildOpenCode2McpServers(servers),
        snapshot.client,
      );
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
 * only Poracode-spawned `opencode2 serve` processes still tracked in
 * {@link disposeSpawnedOpenCode2ServerHandles}. Does not touch unrelated
 * `opencode2` processes the user started outside the app.
 */
export function shutdownSpawnedOpenCode2Servers(): void {
  for (const entry of pool.values()) clearIdleShutdown(entry);
  pool.clear();
  disposeSpawnedOpenCode2ServerHandles();
}
