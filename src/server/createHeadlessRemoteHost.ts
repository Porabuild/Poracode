import { saveUploadedAttachmentFile } from "@/main/attachments/attachmentStorage";
import {
  closeDatabase,
  dbDeleteThread,
  dbGetProject,
  dbGetProjectNotes,
  dbGetProjects,
  dbGetThread,
  dbGetThreads,
  dbInsertScheduleRun,
  dbInterruptScheduleRuns,
  dbMarkLiveThreadsInactive,
  dbUpdateScheduleRun,
  dbUpsertThread,
  initDatabase,
} from "@/main/db";
import { preparePoracodeDataRoot } from "@/main/poracodeData";
import {
  patchSharedSettingsFile,
  readSharedSettingsFile,
  writeSharedSettingsFile,
} from "@/main/sharedSettingsFile";
import { SupervisorClient } from "@/main/supervisor/SupervisorClient";
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
import { isThreadTurnActive, resolveMcpLaunchSnapshot } from "@/shared/contracts";
import { buildRemoteGitTargetInterests } from "@/shared/gitStateInterestPolicy";
import { pickRemoteSettings, remoteProjectCommandResultSchema } from "@/shared/remote";
import { configureSecretStorageKey } from "@/shared/secretStorage";
import {
  createDeviceScheduleService,
  ensureHomeProjectRow,
  ScheduleRunCoordinator,
} from "@/main/schedules";
import {
  AppControlsMcpIngress,
  buildSharedAppControlsIngressDeps,
  createAppControlsSupervisorCaller,
} from "@/main/app-controls";
import {
  buildPrWatchExecutionDeps,
  createDevicePrWatchService,
  type PrWatchService,
} from "@/main/prWatch";
import { createGitStateExecutor, GitStateService } from "@/main/gitState";
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
  /** Directory of app-bundled read-only skills; forwarded to the supervisor. */
  readonly bundledSkillsDir?: string;
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
  /** Forks the supervisor (once) and starts the HTTP/WS server. Idempotent. */
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
  const paths = preparePoracodeDataRoot(options.baseDir);
  initDatabase(paths.dbPath);
  // No agent session survived the restart; without a renderer to run
  // markThreadsInactiveOnLaunch, stale live statuses would be re-served to
  // every client snapshot until the next supervisor event for that thread.
  dbMarkLiveThreadsInactive();
  configureSecretStorageKey(options.secretStorageKey);
  const getSharedSettings = () => readSharedSettingsFile(paths.settingsPath);

  const identity = readOrCreateRemoteAccessIdentity(paths.baseDir);
  const authStore = createPersistentRemoteAuthStore(paths.baseDir);
  const pushStore = new PushRegistrationStore(paths.baseDir);
  const pushGatewayOptions = {
    ...(options.reportError ? { onError: (error: unknown) => options.reportError?.(error) } : {}),
  };
  const pushCoordinator = new PushCoordinator({
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

  // The supervisor's onEvent fires only after start() forks it, by which point
  // `serverRef` is assigned; the null-guard covers construction order only.
  let serverRef: RemoteAccessServer | null = null;
  let appControlsMcpIngress: AppControlsMcpIngress | null = null;
  let prWatchService: PrWatchService | null = null;
  let gitStateService: GitStateService | null = null;
  // Assigned right after the supervisor client below; the `onEvent` tap only
  // fires once the supervisor is started, by which point it is set.
  let scheduleRunCoordinator: ScheduleRunCoordinator | null = null;
  const supervisorClient = new SupervisorClient({
    appVersion: options.appVersion,
    isDev,
    supervisorPath: options.supervisorPath,
    wslHelpersDir: options.wslHelpersDir,
    ...(options.bundledSkillsDir ? { bundledSkillsDir: options.bundledSkillsDir } : {}),
    ...(options.bundledPluginsDir ? { bundledPluginsDir: options.bundledPluginsDir } : {}),
    secretStorageKey: options.secretStorageKey,
    resolveExtraEnv: () => {
      const info = appControlsMcpIngress?.getInfo();
      return info
        ? {
            PORACODE_APP_CONTROLS_MCP_URL: info.url,
            PORACODE_APP_CONTROLS_MCP_TOKEN: info.token,
          }
        : {};
    },
    ...(options.reportError ? { reportError: (error) => options.reportError?.(error) } : {}),
    onEvent: (event) => {
      options.onSupervisorEvent?.(event);
      appControlsMcpIngress?.observeSupervisorEvent(event);
      prWatchService?.observeSupervisorEvent(event);
      gitStateService?.observeSupervisorEvent(event);
      scheduleRunCoordinator?.observeSupervisorEvent(event);
      serverRef?.publishSupervisorEvent(event);
      pushCoordinator.handleSupervisorEvent(event);
    },
    onReset: () => {
      // Supervisor restarted/exited: in-flight requests are already rejected by
      // the client. Connected remote clients self-heal on their next request or
      // WebSocket reconnect (the replay window covers transient drops) — except
      // the cached background-task levels, which no `thread-exited` drains and
      // which would otherwise shadow the fresh supervisor's live reads forever.
      serverRef?.clearBackgroundTaskLevels();
    },
  });
  const scheduleCoordinator = new ScheduleRunCoordinator({
    startThread: (payload) => supervisorClient.call("startThread", payload),
    getAgentStatuses: (wslDistros) => supervisorClient.call("getAgentStatuses", { wslDistros }),
    // Headless has no desktop renderer to mirror to; the DB thread row (written
    // below) is the source of truth and connected remote clients pick it up.
    sendThreadCommand: () => false,
    ensureHomeProject: ensureHomeProjectRow,
    getProject: dbGetProject,
    getSharedSettings,
    upsertThread: dbUpsertThread,
    deleteThread: dbDeleteThread,
    threadExists: (threadId) => dbGetThread(threadId) != null,
    insertRun: dbInsertScheduleRun,
    updateRun: dbUpdateScheduleRun,
  });
  scheduleRunCoordinator = scheduleCoordinator;
  const scheduleService = createDeviceScheduleService({
    runTask: (task) => scheduleCoordinator.runScheduleAsThread(task),
    onStartupInterrupted: (scheduleId) =>
      dbInterruptScheduleRuns(scheduleId, new Date().toISOString()),
  });
  const publishHeadlessProjectsChanged = (): void => {
    serverRef?.publishSupervisorEvent({
      type: "remote-projects-changed",
      projects: remoteProjectCommandResultSchema.parse({ projects: dbGetProjects() }).projects,
    });
  };
  const sharedAppControlsDeps = buildSharedAppControlsIngressDeps({
    call: (name, payload) => supervisorClient.call(name, payload),
    // Headless has no desktop renderer to mirror to; the DB thread row is the
    // source of truth and connected remote clients pick it up.
    sendThreadCommand: () => false,
    getSharedSettings,
    publishProjectsChanged: publishHeadlessProjectsChanged,
  });
  prWatchService = createDevicePrWatchService({
    getProject: dbGetProject,
    getPrForBranch: (project, branch) =>
      supervisorClient.call("ghGetPrForBranch", {
        projectLocation: project.location,
        branch,
      }),
    getPrDetails: (project, prNumber) =>
      supervisorClient
        .call("ghGetPrDetails", { projectLocation: project.location, prNumber })
        .then((result) => result.details),
    getPrReviewThreads: (project, prNumber) =>
      supervisorClient
        .call("ghGetPrReviewComments", { projectLocation: project.location, prNumber })
        .then((result) => result.threads),
    getMergeMethod: () => getSharedSettings().prMergeMethod,
    mergePr: (project, prNumber, method) =>
      supervisorClient.call("ghMergePr", {
        projectLocation: project.location,
        prNumber,
        method,
        admin: false,
      }),
    // Headless has no renderer; connected remote clients read PR state from the
    // git-state snapshot, so the watch loop's observations go straight there.
    onPrObserved: (observedWatch, pr, details) =>
      gitStateService?.applyObservedPullRequest(observedWatch, pr, details),
    createThread: sharedAppControlsDeps.createThread,
    isThreadActive: (threadId) => {
      const status = dbGetThread(threadId)?.status;
      return status !== undefined && isThreadTurnActive(status);
    },
    ...buildPrWatchExecutionDeps({
      call: (name, payload) => supervisorClient.call(name, payload),
      getSharedSettings,
    }),
  });
  gitStateService = new GitStateService({
    hostId: identity.desktopId,
    executor: createGitStateExecutor((name, payload) => supervisorClient.call(name, payload)),
    getProject: dbGetProject,
    onPatch: (patch) => {
      serverRef?.publishSupervisorEvent({ type: "remote-git-state", patch });
    },
  });
  appControlsMcpIngress = new AppControlsMcpIngress({
    scheduleService,
    getThread: dbGetThread,
    getThreads: () => dbGetThreads(),
    getProjects: () => dbGetProjects(),
    getProject: dbGetProject,
    getProjectNotes: dbGetProjectNotes,
    ...sharedAppControlsDeps,
    settings: {
      read: () => readSharedSettingsFile(paths.settingsPath),
      // Headless has no desktop renderer to notify; connected remote clients
      // re-read settings on their next request. The DB/settings file is the
      // source of truth.
      write: (next) => writeSharedSettingsFile(paths.settingsPath, next),
    },
    getAppInfo: () => ({
      version: options.appVersion,
      platform: process.platform,
      hasRendererWindow: false,
    }),
    supervisor: createAppControlsSupervisorCaller((name, payload) =>
      supervisorClient.call(name, payload),
    ),
    // No renderer headless: metadata mutations and UI focus route through the
    // desktop store, which isn't present here. `emitRemoteThreadCommand` reports
    // `false` so the tool falls back to writing the DB row directly (the
    // headless source of truth); `openThreadInUi` reports `false` (nothing to
    // focus). Connected remote clients pick up the DB change on their next poll.
    emitRemoteThreadCommand: () => false,
    openThreadInUi: () => false,
    // The headless host has no display and no auto-updater, so both report an
    // honest not-available result instead of silently succeeding.
    notifyUser: () => ({
      delivered: false,
      note: "No Poracode desktop app is connected, so no OS notification could be shown.",
    }),
    checkForUpdate: async () => ({
      supported: false,
      currentVersion: options.appVersion,
      note: "Update checks are not available on the headless server; update the host from the desktop app.",
    }),
  });

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
      remove: (deviceId) => pushStore.remove(deviceId),
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
        await appControlsMcpIngress?.start();
        supervisorClient.start(paths.baseDir);
        scheduleService.start();
        prWatchService?.start();
        gitStateService?.start();
        const gitWarmupInterests = buildRemoteGitTargetInterests(dbGetThreads(), {
          includeRecentFallback: true,
        });
        if (gitWarmupInterests.length > 0) {
          void gitStateService?.refreshInterests(gitWarmupInterests, { fetchRemote: true });
        }
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
      scheduleService.dispose();
      prWatchService?.dispose();
      prWatchService = null;
      gitStateService?.dispose();
      gitStateService = null;
      appControlsMcpIngress?.dispose();
      appControlsMcpIngress = null;
      portForwarding.dispose();
      supervisorClient.dispose();
      closeDatabase();
    },
  };
}
