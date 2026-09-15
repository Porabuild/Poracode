import { HostOwnerController } from "@/backend/ownership/HostOwnerController";
import { resolvePoracodeBaseDir } from "@/shared/poracodePaths";
import { configureSecretStorageKey } from "@/shared/secretStorage";
import type { SupervisorEvent } from "@/shared/ipc";
import type { RemoteAccessServer, RemoteAccessServerInfo } from "@/main/remote/RemoteAccessServer";
import {
  composeHeadlessRemoteHost,
  HeadlessCompositionShutdownError,
} from "./headlessRemoteComposition";
export { resolveLocalProxyBase } from "./headlessProxyBase";

/**
 * Boots the remote-access server outside Electron.
 *
 * This is the headless counterpart to the desktop-managed backend: it owns
 * the profile lease, SQLite database and a lazily forked supervisor, then constructs the
 * **same** {@link RemoteAccessServer} the desktop uses. The desktop injects a browser
 * gateway and a renderer-dispatch callback; the headless host injects neither.
 *
 * Without a renderer, the SQLite DB is the source of truth — remote thread
 * commands take the DB-backed path inside `RemoteAccessServer`
 * (`applyRemoteThreadCommand`), and renderer-only side effects are simply
 * unavailable (see {@link ../../docs/REMOTE_ARCHITECTURE.md}, Phase 2).
 */
export interface HeadlessRemoteHostOptions {
  readonly appVersion: string;
  readonly isDev?: boolean;
  /** Path to the bundled `supervisor.cjs` the host should fork. */
  readonly supervisorPath: string;
  /** Directory of in-WSL helper assets; forwarded to the supervisor for parity. */
  readonly wslHelpersDir: string;
  /** Directory of app-bundled read-only skills; forwarded to the supervisor. */
  readonly bundledSkillsDir?: string;
  /** Directory of app-bundled plugins; forwarded to the supervisor. */
  readonly bundledPluginsDir?: string;
  /** Explicit base64 32-byte key injection; absence uses the owned key file. */
  readonly environmentKey?: string;
  /** Profile namespace; the owned server root is its versioned sibling. */
  readonly baseDir?: string;
  readonly host?: string;
  readonly port?: number;
  readonly advertisedHost?: string;
  readonly pairingAppUrl?: string;
  /** Close startup admission on cancellation; disposal still joins owned work. */
  readonly signal?: AbortSignal;
  /**
   * Optional relay (docs/REMOTE_ARCHITECTURE.md, Phase 5). When set, the host
   * dials this relay's `/host` control endpoint and registers under its
   * identity's desktopId, so devices can reach it across networks at
   * `<relay>/s/<desktopId>/` without inbound ports. `relaySecret` proves
   * ownership of the id to the relay.
   */
  readonly relayUrl?: string;
  readonly relaySecret?: string;
  /** Notified with the public relay URL once registered. */
  onRelayRegistered?(publicUrl: string): void;
  /** Sink for supervisor-side errors (Sentry, structured logs). */
  reportError?(error: unknown): void;
  /** Optional observer of the supervisor event stream (e.g. logging/metrics). */
  onSupervisorEvent?(event: SupervisorEvent): void;
}

export interface HeadlessRemoteHost {
  readonly profileNamespace: string;
  readonly dataRoot: string;
  readonly ownerGeneration: string;
  /** The server instance, for session inspection (listAccessSessions, …). */
  readonly server: RemoteAccessServer;
  /**
   * The host's dedicated persistent forward origin secret (canonical base64url
   * of 32 random bytes). Exposed for the relay v2 composition integration —
   * relay registration will carry it so the relay can derive/validate the
   * forward owner label. Never logged; same trust boundary as the data dir.
   */
  readonly forwardOriginSecret: string;
  /** Starts the HTTP/WS server. The supervisor starts on its first call. Idempotent. */
  start(): Promise<RemoteAccessServerInfo>;
  /** Stops the server, kills the supervisor, and closes the database. */
  dispose(): Promise<void>;
}

// SQLite and the configured credential key are process-owned singletons.
let activeOwner: HostOwnerController | undefined;

export async function createHeadlessRemoteHost(
  options: HeadlessRemoteHostOptions,
): Promise<HeadlessRemoteHost> {
  options.signal?.throwIfAborted();
  if (activeOwner) throw new Error("This process already owns a headless host.");
  const owner = HostOwnerController.acquire(
    options.baseDir ?? resolvePoracodeBaseDir(),
    "headless",
  );
  activeOwner = owner;
  const cancelStartup = () => owner.cancelStartup();
  options.signal?.addEventListener("abort", cancelStartup, { once: true });
  const closeOwner = async () => {
    await owner.close();
    options.signal?.removeEventListener("abort", cancelStartup);
    if (activeOwner === owner) activeOwner = undefined;
  };
  try {
    const runtime = await owner.initialize({
      mode: "headless",
      ...(options.environmentKey !== undefined ? { environmentKey: options.environmentKey } : {}),
    });
    options.signal?.throwIfAborted();
    configureSecretStorageKey(runtime.secretStorageKey);
    const composition = await composeHeadlessRemoteHost(options, runtime);
    let ready = false;
    return {
      ...composition,
      profileNamespace: owner.lease.paths.profileNamespace,
      dataRoot: runtime.paths.baseDir,
      ownerGeneration: owner.lease.generation,
      async start() {
        options.signal?.throwIfAborted();
        const info = await composition.start();
        options.signal?.throwIfAborted();
        if (!ready) {
          owner.markReady();
          ready = true;
        }
        return info;
      },
      async dispose() {
        owner.cancelStartup();
        await composition.dispose();
        await closeOwner();
      },
    };
  } catch (error) {
    // A partial runtime must confirm its joins before ownership can be released.
    // Active leases are retained even when the caller abandons this failure.
    if (!(error instanceof HeadlessCompositionShutdownError)) await closeOwner();
    throw error;
  }
}
