import { saveUploadedAttachmentFile } from "@/main/attachments/attachmentStorage";
import { dbGetProject, dbGetProjects, dbGetThreads } from "@/main/db";
import { BackendHostCore } from "@/backend/BackendHostCore";
import { BackendDurableServices } from "@/backend/BackendDurableServices";
import { preparePoracodeDataRoot } from "@/main/poracodeData";
import { migrateLegacyDataOnLaunch } from "@/main/legacyDataMigration";
import { resolvePoracodePaths } from "@/shared/poracodePaths";
import {
  patchSharedSettingsFile,
  readSharedSettingsFile,
  writeSharedSettingsFile,
} from "@/main/sharedSettingsFile";
import { createPersistentRemoteAuthStore } from "@/main/remote/auth";
import { readOrCreateRemoteAccessIdentity } from "@/main/remote/identity";
import { createPortForwarding } from "@/main/remote/portForward/portForwarding";
import {
  createPushGateway,
  createWebPushPublicKeyResolver,
  PushCoordinator,
  PushRegistrationStore,
} from "@/main/remote/push";
import { RemoteAccessServer, type RemoteAccessServerInfo } from "@/main/remote/RemoteAccessServer";
import {
  remoteAccessAdvertisedHost,
  remoteAccessHost,
  remoteAccessPairingAppUrl,
  resolveRemoteAccessPort,
} from "@/main/remote/config";
import type { SupervisorEvent } from "@/shared/ipc";
import { resolveMcpLaunchSnapshot } from "@/shared/contracts";
import { pickRemoteSettings, remoteProjectCommandResultSchema } from "@/shared/remote";
import { configureSecretStorageKey } from "@/shared/secretStorage";
import { startRelayHost, type RelayHostHandle } from "./relay/relayHost";

/**
 * Boots the remote-access server outside Electron.
 *
 * This is the headless counterpart to the wiring in `src/main/main.ts`: it owns
 * the SQLite database and a lazily forked supervisor, then constructs the
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
  /** base64 32-byte AES key shared with the supervisor for secret sealing. */
  readonly secretStorageKey: string;
  /** Data dir; defaults to the standard Poracode base dir for the channel. */
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
  /** Starts the HTTP/WS server. The supervisor starts on its first call. Idempotent. */
  start(): Promise<RemoteAccessServerInfo>;
  /** Stops the server, kills the supervisor, and closes the database. */
  dispose(): Promise<void>;
}

/** Bind hosts that mean "all interfaces" — the server then also listens on loopback. */
const WILDCARD_BIND_HOSTS = new Set(["0.0.0.0", "::", "::0"]);

/**
 * The base URL the relay host adapter should proxy visitor traffic to on this
 * machine. The server binds to `bindHost`; the relay must reach the SAME
 * address, not a hardcoded 127.0.0.1.
 *
 * On a wildcard bind (`0.0.0.0`/`::`/`::0`/empty) the server also accepts
 * loopback, so 127.0.0.1 is correct and avoids depending on any external
 * interface. On a specific bind host (e.g. a Tailscale/VPN IP) the server does
 * NOT listen on 127.0.0.1, so proxying there would ECONNREFUSED — use the
 * configured host, bracketing IPv6 literals. The bound port is always taken
 * from the actually-listening `httpBaseUrl`.
 */
export function resolveLocalProxyBase(bindHost: string | undefined, httpBaseUrl: string): string {
  const port = new URL(httpBaseUrl).port;
  const host = bindHost?.trim();
  if (!host || WILDCARD_BIND_HOSTS.has(host)) {
    return `http://127.0.0.1:${port}`;
  }
  // Bracket IPv6 literals (they contain colons); IPv4/hostnames pass through.
  const authorityHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${authorityHost}:${port}`;
}

export async function createHeadlessRemoteHost(
  options: HeadlessRemoteHostOptions,
): Promise<HeadlessRemoteHost> {
  const isDev = options.isDev ?? false;
  const host = options.host ?? remoteAccessHost();
  const port = await resolveRemoteAccessPort({
    host,
    ...(options.port !== undefined ? { port: options.port } : {}),
  });
  const targetPaths = resolvePoracodePaths(options.baseDir);
  migrateLegacyDataOnLaunch({ baseDir: targetPaths.baseDir });
  const paths = preparePoracodeDataRoot(targetPaths.baseDir);
  configureSecretStorageKey(options.secretStorageKey);
  const getSharedSettings = () => readSharedSettingsFile(paths.settingsPath);

  // These are assigned after the core is constructed and before its supervisor
  // starts, so the event callback always sees the completed composition.
  let serverRef: RemoteAccessServer | null = null;
  let durableServices: BackendDurableServices | null = null;
  let pushCoordinator: PushCoordinator | null = null;

  const backendHost = new BackendHostCore({
    baseDir: paths.baseDir,
    dbPath: paths.dbPath,
    // No agent session survived the restart; without a renderer to run
    // markThreadsInactiveOnLaunch, stale live statuses would be re-served to
    // every client snapshot until the next supervisor event for that thread.
    markLiveThreadsInactiveOnOpen: true,
    supervisor: {
      appVersion: options.appVersion,
      isDev,
      supervisorPath: options.supervisorPath,
      wslHelpersDir: options.wslHelpersDir,
      ...(options.bundledSkillsDir ? { bundledSkillsDir: options.bundledSkillsDir } : {}),
      ...(options.bundledPluginsDir ? { bundledPluginsDir: options.bundledPluginsDir } : {}),
      secretStorageKey: options.secretStorageKey,
      resolveExtraEnv: () => {
        return durableServices?.getSupervisorExtraEnv() ?? {};
      },
      ...(options.reportError ? { reportError: (error) => options.reportError?.(error) } : {}),
    },
    onEvent: (event) => {
      options.onSupervisorEvent?.(event);
      durableServices?.observeSupervisorEvent(event);
      serverRef?.publishSupervisorEvent(event);
      pushCoordinator?.handleSupervisorEvent(event);
    },
    onReset: () => {
      // Supervisor restarted/exited: in-flight requests are already rejected by
      // the client. Connected remote clients self-heal on their next request or
      // WebSocket reconnect (the replay window covers transient drops).
    },
  });
  const supervisorClient = backendHost.supervisorClient;

  const identity = readOrCreateRemoteAccessIdentity(paths.baseDir);
  const authStore = createPersistentRemoteAuthStore(paths.baseDir);
  const pushStore = new PushRegistrationStore(paths.baseDir);
  const pushGatewayOptions = {
    ...(options.reportError ? { onError: (error: unknown) => options.reportError?.(error) } : {}),
  };
  pushCoordinator = new PushCoordinator({
    store: pushStore,
    sendPush: createPushGateway(pushGatewayOptions),
    getThreads: () => dbGetThreads(),
    getProjects: () => dbGetProjects(),
    getSettings: () => {
      const settings = readSharedSettingsFile(paths.settingsPath);
      return {
        enabled: settings.remotePushEnabled,
        redactContent: settings.remotePushRedactContent,
      };
    },
    getAttributes: () => ({ desktopId: identity.desktopId, desktopName: identity.label }),
  });

  const publishHeadlessProjectsChanged = (): void => {
    serverRef?.publishSupervisorEvent({
      type: "remote-projects-changed",
      projects: remoteProjectCommandResultSchema.parse({ projects: dbGetProjects() }).projects,
    });
  };
  durableServices = new BackendDurableServices({
    appVersion: options.appVersion,
    hostId: identity.desktopId,
    supervisor: supervisorClient,
    getSharedSettings,
    writeSharedSettings: (next) => writeSharedSettingsFile(paths.settingsPath, next),
    sendThreadCommand: () => false,
    publishProjectsChanged: publishHeadlessProjectsChanged,
    hasRendererWindow: false,
    openThreadInUi: () => false,
    notifyUser: () => ({
      delivered: false,
      note: "No Poracode desktop app is connected, so no OS notification could be shown.",
    }),
    checkForUpdate: async () => ({
      supported: false,
      currentVersion: options.appVersion,
      note: "Update checks are not available on the headless server; update the host from the desktop app.",
    }),
    onGitPatch: (patch) => {
      serverRef?.publishSupervisorEvent({ type: "remote-git-state", patch });
    },
  });
  const scheduleService = durableServices.scheduleService;
  const prWatchService = durableServices.prWatchService;
  const gitStateService = durableServices.gitStateService;

  // In dev, advertise loopback by default so the iOS simulator's WebView can
  // reach the server (iOS ATS `NSAllowsLocalNetworking` permits loopback but not
  // a plain-http LAN IP). An explicit env/option override still wins.
  const advertisedHost =
    options.advertisedHost ??
    (isDev
      ? process.env.PORACODE_REMOTE_ACCESS_ADVERTISED_HOST?.trim() || "127.0.0.1"
      : remoteAccessAdvertisedHost({ bindHost: host }));
  const pairingAppUrl = options.pairingAppUrl ?? remoteAccessPairingAppUrl();

  const portForwarding = createPortForwarding({
    bindHost: host,
    remoteAccessPort: port,
  });

  const server = new RemoteAccessServer({
    appVersion: options.appVersion,
    hostMode: "helper",
    ownsSupervisorPersistence: false,
    identity,
    isDev,
    authStore,
    onOversizedEventDropped: ({ type, bytes }) => {
      console.warn(
        `[remote] ${type} event of ${bytes} bytes exceeded the live stream budget; clients asked to resync`,
      );
    },
    host,
    port,
    advertisedHost,
    ...(pairingAppUrl ? { pairingAppUrl } : {}),
    callSupervisor: (name, payload) => supervisorClient.call(name, payload),
    resolveMcpLaunchSnapshot: (projectId) =>
      resolveMcpLaunchSnapshot(getSharedSettings(), dbGetProject(projectId)?.mcpServers ?? []),
    settings: {
      read: () => pickRemoteSettings(readSharedSettingsFile(paths.settingsPath)),
      update: (patch) => pickRemoteSettings(patchSharedSettingsFile(paths.settingsPath, patch)),
    },
    attachments: {
      save: (input) => saveUploadedAttachmentFile(paths, input),
    },
    // `ScheduleService`'s public methods already match the gateway interface,
    // so pass it directly instead of re-wrapping each method.
    schedules: scheduleService,
    prWatches: prWatchService,
    gitState: gitStateService,
    pushRegistrations: {
      webPublicKey: createWebPushPublicKeyResolver(pushGatewayOptions),
      upsert: (registration) => pushStore.upsert(registration),
      remove: (deviceId, routing) => pushStore.remove(deviceId, routing),
    },
    portForward: portForwarding.gateway,
    portProxy: portForwarding.proxy,
  });
  serverRef = server;

  let started = false;
  let relayHandle: RelayHostHandle | null = null;
  return {
    server,
    async start() {
      if (!started) {
        await durableServices?.startIngress();
        durableServices?.startBackgroundServices();
        started = true;
      }
      const info = await server.start();
      // Optionally register with a relay so devices can reach this server across
      // networks. The relay only ever talks to the server's own loopback port,
      // so RemoteAccessServer is unchanged. Requires a secret to claim the id.
      if (options.relayUrl && options.relaySecret && !relayHandle) {
        const localHttpUrl = resolveLocalProxyBase(host, info.httpBaseUrl);
        relayHandle = startRelayHost({
          relayUrl: options.relayUrl,
          serverId: identity.desktopId,
          secret: options.relaySecret,
          label: identity.label,
          localHttpUrl,
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
      // the database (which they may read/write) is torn down — and before
      // the port-forward gateway/proxy are disposed: a POST /api/ports/forward
      // in flight during shutdown must not race a gateway torn down out from
      // under it (the gateway's own `disposed` guard makes this airtight
      // regardless of ordering, but disposing after keeps the two aligned).
      await server.dispose();
      durableServices?.dispose();
      durableServices = null;
      portForwarding.dispose();
      backendHost.dispose();
    },
  };
}
