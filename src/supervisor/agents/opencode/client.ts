import { resolve as resolvePosixPath } from "node:path/posix";
import { resolve as resolveWindowsPath } from "node:path/win32";
import type { ProjectLocation, ResolvedMcpServer } from "@/shared/contracts";
import { resolveOpenCodeBinary } from "./binary";
import { buildOpenCodeServerCommand } from "./argv";
import type { CredentialEntry, OpenCodeClient } from "./clientTypes";
import {
  clearOpenCodeCredentialCompatibility,
  revokeOpenCodeCredential,
  synchronizeOpenCodeCredentials,
} from "./credentialCompatibility";
import {
  cachedOpenCodeSessionDatabase,
  clearOpenCodeSessionDatabases,
  isOpenCodeSessionNotFound,
  OPENCODE_LEGACY_DATABASE_ENV,
  rememberOpenCodeSessionDatabase,
  type OpenCodeDatabase,
} from "./database";
import { buildOpenCodeMcpServers, type OpenCodeMcpServerConfig } from "./mcp";
import { classifyOpenCodeError, isOpenCodeConnectionLoss } from "./opencodeErrors";
import {
  disposeSpawnedOpenCodeServerHandles,
  spawnOpenCodeServer,
  type OpenCodeServerHandle,
} from "./server";

/** Directory the OpenCode client scopes catalog/MCP requests to for a project. */
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

function poolKey(location: ProjectLocation, database: OpenCodeDatabase): string {
  const runtime = location.kind === "wsl" ? `wsl:${location.distro}` : location.kind;
  return `${runtime}:${database}`;
}

function mcpFingerprint(servers: Record<string, OpenCodeMcpServerConfig>): string {
  return JSON.stringify(
    Object.entries(servers).sort(([left], [right]) => left.localeCompare(right)),
  );
}

export interface AcquiredOpenCodeServer {
  /** Directory-scoped OpenCode HTTP client for this acquisition's project. */
  client: OpenCodeClient;
  baseUrl: string;
  handle: OpenCodeServerHandle;
  database: OpenCodeDatabase;
  onServerExit?(callback: () => void): () => void;
  getDirectoryMcpNames(): string[];
  onDirectoryMcpChanged(callback: () => void): () => void;
  updateMcpServers(servers: readonly ResolvedMcpServer[]): Promise<void>;
  dispose(options?: { closeServerIfIdle?: boolean }): Promise<void>;
}

interface ServerSnapshot {
  client: OpenCodeClient;
  baseUrl: string;
  handle: OpenCodeServerHandle;
  authorization: string;
}

interface LocationMcpState {
  leases: Map<symbol, Record<string, OpenCodeMcpServerConfig>>;
  listeners: Set<() => void>;
  managedMcpServers?: Record<string, OpenCodeMcpServerConfig>;
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

export function buildOpenCodeAuthorization(password: string): string {
  return `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`;
}

async function createOpenCodeClient(
  baseUrl: string,
  authorization: string,
): Promise<OpenCodeClient> {
  // @opencode/client is ESM-only; the CJS supervisor loads it through a
  // dynamic import. Named exports are top-level — no `.default` unwrap.
  const { OpenCode } = await import("@opencode/client");
  return OpenCode.make({
    baseUrl,
    headers: { Authorization: authorization },
  });
}

// One shared server per active execution runtime: one native process for the
// host platform, plus one process per WSL distro. The client scopes every
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
 * localhost relay needs a moment to register the newly-bound port. Issuing a
 * request the instant the "listening" line appears can beat the relay and
 * surface as `socket hang up`. Callers gate this to WSL projects; native
 * loopback servers are reachable the instant they announce their URL.
 *
 * We poll the root route — any HTTP response, including a 401 (the server
 * generates its own password, so 401 is the expected answer for a bare GET) —
 * backing off until it answers or the budget expires.
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

async function spawnAndWire(
  projectLocation: ProjectLocation,
  database: OpenCodeDatabase,
): Promise<ServerSnapshot> {
  const resolvedExecPath = await resolveOpenCodeBinary(projectLocation);
  if (!resolvedExecPath)
    throw new Error("OpenCode is not installed or its executable is unavailable.");
  const command = buildOpenCodeServerCommand(
    projectLocation,
    resolvedExecPath,
    database === "legacy-isolated" ? OPENCODE_LEGACY_DATABASE_ENV : {},
  );
  const handle = spawnOpenCodeServer(command);

  try {
    const [baseUrl, password] = await Promise.all([handle.baseUrl, handle.password]);
    const authorization = buildOpenCodeAuthorization(password);
    if (projectLocation.kind === "wsl") {
      await waitForOpenCodeReachable(baseUrl, authorization);
    }

    const client = await createOpenCodeClient(baseUrl, authorization);
    return { client, baseUrl, handle, authorization };
  } catch (err) {
    await handle.dispose();
    throw err;
  }
}

/**
 * Spawn (or reuse) an authenticated `opencode serve` for the given execution
 * runtime, wait for its URL and generated password, and return a
 * location-scoped HTTP client.
 *
 * Each acquisition leases the shared sidecar. The last release leaves it warm
 * briefly for follow-up requests, then tears it down after the idle grace.
 */
export interface AcquireOpenCodeServerInput {
  projectLocation: ProjectLocation;
  mcpServers?: readonly ResolvedMcpServer[];
  /** Resume pre-upgrade sessions without copying or replacing their conversations. */
  resumeSessionId?: string;
  database?: OpenCodeDatabase;
}

const terminalRetirements = new Map<string, Promise<void>>();

function terminalRetirementKey(location: ProjectLocation, sessionID: string): string {
  // Database resolution and directory changes must not bypass a session's
  // previous interrupt. Native and legacy sessions share this fence.
  return JSON.stringify([poolKey(location, "native"), sessionID]);
}

/** Fence a successor before the old TUI's asynchronous interrupt can reach it. */
export function retireOpenCodeTerminalServer(
  location: ProjectLocation,
  sessionID: string | undefined,
  acquired: AcquiredOpenCodeServer,
): Promise<void> {
  const cleanup = async () => {
    try {
      if (sessionID) {
        await acquired.client.session.interrupt(
          { sessionID },
          { signal: AbortSignal.timeout(5_000) },
        );
      }
    } finally {
      await acquired.dispose({ closeServerIfIdle: true });
    }
  };
  if (!sessionID) return cleanup();
  const key = terminalRetirementKey(location, sessionID);
  const retirement = (terminalRetirements.get(key) ?? Promise.resolve()).then(cleanup);
  const settled = retirement.then(
    () => undefined,
    () => undefined,
  );
  terminalRetirements.set(key, settled);
  void settled.then(() => {
    if (terminalRetirements.get(key) === settled) terminalRetirements.delete(key);
  });
  return retirement;
}

async function addMcpServers(
  directory: string,
  servers: Record<string, OpenCodeMcpServerConfig>,
  client: OpenCodeClient,
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
  client: OpenCodeClient,
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

function getOrCreateLocationMcpState(entry: PoolEntry, directory: string): LocationMcpState {
  let state = entry.locationMcp.get(directory);
  if (!state) {
    state = {
      leases: new Map(),
      listeners: new Set(),
      sync: Promise.resolve(),
    };
    entry.locationMcp.set(directory, state);
  }
  return state;
}

function mergedLocationMcpServers(
  state: LocationMcpState,
): Record<string, OpenCodeMcpServerConfig> {
  const merged: Record<string, OpenCodeMcpServerConfig> = {};
  for (const leaseServers of state.leases.values()) {
    Object.assign(merged, leaseServers);
  }
  return merged;
}

function notifyLocationListeners(state: LocationMcpState): void {
  for (const listener of [...state.listeners]) {
    try {
      listener();
    } catch (error) {
      console.warn("[opencode] directory MCP listener failed:", error);
    }
  }
}

async function syncLocationMcpServers(
  entry: PoolEntry,
  directory: string,
  client: OpenCodeClient,
): Promise<void> {
  const state = getOrCreateLocationMcpState(entry, directory);

  const operation = state.sync.then(async () => {
    const servers = mergedLocationMcpServers(state);
    const nextFingerprint = mcpFingerprint(servers);
    if (state.managedMcpFingerprint === nextFingerprint) return;

    const nextNames = new Set(Object.keys(servers));
    const previousServers = state.managedMcpServers ?? {};
    const previouslySynced = state.managedMcpFingerprint !== undefined;
    delete state.managedMcpFingerprint;
    let serversToAdd = servers;
    const removedNames = Object.keys(previousServers).filter((name) => !nextNames.has(name));
    // OpenCode has a first-class mcp.remove endpoint, so removed runtime config is
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

  // Serialize concurrent MCP lease mutations for this location without leaving
  // a rejected promise that would poison later retries.
  state.sync = operation.catch(() => undefined);
  await operation;
}

export async function acquireOpenCodeServer(
  input: AcquireOpenCodeServerInput,
): Promise<AcquiredOpenCodeServer> {
  if (input.resumeSessionId) {
    const key = terminalRetirementKey(input.projectLocation, input.resumeSessionId);
    let retirement;
    while ((retirement = terminalRetirements.get(key))) await retirement;
  }
  const acquired = await acquireResolvedOpenCodeServer(input);
  try {
    await synchronizeOpenCodeCredentials(input.projectLocation, acquired, (database) =>
      acquireOpenCodeServerInner({ projectLocation: input.projectLocation, database }, true),
    );
    return acquired;
  } catch (error) {
    await acquired.dispose();
    throw error;
  }
}

export async function removeOpenCodeCredential(
  location: ProjectLocation,
  id: string,
): Promise<void> {
  await revokeOpenCodeCredential(location, id, (database) =>
    acquireOpenCodeServerInner({ projectLocation: location, database }, true),
  );
}

/** Legacy OAuth grants stay removable without duplicating their refresh tokens. */
export async function listOpenCodeLegacyOAuthCredentials(
  location: ProjectLocation,
): Promise<CredentialEntry[]> {
  const acquired = await acquireOpenCodeServerInner(
    { projectLocation: location, database: "legacy-isolated" },
    true,
  );
  try {
    return (await acquired.client.credential.list({ signal: AbortSignal.timeout(30_000) })).filter(
      (entry) => entry.value.type === "oauth",
    );
  } finally {
    await acquired.dispose();
  }
}

async function acquireResolvedOpenCodeServer(
  input: AcquireOpenCodeServerInput,
): Promise<AcquiredOpenCodeServer> {
  const sessionID = input.resumeSessionId;
  const known = sessionID
    ? cachedOpenCodeSessionDatabase(input.projectLocation, sessionID)
    : undefined;
  if (input.database || known || !sessionID)
    return acquireOpenCodeServerInner(
      { ...input, database: input.database ?? known ?? "native" },
      true,
    );

  const native = await acquireOpenCodeServerInner(input, true);
  try {
    await native.client.session.get({ sessionID });
    rememberOpenCodeSessionDatabase(input.projectLocation, sessionID, "native");
    return native;
  } catch (error) {
    await native.dispose();
    if (!isOpenCodeSessionNotFound(error, sessionID)) throw error;
  }

  const legacy = await acquireOpenCodeServerInner({ ...input, database: "legacy-isolated" }, true);
  try {
    await legacy.client.session.get({ sessionID });
    rememberOpenCodeSessionDatabase(input.projectLocation, sessionID, "legacy-isolated");
    return legacy;
  } catch (error) {
    await legacy.dispose({ closeServerIfIdle: true });
    throw error;
  }
}

async function acquireOpenCodeServerInner(
  input: AcquireOpenCodeServerInput,
  retryMcpConnectionLoss: boolean,
): Promise<AcquiredOpenCodeServer> {
  const database = input.database ?? "native";
  const key = poolKey(input.projectLocation, database);
  let entry = pool.get(key);

  if (!entry) {
    const ready = spawnAndWire(input.projectLocation, database);
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

  const directory = resolveOpenCodeSessionDirectory(input.projectLocation);
  const leaseToken = Symbol("opencode-mcp-lease");
  let hasLease = false;
  try {
    // Omitted MCP config means this caller does not own thread MCP leases and
    // must leave the location's dynamic set alone. An explicit array (including
    // empty) participates in the refcounted per-directory union.
    if (input.mcpServers !== undefined) {
      const nextMcp = buildOpenCodeMcpServers(input.mcpServers);
      const state = getOrCreateLocationMcpState(acquiringEntry, directory);
      state.leases.set(leaseToken, nextMcp);
      hasLease = true;
      notifyLocationListeners(state);
      await syncLocationMcpServers(acquiringEntry, directory, snapshot.client);
    }
  } catch (error) {
    if (hasLease) {
      hasLease = false;
      const state = acquiringEntry.locationMcp.get(directory);
      if (state?.leases.delete(leaseToken)) notifyLocationListeners(state);
    }
    if (!retryMcpConnectionLoss || !isOpenCodeConnectionLoss(error)) {
      if (acquiringEntry.leases > 1) {
        await syncLocationMcpServers(acquiringEntry, directory, snapshot.client).catch(
          () => undefined,
        );
      }
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

  let disposePromise: Promise<void> | undefined;
  return {
    client: snapshot.client,
    baseUrl: snapshot.baseUrl,
    handle: snapshot.handle,
    database,
    onServerExit: (callback) => {
      if (snapshot.handle.child.exitCode !== null) {
        queueMicrotask(callback);
        return () => {};
      }
      snapshot.handle.child.once("exit", callback);
      return () => snapshot.handle.child.off("exit", callback);
    },
    getDirectoryMcpNames: () => {
      const state = acquiringEntry.locationMcp.get(directory);
      if (!state) return [];
      const names = new Set<string>();
      for (const servers of state.leases.values()) {
        for (const name of Object.keys(servers)) names.add(name);
      }
      return [...names];
    },
    onDirectoryMcpChanged: (callback) => {
      const state = getOrCreateLocationMcpState(acquiringEntry, directory);
      state.listeners.add(callback);
      return () => {
        state.listeners.delete(callback);
      };
    },
    updateMcpServers: async (servers) => {
      const state = getOrCreateLocationMcpState(acquiringEntry, directory);
      state.leases.set(leaseToken, buildOpenCodeMcpServers(servers));
      hasLease = true;
      notifyLocationListeners(state);
      await syncLocationMcpServers(acquiringEntry, directory, snapshot.client);
    },
    dispose: (options) => {
      if (disposePromise) return disposePromise;
      disposePromise = (async () => {
        const closeImmediately = options?.closeServerIfIdle === true;
        if (hasLease) {
          hasLease = false;
          const state = acquiringEntry.locationMcp.get(directory);
          if (state?.leases.delete(leaseToken)) notifyLocationListeners(state);
          const willCloseImmediately = closeImmediately && acquiringEntry.leases <= 1;
          if (!willCloseImmediately) {
            try {
              await syncLocationMcpServers(acquiringEntry, directory, snapshot.client);
            } catch (error) {
              console.warn("[opencode] failed to clean up location MCP servers on dispose:", error);
            }
          }
        }
        if (!releaseLease(!closeImmediately) || !closeImmediately) return;
        await closeServerIfIdle(key, acquiringEntry);
      })();
      return disposePromise;
    },
  };
}

/**
 * Supervisor shutdown helper. Releases pool bookkeeping, then terminates
 * only Poracode-spawned `opencode serve` processes still tracked in
 * {@link disposeSpawnedOpenCodeServerHandles}. Does not touch unrelated
 * `opencode` processes the user started outside the app.
 */
export function shutdownSpawnedOpenCodeServers(): void {
  for (const entry of pool.values()) clearIdleShutdown(entry);
  pool.clear();
  clearOpenCodeSessionDatabases();
  clearOpenCodeCredentialCompatibility();
  disposeSpawnedOpenCodeServerHandles();
}
