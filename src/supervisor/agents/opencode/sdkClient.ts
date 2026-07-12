import type { OpencodeClient } from "@opencode-ai/sdk/v2/client";
import type { McpServer, ProjectLocation } from "@/shared/contracts";
import type { BrowserMcpHttpConfig } from "@/supervisor/agents/browserMcp";
import {
  SUBAGENT_MCP_SERVER_NAME,
  type SubagentMcpHttpConfig,
} from "@/supervisor/agents/subagentMcp";
import type { ComputerUseMcpHttpConfig } from "@/supervisor/agents/computerUseMcp";
import type { ChromeMcpHttpConfig } from "@/supervisor/agents/chromeMcp";
import type { AppControlsMcpHttpConfig } from "@/supervisor/agents/appControlsMcp";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { BROWSER_MCP_SERVER_NAME } from "../browserMcp";
import { COMPUTER_USE_MCP_SERVER_NAME } from "../computerUseMcp";
import { CHROME_MCP_SERVER_NAME } from "../chromeMcp";
import { APP_CONTROLS_MCP_SERVER_NAME } from "../appControlsMcp";
import { buildOpenCodeServerCommand } from "./argv";
import { buildOpenCodeBrowserMcp } from "./mcpBrowser";
import { buildOpenCodeSubagentMcp } from "./mcpSubagent";
import { buildOpenCodeComputerUseMcp } from "./mcpComputerUse";
import { buildOpenCodeChromeMcp } from "./mcpChrome";
import { buildOpenCodeAppControlsMcp } from "./mcpAppControls";
import { buildOpenCodeUserMcp } from "../userMcp";
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

function poolKey(location: ProjectLocation, dedicatedKey?: string): string {
  const base = ((): string => {
    switch (location.kind) {
      case "windows":
        return `windows:${location.path}`;
      case "wsl":
        return `wsl:${location.distro}:${location.linuxPath}`;
      case "posix":
        return `posix:${location.path}`;
    }
  })();
  // A `dedicatedKey` (the thread id) carves this acquisition out of the shared
  // per-project pool into its own single-tenant entry. Used when a thread hosts
  // the per-thread subagents MCP: its bearer token identifies exactly one parent
  // thread, so it must not be registered on a server shared by sibling threads
  // (which would misattribute their spawns). The entry still refcounts and tears
  // down through the same machinery — with one acquirer it dies when that thread
  // disposes.
  return dedicatedKey ? `${base}::dedicated:${dedicatedKey}` : base;
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
  managedCustomMcpNames: Set<string>;
  managedCustomMcpFingerprint?: string;
  /** Replaced by a fresh generation after its dynamic MCP config changed. */
  retired?: boolean;
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
  computerUseMcpEnabled?: boolean;
  computerUseMcp?: ComputerUseMcpHttpConfig;
  chromeMcpEnabled?: boolean;
  chromeMcp?: ChromeMcpHttpConfig;
  /**
   * Per-thread cross-provider subagents MCP config. When present, the server is
   * dedicated (see `dedicatedKey`) and the `subagents` MCP is registered on it
   * dynamically via `client.mcp.add` — the per-thread bearer token identifies
   * the parent thread, so it must never touch the shared config file (global,
   * would clobber) or a shared server (pooled, would misattribute spawns).
   */
  subagentMcp?: SubagentMcpHttpConfig;
  appControlsMcp?: AppControlsMcpHttpConfig;
  mcpServers?: McpServer[];
  /**
   * When set, this acquisition gets its own single-tenant pool entry keyed by
   * this value (the thread id) instead of joining the shared per-project pool.
   * Callers that host the per-thread subagents MCP pass their thread id here so
   * the dynamic `mcp.add` registration is isolated to one thread's server.
   */
  dedicatedKey?: string;
  /**
   * If set, the server stays alive for this many milliseconds after the last
   * release before being torn down. A re-acquire within the window reuses the
   * same server and cancels the pending teardown. Callers that want
   * immediate teardown (the TUI and GUI thread flows) leave this unset.
   */
  idleCloseDelayMs?: number;
}

async function syncBrowserMcp(
  input: Pick<
    AcquireOpenCodeServerInput,
    | "projectLocation"
    | "browserMcpEnabled"
    | "browserMcp"
    | "computerUseMcpEnabled"
    | "computerUseMcp"
    | "chromeMcpEnabled"
    | "chromeMcp"
  >,
  client: OpencodeClient,
): Promise<void> {
  const directory = resolveOpenCodeSessionDirectory(input.projectLocation);
  if (input.browserMcpEnabled === true) {
    const servers = buildOpenCodeBrowserMcp(input.projectLocation, input.browserMcp);
    const browser = servers?.[BROWSER_MCP_SERVER_NAME];
    if (browser) {
      await client.mcp
        .add({ directory, name: BROWSER_MCP_SERVER_NAME, config: browser })
        .catch((err) => {
          if (isOpenCodeConnectionLoss(err)) throw err;
        });
      await client.mcp.connect({ directory, name: BROWSER_MCP_SERVER_NAME });
    }
  } else if (input.browserMcpEnabled === false) {
    await client.mcp.disconnect({ directory, name: BROWSER_MCP_SERVER_NAME }).catch((error) => {
      console.warn("[opencode] failed to disconnect browser MCP:", error);
    });
  }

  if (input.computerUseMcpEnabled === false) {
    await client.mcp
      .disconnect({ directory, name: COMPUTER_USE_MCP_SERVER_NAME })
      .catch(() => undefined);
  } else if (input.computerUseMcpEnabled === true) {
    const servers = buildOpenCodeComputerUseMcp(input.projectLocation, true, input.computerUseMcp);
    const computerUse = servers?.[COMPUTER_USE_MCP_SERVER_NAME];
    if (computerUse) {
      await client.mcp
        .add({ directory, name: COMPUTER_USE_MCP_SERVER_NAME, config: computerUse })
        .catch((err) => {
          if (isOpenCodeConnectionLoss(err)) throw err;
        });
      await client.mcp.connect({ directory, name: COMPUTER_USE_MCP_SERVER_NAME });
    }
  }

  if (input.chromeMcpEnabled === false) {
    await client.mcp.disconnect({ directory, name: CHROME_MCP_SERVER_NAME }).catch(() => undefined);
    return;
  }
  if (input.chromeMcpEnabled !== true) return;

  const servers = buildOpenCodeChromeMcp(input.projectLocation, true, input.chromeMcp);
  const chrome = servers?.[CHROME_MCP_SERVER_NAME];
  if (!chrome) return;
  await client.mcp.add({ directory, name: CHROME_MCP_SERVER_NAME, config: chrome }).catch((err) => {
    if (isOpenCodeConnectionLoss(err)) throw err;
  });
  await client.mcp.connect({ directory, name: CHROME_MCP_SERVER_NAME });
}

/**
 * Register the per-thread cross-provider subagents MCP on this (dedicated)
 * server. Mirrors {@link syncBrowserMcp}'s dynamic `mcp.add` + `mcp.connect`,
 * but — unlike the browser MCP — the subagents endpoint is delivered
 * pre-resolved via `input.subagentMcp`, and the entry is never written to the
 * global config file (the per-thread token would clobber across launches).
 * Only runs when a `subagentMcp` config is present, which the caller pairs with
 * a `dedicatedKey` so this registration is isolated to one thread's server.
 */
async function syncSubagentMcp(
  input: Pick<AcquireOpenCodeServerInput, "projectLocation" | "subagentMcp">,
  client: OpencodeClient,
): Promise<void> {
  if (!input.subagentMcp) return;
  const directory = resolveOpenCodeSessionDirectory(input.projectLocation);
  const servers = buildOpenCodeSubagentMcp(input.subagentMcp);
  const subagents = servers?.[SUBAGENT_MCP_SERVER_NAME];
  if (!subagents) return;

  await client.mcp
    .add({ directory, name: SUBAGENT_MCP_SERVER_NAME, config: subagents })
    .catch((err) => {
      if (isOpenCodeConnectionLoss(err)) throw err;
    });
  await client.mcp.connect({ directory, name: SUBAGENT_MCP_SERVER_NAME });
}

async function syncAppControlsMcp(
  input: Pick<AcquireOpenCodeServerInput, "projectLocation" | "appControlsMcp">,
  client: OpencodeClient,
): Promise<void> {
  if (!input.appControlsMcp) return;
  const directory = resolveOpenCodeSessionDirectory(input.projectLocation);
  const servers = buildOpenCodeAppControlsMcp(input.projectLocation, input.appControlsMcp);
  const appControls = servers?.[APP_CONTROLS_MCP_SERVER_NAME];
  if (!appControls) return;
  await client.mcp
    .add({ directory, name: APP_CONTROLS_MCP_SERVER_NAME, config: appControls })
    .catch((err) => {
      if (isOpenCodeConnectionLoss(err)) throw err;
    });
  await client.mcp.connect({ directory, name: APP_CONTROLS_MCP_SERVER_NAME });
}

// No disconnect diffing is needed here: any change to the custom MCP set
// changes the fingerprint, which retires the server before this runs.
async function syncUserMcp(
  input: Pick<AcquireOpenCodeServerInput, "projectLocation">,
  servers: ReturnType<typeof buildOpenCodeUserMcp>,
  client: OpencodeClient,
): Promise<Set<string>> {
  const directory = resolveOpenCodeSessionDirectory(input.projectLocation);
  await Promise.all(
    Object.entries(servers).map(async ([name, config]) => {
      await client.mcp.add({ directory, name, config }).catch((error) => {
        if (isOpenCodeConnectionLoss(error)) throw error;
      });
      await client.mcp.connect({ directory, name });
    }),
  );
  return new Set(Object.keys(servers));
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
  const key = poolKey(input.projectLocation, input.dedicatedKey);
  let entry = pool.get(key);

  if (!entry) {
    const ready = spawnAndWire(input.projectLocation);
    entry = { key, ready, refCount: 0, managedCustomMcpNames: new Set() };
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
    const nextCustomMcp = buildOpenCodeUserMcp(input.mcpServers ?? []);
    const nextCustomMcpFingerprint = JSON.stringify(nextCustomMcp);
    if (
      acquiringEntry.managedCustomMcpFingerprint !== undefined &&
      acquiringEntry.managedCustomMcpFingerprint !== nextCustomMcpFingerprint
    ) {
      const directory = resolveOpenCodeSessionDirectory(input.projectLocation);
      await Promise.all(
        [...acquiringEntry.managedCustomMcpNames].map((name) =>
          snapshot.client.mcp.disconnect({ directory, name }).catch(() => undefined),
        ),
      );
      released = true;
      acquiringEntry.refCount -= 1;
      acquiringEntry.retired = true;
      if (pool.get(key) === acquiringEntry) pool.delete(key);
      if (acquiringEntry.refCount === 0) {
        await snapshot.handle.dispose().catch((error) => {
          console.warn("[opencode] failed to dispose retired MCP server:", error);
        });
      }
      return acquireOpenCodeServerInner(input, retryMcpConnectionLoss);
    }

    await syncBrowserMcp(input, snapshot.client);
    await syncSubagentMcp(input, snapshot.client);
    await syncAppControlsMcp(input, snapshot.client);
    acquiringEntry.managedCustomMcpNames = await syncUserMcp(input, nextCustomMcp, snapshot.client);
    acquiringEntry.managedCustomMcpFingerprint = nextCustomMcpFingerprint;
  } catch (error) {
    if (!retryMcpConnectionLoss || !isOpenCodeConnectionLoss(error)) {
      console.warn("[opencode] failed to sync managed MCP servers:", error);
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
      if (acquiringEntry.retired || idleCloseDelayMs === undefined || idleCloseDelayMs <= 0) {
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
