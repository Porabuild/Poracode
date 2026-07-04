import type { OpencodeClient } from "@opencode-ai/sdk/v2/client";
import type { ProjectLocation } from "@/shared/contracts";
import type { BrowserMcpHttpConfig } from "@/supervisor/agents/browserMcp";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { BROWSER_MCP_SERVER_NAME } from "../browserMcp";
import { buildOpenCodeServerCommand } from "./argv";
import { buildOpenCodeBrowserMcp } from "./mcpBrowser";
import { classifyOpenCodeError, isOpenCodeConnectionLoss } from "./opencodeErrors";
import {
  disposeSpawnedOpenCodeServerHandles,
  spawnOpenCodeServer,
  type OpenCodeServerHandle,
} from "./sdkServer";

/** Agent-side cwd that the SDK passes through to the server's session config. */
export function resolveOpenCodeSessionDirectory(location: ProjectLocation): string {
  switch (location.kind) {
    case "windows":
      return location.path;
    case "wsl":
      return location.linuxPath;
    case "posix":
      return location.path;
  }
}

function poolKey(location: ProjectLocation): string {
  switch (location.kind) {
    case "windows":
      return `windows:${location.path}`;
    case "wsl":
      return `wsl:${location.distro}:${location.linuxPath}`;
    case "posix":
      return `posix:${location.path}`;
  }
}

export interface AcquiredOpenCodeServer {
  client: OpencodeClient;
  baseUrl: string;
  handle: OpenCodeServerHandle;
  dispose(): Promise<void>;
}

interface ServerSnapshot {
  client: OpencodeClient;
  baseUrl: string;
  handle: OpenCodeServerHandle;
}

interface PoolEntry {
  key: string;
  ready: Promise<ServerSnapshot>;
  refCount: number;
  /**
   * When set, the entry is currently waiting out an idle-grace window. A new
   * `acquire` cancels the timer and reuses the entry; if it fires, the server
   * is torn down. Mirrors t3code's `scheduleIdleClose`.
   */
  idleCloseTimer?: NodeJS.Timeout | undefined;
  /** Caller-requested idle TTL on the current grace timer (informational). */
  pendingIdleTtlMs?: number | undefined;
}

// Per-project pool. The OpenCode HTTP server can host any number of sessions
// in the same SQLite store, so multiple GUI threads in the same project share
// one `opencode serve` process. Refcounted: the last release tears the server
// down; if a release races with a fresh acquire, the in-flight `ready` promise
// is reused.
const pool = new Map<string, PoolEntry>();

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
async function waitForOpenCodeReachable(baseUrl: string): Promise<void> {
  const deadline = Date.now() + REACHABLE_TIMEOUT_MS;
  let backoffMs = 50;
  for (;;) {
    try {
      await fetch(baseUrl, {
        method: "GET",
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

async function spawnAndWire(projectLocation: ProjectLocation): Promise<ServerSnapshot> {
  const resolvedExecPath = resolveAgentBinaryPath(projectLocation, "opencode");
  const command = buildOpenCodeServerCommand(projectLocation, resolvedExecPath);
  const handle = spawnOpenCodeServer(command);

  let baseUrl: string;
  try {
    baseUrl = await handle.baseUrl;
    if (projectLocation.kind === "wsl") {
      await waitForOpenCodeReachable(baseUrl);
    }
  } catch (err) {
    await handle.dispose();
    throw err;
  }

  const { createOpencodeClient } = await import("@opencode-ai/sdk/v2/client");
  const client = createOpencodeClient({
    baseUrl,
    directory: resolveOpenCodeSessionDirectory(projectLocation),
    throwOnError: true,
  });

  return { client, baseUrl, handle };
}

/**
 * Spawn (or reuse) an `opencode serve` for the given project, wait for the
 * ready URL, and return a wired-up SDK client. The local loopback server is
 * unauthenticated by design (no `OPENCODE_SERVER_PASSWORD` is set), matching
 * OpenCode's local app-server usage.
 *
 * Disposal is per-acquisition: each acquire returns its own `dispose()` that
 * decrements the refcount. The underlying server stays alive until the last
 * acquirer releases it. TUI flow calls `dispose()` immediately after
 * `session.create`; GUI flow keeps its acquisition for the thread's lifetime.
 */
export interface AcquireOpenCodeServerInput {
  projectLocation: ProjectLocation;
  browserMcpEnabled?: boolean;
  browserMcp?: BrowserMcpHttpConfig;
  /**
   * If set, the server stays alive for this many milliseconds after the last
   * release before being torn down. A re-acquire within the window reuses the
   * same server and cancels the pending teardown. Callers that want
   * immediate teardown (the TUI and GUI thread flows) leave this unset.
   */
  idleCloseDelayMs?: number;
}

async function syncBrowserMcp(
  input: Pick<AcquireOpenCodeServerInput, "projectLocation" | "browserMcpEnabled" | "browserMcp">,
  client: OpencodeClient,
): Promise<void> {
  const directory = resolveOpenCodeSessionDirectory(input.projectLocation);
  if (input.browserMcpEnabled === undefined) return;
  if (!input.browserMcpEnabled) {
    await client.mcp.disconnect({ directory, name: BROWSER_MCP_SERVER_NAME }).catch((error) => {
      console.warn("[opencode] failed to disconnect browser MCP:", error);
    });
    return;
  }

  const servers = buildOpenCodeBrowserMcp(input.projectLocation, input.browserMcp);
  const browser = servers?.[BROWSER_MCP_SERVER_NAME];
  if (!browser) return;

  await client.mcp
    .add({ directory, name: BROWSER_MCP_SERVER_NAME, config: browser })
    .catch((err) => {
      if (isOpenCodeConnectionLoss(err)) throw err;
    });
  await client.mcp.connect({ directory, name: BROWSER_MCP_SERVER_NAME });
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
    entry = { key, ready, refCount: 0 };
    pool.set(key, entry);

    // If spawn fails, evict so the next acquire respawns instead of resolving
    // a poisoned promise forever.
    ready.catch(() => {
      if (pool.get(key) === entry) pool.delete(key);
    });

    // If the server crashes after wiring, evict so subsequent acquires get a
    // fresh process. Live acquirers will see I/O errors on next request and
    // surface them through the SDK.
    void ready.then((snapshot) => {
      snapshot.handle.child.once("exit", () => {
        if (pool.get(key) === entry) pool.delete(key);
      });
    });
  }

  const acquiringEntry = entry;
  acquiringEntry.refCount += 1;

  // Cancel any pending idle-teardown: this acquire reuses the same server.
  if (acquiringEntry.idleCloseTimer) {
    clearTimeout(acquiringEntry.idleCloseTimer);
    acquiringEntry.idleCloseTimer = undefined;
    acquiringEntry.pendingIdleTtlMs = undefined;
  }

  let snapshot: ServerSnapshot;
  try {
    snapshot = await acquiringEntry.ready;
  } catch (err) {
    acquiringEntry.refCount -= 1;
    throw err;
  }

  let released = false;
  const idleCloseDelayMs = input.idleCloseDelayMs;
  try {
    await syncBrowserMcp(input, snapshot.client);
  } catch (error) {
    if (!retryMcpConnectionLoss || !isOpenCodeConnectionLoss(error)) {
      console.warn("[opencode] failed to sync Browser MCP:", error);
    } else {
      released = true;
      acquiringEntry.refCount -= 1;
      if (pool.get(key) === acquiringEntry) pool.delete(key);
      await snapshot.handle.dispose().catch((disposeErr) => {
        console.warn("[opencode] failed to dispose handle during retry:", disposeErr);
      });
      return acquireOpenCodeServerInner(input, false);
    }
  }

  return {
    client: snapshot.client,
    baseUrl: snapshot.baseUrl,
    handle: snapshot.handle,
    dispose: async () => {
      if (released) return;
      released = true;
      acquiringEntry.refCount -= 1;
      if (acquiringEntry.refCount > 0) return;

      // No idle window requested → tear down immediately, matching prior
      // behaviour for the TUI/GUI flows.
      if (idleCloseDelayMs === undefined || idleCloseDelayMs <= 0) {
        if (pool.get(key) === acquiringEntry) pool.delete(key);
        await snapshot.handle.dispose();
        return;
      }

      // Hold the entry open for `idleCloseDelayMs`. The next `acquire`
      // cancels the timer above; if no acquire comes, the timer tears the
      // server down and evicts the entry.
      acquiringEntry.pendingIdleTtlMs = idleCloseDelayMs;
      acquiringEntry.idleCloseTimer = setTimeout(() => {
        if (acquiringEntry.refCount > 0) return;
        if (pool.get(key) !== acquiringEntry) return;
        pool.delete(key);
        void snapshot.handle.dispose();
      }, idleCloseDelayMs);
      // Don't keep the process alive just to honour an idle-close timer.
      if (typeof acquiringEntry.idleCloseTimer.unref === "function") {
        acquiringEntry.idleCloseTimer.unref();
      }
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
  for (const entry of pool.values()) {
    if (entry.idleCloseTimer) {
      clearTimeout(entry.idleCloseTimer);
      entry.idleCloseTimer = undefined;
    }
  }
  pool.clear();
  disposeSpawnedOpenCodeServerHandles();
}
