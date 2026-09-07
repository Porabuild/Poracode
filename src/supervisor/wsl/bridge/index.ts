import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ChildProcess } from "node:child_process";
import { terminateChildProcessTree } from "@/shared/processTree";
import { type AgentEventEnvelope, agentEventEnvelopeSchema } from "@/shared/contracts/agentEvent";
import { isPoracodeHookDebug } from "../../runtime/hookDebug";
import {
  deployFilesToWslTempBase,
  readBundledHelperVersion,
  resolveWslHelpersDir,
} from "../wslDeploy";
import { resolveNodeForDistro, type ResolvedNode } from "../runtime";
import { attachLineSplitter, spawnWslLineChild, type WslLineChildOpts } from "../wslChild";

export type HookEventReceiver = (event: AgentEventEnvelope) => void;

export interface WslBridgeServerOptions {
  /** Same callback shape as `HookIngress` so dispatcher logic stays unified. */
  onEvent: HookEventReceiver;
  /** Optional logger; defaults to no-op. */
  onError?: (message: string, error?: unknown) => void;
  /** Called when a booted bridge child exits and callers should recreate subscriptions. */
  onBridgeExit?: (distro: string) => void;
  /** Restore project subscriptions after an idle bridge wakes on demand. */
  onBridgeResume?: (distro: string) => void;
  /** Loaded sessions own hook/browser endpoints even between turns. */
  hasLiveSession?: (distro: string) => boolean;
  /** Bearer secret shared with the Windows-side `HookIngress`. */
  secret: string;
  /** Supervisor's max protocol version, exposed to the in-WSL bridge. */
  protocolVersion: number;
  /**
   * Test seam: replace the underlying `wsl.exe` spawner. Defaults to
   * `spawnWslLineChild`. The test stub can synthesise boot + event lines
   * without touching real `wsl.exe`.
   */
  spawn?: (opts: WslLineChildOpts) => ChildProcess;
  /**
   * Test seam: replace the in-WSL Node resolver. Defaults to
   * `resolveNodeForDistro` from `../runtime`. Returns null when no usable
   * node is available (and no install fallback succeeded), in which case
   * the bridge declines to start.
   */
  resolveNode?: (distro: string) => Promise<ResolvedNode | null>;
  /**
   * Test seam: replace the deploy step. Defaults to `deployFilesToWslTempBase`.
   */
  deploy?: (
    distro: string,
    files: { src: string; relDest: string }[],
  ) => { linuxBaseDir: string } | null;
  /** Optional override for the resources dir (defaults to `resolveWslHelpersDir`). */
  helpersDir?: string;
  /**
   * Maximum time to wait for the bridge to write its `boot` line. Defaults
   * to 10 seconds — enough for a cold-start `wsl.exe` invocation but bounded
   * so a stuck distro can't pin a thread spawn forever.
   */
  bootTimeoutMs?: number;
}

export interface BridgeHandle {
  /** Base URL of the in-distro server, e.g. `http://127.0.0.1:<port>`. */
  baseUrl: string;
  /** Hook-event URL plugins POST to — `${baseUrl}/v1/agent-event`. */
  hookUrl: string;
  /** Shared bearer secret used by every endpoint on this server. */
  secret: string;
}

interface BridgeState {
  child: ChildProcess;
  handle: BridgeHandle;
  version?: string;
}

const DEFAULT_BOOT_TIMEOUT_MS = 10_000;

export type WatchScope = "git" | "worktree" | "unknown";

export type WatchEventListener = (event: WatchEvent) => void;
interface WatchListenerEntry {
  distro: string;
  listener: WatchEventListener;
}

export interface WatchEvent {
  subscriptionId: string;
  scope: WatchScope;
  paths: string[];
}

/**
 * Owns one in-WSL bridge per distro. The bridge is `node bridge.mjs`
 * staged under `~/.poracode/bridge/bridge.mjs` and spawned via `wsl.exe`.
 * Its stdout JSONL stream is parsed here:
 *
 *   {"type":"boot","port":<n>,...}        → resolves the per-distro `ready`
 *                                            promise with the loopback URL
 *   {"type":"event","payload":<envelope>} → forwarded to `options.onEvent`
 *   {"type":"watch","subscriptionId":…}   → routed to the registered watch
 *                                            listener for that id
 *   {"type":"error","message":"…"}        → logged via `options.onError`
 *
 * Lazy: nothing happens until `ensureBridge(distro)` is called the first
 * time. Concurrent calls share the same in-flight promise. On child exit
 * the cache entry is cleared so the next call re-stages and re-spawns.
 */
export class WslBridgeServer {
  private readonly bridges = new Map<string, BridgeState>();
  private readonly inFlight = new Map<string, Promise<BridgeHandle | undefined>>();
  private readonly disposed = new WeakSet<ChildProcess>();
  private readonly bootTimeoutMs: number;
  private readonly watchListeners = new Map<string, WatchListenerEntry>();
  private isDisposed = false;
  private readonly lastActivity = new Map<string, number>();
  private readonly requests = new Map<string, number>();
  private readonly sleeping = new Set<string>();
  private readonly idleTimer: ReturnType<typeof setInterval>;

  constructor(private readonly options: WslBridgeServerOptions) {
    this.bootTimeoutMs = options.bootTimeoutMs ?? DEFAULT_BOOT_TIMEOUT_MS;
    const idleTimeoutMs = 5 * 60_000;
    this.idleTimer = setInterval(() => {
      for (const distro of this.bridges.keys()) {
        if (this.options.hasLiveSession?.(distro) || this.requests.get(distro)) {
          this.lastActivity.set(distro, Date.now());
          continue;
        }
        if (Date.now() - (this.lastActivity.get(distro) ?? Date.now()) < idleTimeoutMs) continue;
        this.sleeping.add(distro);
        this.releaseBridge(distro);
      }
    }, 30_000);
    this.idleTimer.unref();
  }

  /** Keep long requests alive until their response body has been consumed. */
  beginRequest(distro: string): () => void {
    this.requests.set(distro, (this.requests.get(distro) ?? 0) + 1);
    return () => {
      const remaining = (this.requests.get(distro) ?? 1) - 1;
      if (remaining) this.requests.set(distro, remaining);
      else this.requests.delete(distro);
      this.lastActivity.set(distro, Date.now());
    };
  }

  hasWatchListener(subscriptionId: string): boolean {
    return this.watchListeners.has(subscriptionId);
  }

  /**
   * Register a listener for a future `subscriptionId`. Must be called
   * BEFORE the HTTP subscribe call so the first event cannot race in.
   */
  registerWatchListener(
    subscriptionId: string,
    distro: string,
    listener: WatchEventListener,
  ): void {
    this.watchListeners.set(subscriptionId, { distro, listener });
  }

  unregisterWatchListener(subscriptionId: string): void {
    this.watchListeners.delete(subscriptionId);
  }

  private unregisterWatchListenersForDistro(distro: string): void {
    for (const [subscriptionId, entry] of this.watchListeners) {
      if (entry.distro === distro) this.watchListeners.delete(subscriptionId);
    }
  }

  /**
   * Ensure a bridge is running for `distro` and return its loopback URL.
   * Returns `undefined` when the bridge could not be brought up — the
   * caller should silently fall back to L2 (TUI parsing).
   */
  async ensureBridge(distro: string): Promise<BridgeHandle | undefined> {
    if (this.isDisposed) return undefined;
    this.lastActivity.set(distro, Date.now());
    const existing = this.bridges.get(distro);
    if (existing) {
      const helpersDir = this.options.helpersDir ?? resolveWslHelpersDir();
      const expectedVersion = helpersDir
        ? readBundledHelperVersion("bridge.mjs", "BRIDGE_VERSION", helpersDir)
        : undefined;
      if (expectedVersion && existing.version && existing.version !== expectedVersion) {
        if (isPoracodeHookDebug()) {
          console.log("[supervisor] hook-debug: WSL bridge cached version mismatch, restarting", {
            distro,
            expected: expectedVersion,
            actual: existing.version,
          });
        }
        this.bridges.delete(distro);
        this.disposed.add(existing.child);
        try {
          terminateChildProcessTree(existing.child);
        } catch {
          // best effort
        }
      } else {
        if (isPoracodeHookDebug()) {
          console.log("[supervisor] hook-debug: WSL bridge (cached)", {
            distro,
            baseUrl: existing.handle.baseUrl,
          });
        }
        return existing.handle;
      }
    }
    const inFlight = this.inFlight.get(distro);
    if (inFlight) return inFlight;
    const task = this.startBridge(distro).catch((error) => {
      this.options.onError?.(`wsl hook bridge failed for ${distro}`, error);
      return undefined;
    });
    this.inFlight.set(distro, task);
    try {
      return await task;
    } finally {
      this.inFlight.delete(distro);
      if (this.bridges.has(distro) && this.sleeping.delete(distro)) {
        this.options.onBridgeResume?.(distro);
      }
    }
  }

  async dispose(): Promise<void> {
    this.isDisposed = true;
    clearInterval(this.idleTimer);
    const distros = [...this.bridges.keys()];
    for (const distro of distros) {
      const state = this.bridges.get(distro);
      if (!state) continue;
      this.bridges.delete(distro);
      this.disposed.add(state.child);
      this.unregisterWatchListenersForDistro(distro);
      try {
        this.stopChild(state.child);
      } catch {
        // best effort
      }
    }
  }

  /** Stop Poracode's bridge process without terminating the WSL distro itself. */
  releaseBridge(distro: string): void {
    this.unregisterWatchListenersForDistro(distro);
    const releaseStartedBridge = (): void => {
      const state = this.bridges.get(distro);
      if (!state) return;
      this.bridges.delete(distro);
      this.disposed.add(state.child);
      try {
        this.stopChild(state.child);
      } catch {
        // best effort
      }
    };
    void this.inFlight.get(distro)?.then(releaseStartedBridge);
    releaseStartedBridge();
  }

  private stopChild(child: ChildProcess): void {
    // EOF reaches the Linux process; killing only its Windows relay may orphan it.
    if (!child.stdin) {
      terminateChildProcessTree(child);
      return;
    }
    child.stdin.end();
    const timer = setTimeout(() => terminateChildProcessTree(child), 2_000);
    timer.unref();
    child.once("exit", () => clearTimeout(timer));
  }

  /**
   * Spawn + wait-for-boot, with a one-shot retry when the booted bridge
   * reports a version different from the one we just staged. The retry
   * handles the (rare but real) case where a previous supervisor left a
   * running bridge inside WSL and our new deploy overwrote the file on
   * disk — the in-memory child is stale, so we kill it and respawn from
   * the fresh file. Capped at one retry to prevent infinite loops if the
   * version regex ever disagrees with reality.
   */
  private async startBridge(distro: string, attempt = 0): Promise<BridgeHandle | undefined> {
    const helpersDir = this.options.helpersDir ?? resolveWslHelpersDir();
    if (!helpersDir) {
      if (isPoracodeHookDebug()) {
        console.log("[supervisor] hook-debug: WSL bridge not started", {
          distro,
          reason: "no helpers dir (bundle PORACODE_WSL_HELPERS_DIR / resources)",
        });
      }
      return undefined;
    }
    const bridgeSrc = join(helpersDir, "bridge.mjs");
    if (!existsSync(bridgeSrc)) {
      if (isPoracodeHookDebug()) {
        console.log("[supervisor] hook-debug: WSL bridge not started", {
          distro,
          reason: `missing ${bridgeSrc}`,
        });
      }
      return undefined;
    }

    const resolveNode = this.options.resolveNode ?? defaultResolveNode;
    const resolved = await resolveNode(distro).catch((error) => {
      if (isPoracodeHookDebug()) {
        console.log("[supervisor] hook-debug: WSL node resolve failed", {
          distro,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return null;
    });
    if (!resolved) {
      if (isPoracodeHookDebug()) {
        console.log("[supervisor] hook-debug: WSL bridge not started", {
          distro,
          reason: "no usable node in distro and runtime install failed",
        });
      }
      return undefined;
    }

    const deploy =
      this.options.deploy ??
      ((targetDistro, files) =>
        deployFilesToWslTempBase(targetDistro, `poracode-bridge-${process.pid}`, files));
    const watcherBinding = join(helpersDir, "watcher.node");
    const deployedFiles: { src: string; relDest: string }[] = [
      { src: bridgeSrc, relDest: "bridge/bridge.mjs" },
    ];
    if (existsSync(watcherBinding)) {
      deployedFiles.push({ src: watcherBinding, relDest: "bridge/watcher.node" });
    }
    const result = deploy(distro, deployedFiles);
    if (!result) {
      if (isPoracodeHookDebug()) {
        console.log("[supervisor] hook-debug: WSL bridge not started", {
          distro,
          reason: "deployFilesToWslTempBase failed (UNC path / permissions)",
        });
      }
      return undefined;
    }

    const linuxScriptPath = `${result.linuxBaseDir}/bridge/bridge.mjs`;

    let resolveBoot: (handle: BridgeHandle) => void = () => undefined;
    let rejectBoot: (error: Error) => void = () => undefined;
    const ready = new Promise<BridgeHandle>((resolve, reject) => {
      resolveBoot = resolve;
      rejectBoot = reject;
    });

    let booted = false;
    let reportedVersion: string | undefined;
    const onLine = (line: string): void => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        return;
      }
      if (!parsed || typeof parsed !== "object") return;
      const message = parsed as Record<string, unknown>;
      const type = message.type;
      if (type === "boot" && typeof message.port === "number") {
        booted = true;
        if (typeof message.version === "string" && message.version.length > 0) {
          reportedVersion = message.version;
        }
        const baseUrl = `http://127.0.0.1:${message.port}`;
        if (isPoracodeHookDebug()) {
          console.log("[supervisor] hook-debug: WSL bridge booted in distro", {
            distro,
            port: message.port,
            version: reportedVersion ?? "(unversioned)",
            baseUrl,
          });
        }
        resolveBoot({
          baseUrl,
          hookUrl: `${baseUrl}/v1/agent-event`,
          secret: this.options.secret,
        });
        return;
      }
      if (type === "event" && message.payload && typeof message.payload === "object") {
        const candidate = message.payload as Record<string, unknown>;
        const envelope = agentEventEnvelopeSchema.safeParse(candidate);
        if (envelope.success) {
          try {
            this.options.onEvent(envelope.data);
          } catch (error) {
            this.options.onError?.("wsl hook bridge: receiver threw", error);
          }
        } else {
          this.options.onError?.(
            "wsl hook bridge: dropped malformed envelope",
            envelope.error.issues[0]?.message,
          );
        }
        return;
      }
      if (type === "watch" && typeof message.subscriptionId === "string") {
        const entry = this.watchListeners.get(message.subscriptionId);
        if (entry) {
          const scope: WatchScope =
            message.scope === "git" || message.scope === "worktree" ? message.scope : "unknown";
          const paths = Array.isArray(message.paths)
            ? (message.paths.filter((v): v is string => typeof v === "string") as string[])
            : [];
          try {
            entry.listener({ subscriptionId: message.subscriptionId, scope, paths });
          } catch (error) {
            this.options.onError?.("wsl bridge watch: listener threw", error);
          }
        }
        return;
      }
      if (type === "error") {
        this.options.onError?.(`wsl hook bridge[${distro}]: ${String(message.message ?? "")}`);
      }
    };

    // Use the resolved absolute node path directly — no shell wrapping
    // needed because we don't depend on PATH lookup. This sidesteps the
    // `/bin/sh: node: not found` failure mode when the user has nvm-only
    // node and Claude (or wsl.exe under a sanitized env) doesn't source
    // their shell init files.
    const childOpts: WslLineChildOpts = {
      distro,
      argv: [resolved.nodePath, linuxScriptPath],
      env: {
        PORACODE_BRIDGE_PARENT_STDIN: "1",
        PORACODE_HOOK_SECRET: this.options.secret,
        PORACODE_HOOK_PROTOCOL_VERSION: String(this.options.protocolVersion),
        ...(process.env.PORACODE_BROWSER_MCP_URL
          ? { PORACODE_BROWSER_MCP_URL: process.env.PORACODE_BROWSER_MCP_URL }
          : {}),
        ...(process.env.PORACODE_BROWSER_MCP_TOKEN
          ? { PORACODE_BROWSER_MCP_TOKEN: process.env.PORACODE_BROWSER_MCP_TOKEN }
          : {}),
      },
      stderr: "ignore",
      stdin: "pipe",
      onLine,
      onError: (error) => {
        if (!booted) {
          rejectBoot(error);
        }
        this.options.onError?.(`wsl hook bridge[${distro}] child error`, error);
      },
    };

    const spawnFn = this.options.spawn ?? spawnWslLineChild;
    const child = spawnFn(childOpts);

    // For test stubs that don't wire stdout via spawnWslLineChild, attach
    // the splitter ourselves. Real `spawnWslLineChild` already attaches it
    // before returning, so the second attach is a no-op for production.
    if (this.options.spawn) {
      const splitterOpts: Pick<WslLineChildOpts, "onLine" | "onError"> = childOpts.onError
        ? { onLine, onError: childOpts.onError }
        : { onLine };
      attachLineSplitter(child, splitterOpts);
    }

    const onExit = (): void => {
      const state = this.bridges.get(distro);
      if (state && state.child === child) {
        this.bridges.delete(distro);
      }
      if (!this.disposed.has(child)) this.unregisterWatchListenersForDistro(distro);
      if (booted && isPoracodeHookDebug()) {
        console.log(
          "[supervisor] hook-debug: WSL bridge child exited (will respawn on next ensure)",
          {
            distro,
          },
        );
      }
      if (!booted) {
        rejectBoot(new Error(`wsl hook bridge[${distro}] exited before boot`));
      } else if (!this.isDisposed && !this.disposed.has(child)) {
        this.options.onBridgeExit?.(distro);
      }
    };
    child.once("exit", onExit);

    const timeout = setTimeout(() => {
      if (!booted) {
        rejectBoot(new Error(`wsl hook bridge[${distro}] boot timed out`));
        try {
          terminateChildProcessTree(child);
        } catch {
          // best effort
        }
      }
    }, this.bootTimeoutMs);
    if (typeof timeout.unref === "function") timeout.unref();

    let handle: BridgeHandle | undefined;
    try {
      handle = await ready;
    } finally {
      clearTimeout(timeout);
    }

    if (!handle) return undefined;
    if (this.isDisposed) {
      try {
        terminateChildProcessTree(child);
      } catch {
        // best effort
      }
      return undefined;
    }

    const expectedVersion = readBundledHelperVersion("bridge.mjs", "BRIDGE_VERSION", helpersDir);
    if (
      expectedVersion &&
      reportedVersion &&
      reportedVersion !== expectedVersion &&
      attempt === 0
    ) {
      if (isPoracodeHookDebug()) {
        console.log("[supervisor] hook-debug: WSL bridge version mismatch, restarting", {
          distro,
          expected: expectedVersion,
          actual: reportedVersion,
        });
      }
      child.off("exit", onExit);
      try {
        terminateChildProcessTree(child);
      } catch {
        // best effort
      }
      return this.startBridge(distro, attempt + 1);
    }
    if (
      expectedVersion &&
      reportedVersion &&
      reportedVersion !== expectedVersion &&
      attempt > 0 &&
      isPoracodeHookDebug()
    ) {
      // We already restaged + respawned once; accept what the distro
      // reports and surface the divergence so it's visible in logs.
      console.log("[supervisor] hook-debug: WSL bridge version still mismatched after restart", {
        distro,
        expected: expectedVersion,
        actual: reportedVersion,
      });
    }
    const bridgeState = {
      child,
      handle,
      ...(reportedVersion ? { version: reportedVersion } : {}),
    };
    this.bridges.set(distro, bridgeState);
    return handle;
  }
}

/**
 * Default Node resolver: probes the distro for the user's nvm/system node,
 * downloading the pinned LTS as a fallback. See `../runtime` for details.
 * Returns null when both probe and install fail.
 */
async function defaultResolveNode(distro: string): Promise<ResolvedNode | null> {
  try {
    return await resolveNodeForDistro(distro, { useBridge: false });
  } catch {
    return null;
  }
}
