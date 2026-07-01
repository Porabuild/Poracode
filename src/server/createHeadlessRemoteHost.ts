import { closeDatabase, initDatabase } from "@/main/db";
import { prepareLightcodeDataRoot } from "@/main/lightcodeData";
import { patchSharedSettingsFile, readSharedSettingsFile } from "@/main/sharedSettingsFile";
import { SupervisorClient } from "@/main/supervisor/SupervisorClient";
import {
  createPersistentRemoteAuthStore,
  readOrCreateRemoteAccessIdentity,
  RemoteAccessServer,
  type RemoteAccessServerInfo,
} from "@/main/remote";
import {
  remoteAccessAdvertisedHost,
  remoteAccessHost,
  remoteAccessPairingAppUrl,
  remoteAccessPort,
} from "@/main/remote/config";
import type { SupervisorEvent } from "@/shared/ipc";
import { pickRemoteSettings } from "@/shared/remote";
import { configureSecretStorageKey } from "@/shared/secretStorage";
import { startRelayHost, type RelayHostHandle } from "./relay/relayHost";

/**
 * Boots the remote-access server outside Electron.
 *
 * This is the headless counterpart to the wiring in `src/main/main.ts`: it owns
 * the SQLite database and the forked supervisor, then constructs the **same**
 * {@link RemoteAccessServer} the desktop uses. The desktop injects a browser
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
  /** base64 32-byte AES key shared with the supervisor for secret sealing. */
  readonly secretStorageKey: string;
  /** Data dir; defaults to the standard Lightcode base dir for the channel. */
  readonly baseDir?: string;
  readonly host?: string;
  readonly port?: number;
  readonly advertisedHost?: string;
  readonly pairingAppUrl?: string;
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
  /** The server instance, for session inspection (listAccessSessions, …). */
  readonly server: RemoteAccessServer;
  /** Forks the supervisor (once) and starts the HTTP/WS server. Idempotent. */
  start(): Promise<RemoteAccessServerInfo>;
  /** Stops the server, kills the supervisor, and closes the database. */
  dispose(): Promise<void>;
}

export function createHeadlessRemoteHost(options: HeadlessRemoteHostOptions): HeadlessRemoteHost {
  const isDev = options.isDev ?? false;
  const paths = prepareLightcodeDataRoot(options.baseDir);
  initDatabase(paths.dbPath);
  configureSecretStorageKey(options.secretStorageKey);

  const identity = readOrCreateRemoteAccessIdentity(paths.baseDir);
  const authStore = createPersistentRemoteAuthStore(paths.baseDir);

  // The supervisor's onEvent fires only after start() forks it, by which point
  // `serverRef` is assigned; the null-guard covers construction order only.
  let serverRef: RemoteAccessServer | null = null;
  const supervisorClient = new SupervisorClient({
    appVersion: options.appVersion,
    isDev,
    supervisorPath: options.supervisorPath,
    wslHelpersDir: options.wslHelpersDir,
    secretStorageKey: options.secretStorageKey,
    ...(options.reportError ? { reportError: (error) => options.reportError?.(error) } : {}),
    onEvent: (event) => {
      options.onSupervisorEvent?.(event);
      serverRef?.publishSupervisorEvent(event);
    },
    onReset: () => {
      // Supervisor restarted/exited: in-flight requests are already rejected by
      // the client. Connected remote clients self-heal on their next request or
      // WebSocket reconnect (the replay window covers transient drops).
    },
  });

  const host = options.host ?? remoteAccessHost();
  const advertisedHost = options.advertisedHost ?? remoteAccessAdvertisedHost({ bindHost: host });
  const pairingAppUrl = options.pairingAppUrl ?? remoteAccessPairingAppUrl();

  const server = new RemoteAccessServer({
    appVersion: options.appVersion,
    identity,
    authStore,
    host,
    port: options.port ?? remoteAccessPort(),
    advertisedHost,
    ...(pairingAppUrl ? { pairingAppUrl } : {}),
    callSupervisor: (name, payload) => supervisorClient.call(name, payload),
    settings: {
      read: () => pickRemoteSettings(readSharedSettingsFile(paths.settingsPath)),
      update: (patch) => pickRemoteSettings(patchSharedSettingsFile(paths.settingsPath, patch)),
    },
  });
  serverRef = server;

  let started = false;
  let relayHandle: RelayHostHandle | null = null;
  return {
    server,
    async start() {
      if (!started) {
        supervisorClient.start(paths.baseDir);
        started = true;
      }
      const info = await server.start();
      // Optionally register with a relay so devices can reach this server across
      // networks. The relay only ever talks to the server's own loopback port,
      // so RemoteAccessServer is unchanged. Requires a secret to claim the id.
      if (options.relayUrl && options.relaySecret && !relayHandle) {
        const loopbackUrl = `http://127.0.0.1:${new URL(info.httpBaseUrl).port}`;
        relayHandle = startRelayHost({
          relayUrl: options.relayUrl,
          serverId: identity.desktopId,
          secret: options.relaySecret,
          label: identity.label,
          localHttpUrl: loopbackUrl,
          ...(options.reportError ? { reportError: (e) => options.reportError?.(e) } : {}),
          ...(options.onRelayRegistered ? { onRegistered: options.onRelayRegistered } : {}),
        });
      }
      return info;
    },
    async dispose() {
      relayHandle?.dispose();
      relayHandle = null;
      // Await the HTTP server close FIRST so in-flight requests finish before
      // the database (which they may read/write) is torn down.
      await server.dispose();
      supervisorClient.dispose();
      closeDatabase();
    },
  };
}
