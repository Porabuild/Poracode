import { randomBytes } from "node:crypto";
import { joinRuntimeShutdown } from "@/backend/joinRuntimeShutdown";
import type { BrowserPanelManager } from "../browser";
import { dbGetProject, dbGetProjects, dbGetThread, dbGetThreads, dbUpdateProject } from "../db";
import { readSharedSettingsFile } from "../sharedSettingsFile";
import type { ManagedLoopbackBootstrap } from "@/shared/managedLoopback";
import type { PoracodeDiagnosticTags } from "@/shared/diagnostics/sentryPrivacy";
import type {
  RemoteAccessTailscaleStatus,
  StartTailscaleResult,
  SupervisorEvent,
} from "@/shared/ipc";
import { toErrorMessage } from "@/shared/errorMessage";
import { resolvePoracodePaths, type PoracodePaths } from "@/shared/poracodePaths";
import type { PoracodeChannel } from "@/shared/channel";
import { saveUploadedAttachmentFile } from "../attachments/attachmentStorage";
import {
  pickRemoteSettings,
  type RemoteAccessPairingInfo,
  type RemoteGitSummaries,
} from "@/shared/remote";
import { parsePairingUrlParts } from "@/shared/remote/pairingUrl";
import type { SharedSettings } from "@/shared/settings";
import type { SettingsMutationResult } from "@/shared/settingsTransactions";
import type { UserNotification } from "@/shared/threadNotification";
import type { Project } from "@/shared/contracts";
import { resolveMcpLaunchSnapshot } from "@/shared/contracts";
import { buildRemoteGitTargetInterests } from "@/shared/gitStateInterestPolicy";
import type { ScheduleService } from "../schedules/ScheduleService";
import type { PrWatchService } from "../prWatch";
import type { GitStateService } from "../gitState";
import { createPersistentRemoteAuthStore } from "./auth";
import {
  DEFAULT_REMOTE_ACCESS_HOST,
  classifyBindHostExposure,
  remoteAccessAdvertisedHost,
  remoteAccessHost,
  remoteAccessPairingAppUrl,
  remoteForwardBaseUrl,
  resolveRemoteAccessPort,
} from "./config";
import { readOrCreateRemoteAccessIdentity } from "./identity";
import { createForwardOriginIdentity } from "./portForward/forwardOriginIdentity";
import { readOrCreateForwardOriginSecret } from "./portForward/forwardOriginSecret";
import { setImagePreviewGenerator, type ImagePreviewGenerator } from "./server/imagePreview";
import { getRemoteAccessPairingInfo } from "./pairingInfo";
import { createPortForwarding, type PortForwarding } from "./portForward/portForwarding";
import {
  createPushGateway,
  createWebPushPublicKeyResolver,
  PushCoordinator,
  PushRegistrationStore,
} from "./push";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "./RemoteAccessServer";
import { RemoteBrowserGateway, type RemoteBrowserGatewayLike } from "./RemoteBrowserGateway";
import { createRemoteMcpSettingsGateway } from "./RemoteMcpSettingsGateway";
import { ThreadNotificationPublisher } from "./ThreadNotificationPublisher";
import { createRemoteAuditLog } from "./server/auditLog";
import {
  disposeAttemptServer,
  RemoteAccessRetirements,
  type RemoteAccessStartAttempt,
} from "./remoteAccessLifecycle";
import {
  buildTailscaleHttpsUrl,
  disableTailscaleServe,
  enableTailscaleServe,
  launchTailscaleApp,
  probeTailscaleStatus,
  type TailscaleStatus,
} from "./tailscale";
import { createMdnsAdvertiser, shouldAdvertiseMdns, type MdnsAdvertiser } from "./mdnsAdvertiser";

const PRODUCTION_PAIRING_APP_URL: Record<PoracodeChannel, string> = {
  stable: "https://poracode.com",
  nightly: "https://app-nightly.poracode.com",
};

const PRODUCTION_HOSTED_APP_URLS = [
  "https://app.poracode.com",
  "https://app-nightly.poracode.com",
] as const;

export interface DesktopRemoteAccessControllerOptions {
  readonly appVersion: string;
  readonly channel: PoracodeChannel;
  readonly paths: Pick<PoracodePaths, "baseDir" | "settingsPath">;
  readonly devServerUrl?: string;
  readonly callSupervisor: RemoteAccessServerOptions["callSupervisor"];
  /** Backend-owned truncate: one DB mutation + one `runtime.truncated` publication. */
  readonly truncateThreadRuntime: RemoteAccessServerOptions["truncateThreadRuntime"];
  /** Backend-owned compound checkpoint revert (WS2), refusal-mapped to 409. */
  readonly revertCheckpoint?: RemoteAccessServerOptions["revertCheckpoint"];
  readonly dispatchThreadCommand: NonNullable<RemoteAccessServerOptions["dispatchThreadCommand"]>;
  readonly getBrowserPanelManager?: () => BrowserPanelManager | null;
  readonly browser?: RemoteBrowserGatewayLike;
  /**
   * The composition's settings authority writes. Every patch the controller
   * persists commits through it as scoped compare-and-swap edits; a conflict
   * that survives the bounded rebase rejects loudly instead of silently
   * clobbering the concurrent writer. The committed broadcast happens in the
   * authority's `onCommitted` hook, so there is no separate notify here.
   */
  readonly settingsWrites: {
    commitCompatPatch(patch: {
      [K in keyof SharedSettings]?: SharedSettings[K] | undefined;
    }): Promise<SharedSettings>;
    editSettingsField<F extends keyof SharedSettings>(
      field: F,
      compute: (current: SharedSettings) => SharedSettings[F] | undefined,
    ): Promise<SettingsMutationResult>;
  };
  readonly notifyRemoteAccessPairingChanged: (info: RemoteAccessPairingInfo) => void;
  readonly notifyProjectStateChanged: (projects: readonly Project[]) => void;
  readonly notifyUserNotification?: (notification: UserNotification) => void;
  readonly notifyEventInterestsChanged: NonNullable<
    RemoteAccessServerOptions["onEventInterestsChanged"]
  >;
  readonly reportError: (error: unknown, tags?: PoracodeDiagnosticTags) => void;
  readonly scheduleService: ScheduleService;
  readonly prWatchService: PrWatchService;
  readonly gitStateService: GitStateService;
  readonly updates: NonNullable<RemoteAccessServerOptions["updates"]>;
  readonly imagePreviewGenerator?: ImagePreviewGenerator;
}

export interface DesktopRemoteAccessController {
  getServer(): RemoteAccessServer | null;
  handleSupervisorEvent(event: SupervisorEvent): void;
  /** The supervisor process restarted; its in-session state is gone. */
  handleSupervisorReset(): void;
  updateGitSummaries(summaries: RemoteGitSummaries): void;
  /** Always-on readiness (V5 plan 2.5 completion): starts the server
   * unconditionally — full bind when remote access is enabled, loopback-only
   * otherwise. Resolves once the managed flavor has its loopback server. */
  startIfEnabled(): Promise<void>;
  setEnabled(enabled: boolean): Promise<RemoteAccessPairingInfo>;
  /** The USER-FACING pairing surface: reports `disabled` while only the
   * always-on loopback instance runs, so the server stays undiscoverable. */
  getPairingInfo(): RemoteAccessPairingInfo;
  /** True when the user actually enabled remote access (not the always-on
   * loopback-only instance). QR/advertise surfaces gate on this. */
  isUserEnabled(): boolean;
  /**
   * The managed renderer's attach payload (V5 plan 2.5 completion): resolves
   * only behind readiness — the loopback server is running and a fresh
   * single-use credential is minted BEFORE the renderer asks. `null` when
   * disposed or no server can run.
   */
  getManagedLoopbackBootstrap(): Promise<ManagedLoopbackBootstrap | null>;
  getTailscaleStatus(): Promise<RemoteAccessTailscaleStatus>;
  setTailscaleHttps(enabled: boolean): Promise<RemoteAccessPairingInfo>;
  startTailscale(): Promise<StartTailscaleResult>;
  setAdvertisedUrl(url: string): Promise<RemoteAccessPairingInfo>;
  /** Stop admission and join current and previously retiring remote work. */
  dispose(): Promise<void>;
}

class RemoteAccessStartSupersededError extends Error {
  constructor() {
    super("Remote access startup was superseded.");
    this.name = "RemoteAccessStartSupersededError";
  }
}

const CREDENTIAL_TOKEN_PREFIXES = ["lc_pair_", "lc_access_", "lc_ws_"] as const;

/**
 * Elides the live credential from a pairing URL so the URL is safe for the
 * console log (the headless CLI never prints raw tokens either). Recognized
 * `lc_*_` prefixes are kept so the redacted value still reads as a credential;
 * anything else (or an unparseable URL) is redacted whole.
 */
export function redactPairingUrlForLog(pairingUrl: string): string {
  const parts = parsePairingUrlParts(pairingUrl);
  if (!parts) return "<pairing URL redacted>";
  const prefix = CREDENTIAL_TOKEN_PREFIXES.find((candidate) => parts.token.startsWith(candidate));
  parts.url.hash = `#token=${prefix ?? ""}[redacted]`;
  return parts.url.toString();
}

function remoteAccessStartupDiagnostic(
  error: unknown,
  channel: PoracodeChannel,
): { error: unknown; tags: PoracodeDiagnosticTags } {
  const code =
    typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
      ? error.code
      : null;
  if (code === "EADDRINUSE") {
    const diagnostic = new Error("Remote access server port remained unavailable after retries.");
    diagnostic.name = "RemoteAccessPortConflictError";
    return {
      error: diagnostic,
      tags: {
        "poracode.feature_area": "remote-access",
        "poracode.channel": channel,
        "poracode.platform":
          process.platform === "darwin" ||
          process.platform === "linux" ||
          process.platform === "win32"
            ? process.platform
            : "other",
        "event.origin": "remote-access.listen.port-conflict",
      },
    };
  }
  return { error, tags: { "poracode.feature_area": "remote-access" } };
}

/**
 * Owns remote services for a desktop-managed backend and their restartable state.
 * Construction performs no I/O; callers own boot restoration and final disposal.
 */
export function createDesktopRemoteAccessController(
  options: DesktopRemoteAccessControllerOptions,
): DesktopRemoteAccessController {
  let remoteAccessServer: RemoteAccessServer | null = null;
  let remoteAccessStartAttempt: RemoteAccessStartAttempt | null = null;
  let remoteAccessGeneration = 0;
  /** Whether the settled running server is the loopback-only always-on
   * instance (attempt-scoped while starting, tracked here once settled). */
  let runningLoopbackOnly = false;
  let disposed = false;
  let pushCoordinator: PushCoordinator | null = null;
  // V5 plan item P4: the mDNS advertiser for the TLS-configured lan/tailnet
  // endpoint (native pairing screens list the host; TXT carries the leaf
  // certificate fingerprint for pin-on-first-connect). Failures are contained.
  let mdnsAdvertiser: MdnsAdvertiser | null = null;
  const stopMdnsAdvertiser = (): Promise<void> => {
    const advertiser = mdnsAdvertiser;
    mdnsAdvertiser = null;
    return advertiser ? advertiser.stop() : Promise.resolve();
  };
  /** The gateway/proxy pair is reused across an in-place server restart. */
  let portForwarding: PortForwarding | null = null;
  let remoteTailscaleServeActiveUrl: string | null = null;
  let remoteTailscaleLastError: string | null = null;
  let remoteGitSummaries: RemoteGitSummaries = {};
  let disposePromise: Promise<void> | null = null;
  let gitStatePrewarmed = false;
  const retirements = new RemoteAccessRetirements();
  // Retiring HTTP callbacks and replacement listeners share one lazy cache.
  const pushStore = new PushRegistrationStore(options.paths.baseDir);
  const clearEventInterests = () =>
    options.notifyEventInterestsChanged({
      terminalThreadIds: [],
      runtimeThreadIds: [],
      allRuntimeEvents: false,
    });
  const threadNotifications = new ThreadNotificationPublisher({
    getThread: dbGetThread,
    getProjectName: (projectId) => dbGetProject(projectId)?.name ?? "Project",
    getSettings: () => {
      const settings = readSharedSettingsFile(options.paths.settingsPath);
      return {
        notificationsEnabled: settings.notificationsEnabled,
        notificationStatuses: settings.notificationStatuses,
        notifyL2Cli: settings.notifyL2Cli,
      };
    },
    publish: (notification) => {
      remoteAccessServer?.publishSupervisorEvent({
        type: "remote-user-notification",
        ...notification,
      });
      options.notifyUserNotification?.(notification);
    },
  });

  const prewarmGitStateOnce = (): void => {
    if (gitStatePrewarmed) return;
    gitStatePrewarmed = true;
    const interests = buildRemoteGitTargetInterests(dbGetThreads(), {
      includeRecentFallback: true,
    });
    if (interests.length === 0) return;
    void options.gitStateService.refreshInterests(interests, { fetchRemote: true });
  };

  /** Compat partial patch through the composition's settings authority. The
   * committed broadcast happens in the authority's `onCommitted` hook. */
  const commitSettingsPatch = (patch: {
    [K in keyof SharedSettings]?: SharedSettings[K] | undefined;
  }): Promise<SharedSettings> => options.settingsWrites.commitCompatPatch(patch);

  /**
   * CAS-guarded revert of this controller's own committed write: the field is
   * moved back only while the authority still holds the value we wrote, so a
   * concurrent flip of the same field wins instead of being clobbered by the
   * stale previous value. A revert that cannot commit is reported, but never
   * masks the original failure.
   */
  const revertCommittedSetting = async <
    F extends "remoteAccessTailscaleHttps" | "remoteAccessAdvertisedUrl",
  >(
    field: F,
    written: SharedSettings[F],
    previous: SharedSettings[F],
  ): Promise<void> => {
    const result = await options.settingsWrites.editSettingsField(field, (current) =>
      current[field] === written ? previous : current[field],
    );
    if (result.status !== "committed") {
      options.reportError(new Error(`The ${field} revert did not commit (${result.status}).`), {
        "poracode.feature_area": "remote-access",
      });
    }
  };

  const writeRemoteAccessEnabledSetting = (enabled: boolean): Promise<SharedSettings> =>
    commitSettingsPatch({ remoteAccessEnabled: enabled });

  const mcpSettings = createRemoteMcpSettingsGateway({
    readSettings: () => readSharedSettingsFile(options.paths.settingsPath),
    // Scoped CAS edit of the whole `mcpServers` field, derived from the
    // freshest committed state; a surviving conflict is reported, never
    // written over the concurrent writer (mirrors the headless composition).
    writeGlobalServers: (mcpServers) => {
      void options.settingsWrites
        .editSettingsField("mcpServers", () => mcpServers)
        .then((result) => {
          if (result.status !== "committed") {
            options.reportError(
              new Error(`MCP server settings were not committed (${result.status}).`),
              { "poracode.feature_area": "remote-access" },
            );
          }
        })
        .catch((error: unknown) =>
          options.reportError(error, { "poracode.feature_area": "remote-access" }),
        );
    },
    readProject: dbGetProject,
    writeProject: dbUpdateProject,
    projectsChanged: () => options.notifyProjectStateChanged(dbGetProjects()),
  });

  /** Defensive read-time normalization; the setter rejects invalid input. */
  const normalizeAdvertisedUrlSetting = (raw: string): string | undefined => {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    try {
      const url = new URL(trimmed);
      if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
      return `${url.origin}/`;
    } catch {
      return undefined;
    }
  };

  /** Best-effort Tailscale setup; failure falls through to the next URL tier. */
  const setUpTailscaleServe = async (port: number): Promise<string | undefined> => {
    const status = await probeTailscaleStatus();
    if (status.state !== "running") {
      remoteTailscaleLastError = status.state === "error" ? status.message : null;
      return undefined;
    }
    if (!status.dnsName) {
      remoteTailscaleLastError = "Tailscale MagicDNS name is unavailable.";
      return undefined;
    }
    const result = await enableTailscaleServe(port);
    if (!result.ok) {
      remoteTailscaleLastError = result.message;
      return undefined;
    }
    remoteTailscaleLastError = null;
    return buildTailscaleHttpsUrl(status.dnsName);
  };

  /** env override -> Tailscale HTTPS -> custom URL -> LAN host/port. */
  const resolveAdvertisedBaseUrl = async (
    port: number,
  ): Promise<{ advertisedBaseUrl?: string; tailscaleServeUrl?: string }> => {
    const envAdvertisedHost = process.env.PORACODE_REMOTE_ACCESS_ADVERTISED_HOST?.trim();
    if (envAdvertisedHost) return {};

    const settings = readSharedSettingsFile(options.paths.settingsPath);
    if (settings.remoteAccessTailscaleHttps) {
      const tailscaleUrl = await setUpTailscaleServe(port);
      if (tailscaleUrl) {
        return { advertisedBaseUrl: tailscaleUrl, tailscaleServeUrl: tailscaleUrl };
      }
    } else {
      remoteTailscaleLastError = null;
    }
    const advertisedBaseUrl = normalizeAdvertisedUrlSetting(settings.remoteAccessAdvertisedUrl);
    return advertisedBaseUrl ? { advertisedBaseUrl } : {};
  };

  const isCurrentStartAttempt = (attempt: RemoteAccessStartAttempt): boolean =>
    !disposed &&
    !attempt.cancelled &&
    attempt.generation === remoteAccessGeneration &&
    remoteAccessStartAttempt === attempt;

  /**
   * The user-facing enablement state of the RUNNING (or starting) server. The
   * always-on loopback-only instance is deliberately invisible here: the
   * pairing QR, session list, and refresh flow stay `disabled` until the user
   * actually enables remote access, so a reachable loopback listener never
   * becomes a discoverable advertisement (V5 plan 2.5 completion).
   */
  const isRemoteAccessUserEnabled = (): boolean => {
    const attempt = remoteAccessStartAttempt;
    const server = remoteAccessServer ?? attempt?.server ?? null;
    if (!server) return false;
    if (attempt && !attempt.cancelled) return !attempt.loopbackOnly;
    return !runningLoopbackOnly;
  };

  const teardownAttemptTailscaleServe = (attempt: RemoteAccessStartAttempt): Promise<void> => {
    if (!attempt.tailscaleServeUrl) return Promise.resolve();
    if (attempt.tailscaleTeardownPromise) return attempt.tailscaleTeardownPromise;
    if (remoteTailscaleServeActiveUrl === attempt.tailscaleServeUrl) {
      remoteTailscaleServeActiveUrl = null;
    }
    attempt.tailscaleTeardownPromise = disableTailscaleServe().catch(() => {});
    return attempt.tailscaleTeardownPromise;
  };

  const performRemoteAccessStart = async (
    attempt: RemoteAccessStartAttempt,
  ): Promise<RemoteAccessServerInfo> => {
    try {
      if (!isCurrentStartAttempt(attempt)) throw new RemoteAccessStartSupersededError();
      await retirements.drain();
      if (!isCurrentStartAttempt(attempt)) throw new RemoteAccessStartSupersededError();

      remoteTailscaleServeActiveUrl = null;
      const identity = readOrCreateRemoteAccessIdentity(options.paths.baseDir);
      // The always-on instance pins the LOOPBACK bind regardless of bind-mode
      // env: a disabled desktop must never expose a wide listener just because
      // it is running (V5 plan 2.5 completion).
      const remoteHost = attempt.loopbackOnly ? DEFAULT_REMOTE_ACCESS_HOST : remoteAccessHost();
      const port = await resolveRemoteAccessPort({ host: remoteHost });
      // Dedicated persistent origin secret + configured HTTPS base → the
      // browser-forward child-origin identity. A malformed explicit
      // PORACODE_REMOTE_FORWARD_BASE_URL fails startup loudly; absence only
      // disables browser-origin forwarding (raw TCP keeps working).
      const forwardOrigin = createForwardOriginIdentity({
        baseUrl: remoteForwardBaseUrl(),
        originSecret: readOrCreateForwardOriginSecret(options.paths.baseDir),
        serverId: identity.desktopId,
      });
      const advertisedHost = remoteAccessAdvertisedHost({ bindHost: remoteHost });

      /**
       * V5 plan item P4: when the resolved bind is a TLS-configured `lan` or
       * `tailnet` exposure, advertise the endpoint over mDNS so the native
       * pairing screens can discover it; the TXT record carries the
       * leaf-certificate fingerprint for pin-on-first-connect. Loopback stays
       * silent by default, and advertising is best effort — it can never
       * break serving.
       */
      const maybeAdvertiseMdns = (listenInfo: RemoteAccessServerInfo): void => {
        void stopMdnsAdvertiser();
        // Optional call so minimal test fakes of the server surface stay valid.
        const fingerprint = server.tlsFingerprint?.() ?? null;
        if (!fingerprint) return;
        const decision = shouldAdvertiseMdns({
          mode: classifyBindHostExposure(remoteHost),
          tlsConfigured: true,
        });
        if (!decision.advertise) return;
        let listenPort = port;
        try {
          listenPort = Number(new URL(listenInfo.localHttpBaseUrl).port) || port;
        } catch {
          // Keep the resolved port; the URL is only the precise source.
        }
        mdnsAdvertiser = createMdnsAdvertiser(
          {
            desktopId: identity.desktopId,
            label: identity.label,
            host: advertisedHost,
            port: listenPort,
            tlsFingerprint: fingerprint,
          },
          {
            onError: (error) =>
              options.reportError(error, { "poracode.feature_area": "remote-access" }),
          },
        );
        mdnsAdvertiser.start();
      };
      // Loopback-only never advertises: no Tailscale serve, no custom URL.
      const advertisedResolution = attempt.loopbackOnly ? {} : await resolveAdvertisedBaseUrl(port);
      attempt.tailscaleServeUrl = advertisedResolution.tailscaleServeUrl ?? null;
      if (!isCurrentStartAttempt(attempt)) throw new RemoteAccessStartSupersededError();
      remoteTailscaleServeActiveUrl = attempt.tailscaleServeUrl;
      const configuredPairingAppUrl = remoteAccessPairingAppUrl();
      const pairingAppUrl =
        configuredPairingAppUrl ??
        (options.devServerUrl ? undefined : PRODUCTION_PAIRING_APP_URL[options.channel]);
      const trustedCorsOrigins =
        !configuredPairingAppUrl && !options.devServerUrl ? PRODUCTION_HOSTED_APP_URLS : undefined;
      // In dev, browsers load the canonical client from Vite instead of the built bundle.
      let devWebAppUrl: string | undefined;
      if (options.devServerUrl) {
        const devUrl = new URL("/", options.devServerUrl);
        devUrl.hostname = advertisedHost;
        devWebAppUrl = devUrl.toString();
      }
      const authStore = createPersistentRemoteAuthStore(options.paths.baseDir);
      // It owns live TCP listeners, so rebuild only after a full disable/failure.
      portForwarding ??= createPortForwarding({
        bindHost: remoteHost,
        remoteAccessPort: port,
        ...(forwardOrigin ? { forwardOrigin } : {}),
      });
      attempt.forwarding = portForwarding;
      const pushGatewayOptions = {
        onError: (error: unknown) =>
          options.reportError(error, { "poracode.feature_area": "remote-push" }),
      };
      const webPublicKey = createWebPushPublicKeyResolver(pushGatewayOptions);
      const coordinator = new PushCoordinator({
        store: pushStore,
        sendPush: createPushGateway(pushGatewayOptions),
        getThreads: () => dbGetThreads(),
        getProjects: () => dbGetProjects(),
        getSettings: () => {
          const settings = readSharedSettingsFile(options.paths.settingsPath);
          return {
            enabled: settings.remotePushEnabled,
            redactContent: settings.remotePushRedactContent,
          };
        },
        getAttributes: () => ({ desktopId: identity.desktopId, desktopName: identity.label }),
      });
      attempt.coordinator = coordinator;
      pushCoordinator = coordinator;
      setImagePreviewGenerator(options.imagePreviewGenerator ?? null);
      const server = new RemoteAccessServer({
        appVersion: options.appVersion,
        identity,
        isDev: Boolean(options.devServerUrl),
        ownsSupervisorPersistence: false,
        onEventInterestsChanged: options.notifyEventInterestsChanged,
        onOversizedEventDropped: ({ type, bytes }) => {
          console.warn(
            `[remote] ${type} event of ${bytes} bytes exceeded the live stream budget; clients asked to resync`,
          );
        },
        authStore,
        // Gate 6 item 4.7 (S7): structured audit trail of security-relevant
        // remote events under the desktop's owned root. Write failures are
        // contained by the sink (warn + drop), never the request path.
        audit: createRemoteAuditLog(options.paths.baseDir),
        host: remoteHost,
        port,
        advertisedHost,
        ...(advertisedResolution.advertisedBaseUrl
          ? { advertisedBaseUrl: advertisedResolution.advertisedBaseUrl }
          : {}),
        ...(advertisedResolution.tailscaleServeUrl
          ? { tailscaleHttpBaseUrl: advertisedResolution.tailscaleServeUrl }
          : {}),
        ...(pairingAppUrl ? { pairingAppUrl } : {}),
        ...(trustedCorsOrigins ? { trustedCorsOrigins } : {}),
        ...(devWebAppUrl ? { devWebAppUrl } : {}),
        callSupervisor: options.callSupervisor,
        truncateThreadRuntime: options.truncateThreadRuntime,
        ...(options.revertCheckpoint ? { revertCheckpoint: options.revertCheckpoint } : {}),
        dispatchThreadCommand: options.dispatchThreadCommand,
        resolveMcpLaunchSnapshot: (projectId) => {
          const settings = readSharedSettingsFile(options.paths.settingsPath);
          return resolveMcpLaunchSnapshot(settings, dbGetProject(projectId)?.mcpServers ?? []);
        },
        ...(options.browser
          ? { browser: options.browser }
          : options.getBrowserPanelManager
            ? { browser: new RemoteBrowserGateway(options.getBrowserPanelManager) }
            : {}),
        portForward: portForwarding.gateway,
        portProxy: portForwarding.proxy,
        ...(forwardOrigin
          ? {
              forwardOrigin,
              // Per-instance credential the relay v2 local adapter presents
              // over loopback for trusted forward dispatch.
              forwardDispatchKey: randomBytes(32).toString("base64url"),
            }
          : {}),
        gitSummaries: () => remoteGitSummaries,
        gitState: options.gitStateService,
        settings: {
          read: () => pickRemoteSettings(readSharedSettingsFile(options.paths.settingsPath)),
          // Remote `POST /api/settings` as scoped CAS edits; a surviving
          // conflict rejects the route instead of last-writer-wins (mirrors
          // the headless composition).
          update: async (patch) => pickRemoteSettings(await commitSettingsPatch(patch)),
          readMcpServers: () => mcpSettings.read(),
          commandMcpServers: (command) => mcpSettings.command(command),
          resolveScope: (scope) => mcpSettings.resolveScope(scope),
          resolveServer: (scope, serverId) => mcpSettings.resolveServer(scope, serverId),
        },
        updates: options.updates,
        attachments: {
          save: (input) =>
            saveUploadedAttachmentFile(resolvePoracodePaths(options.paths.baseDir), input),
        },
        // `ScheduleService`'s public methods already match the gateway
        // interface, so pass it directly instead of re-wrapping each method.
        schedules: options.scheduleService,
        prWatches: options.prWatchService,
        pushRegistrations: {
          webPublicKey,
          dispose: () => webPublicKey.dispose?.(),
          upsert: (registration) => pushStore.upsert(registration),
          remove: (deviceId, routing) => pushStore.remove(deviceId, routing),
        },
        onPairingChanged: () => {
          // Gated like getPairingInfo: the loopback-only instance never
          // advertises its pairing state to the renderer UI.
          options.notifyRemoteAccessPairingChanged(getPairingInfo());
        },
        onProjectsChanged: options.notifyProjectStateChanged,
      });
      attempt.server = server;
      remoteAccessServer = server;
      const serverStartPromise = server.start();
      attempt.serverStartPromise = serverStartPromise;
      const info = await serverStartPromise;
      if (!isCurrentStartAttempt(attempt)) throw new RemoteAccessStartSupersededError();
      runningLoopbackOnly = attempt.loopbackOnly;
      if (attempt.loopbackOnly) {
        // Reachable for the co-located renderer, never advertised: no QR line,
        // no pairing URL in the log, and no mDNS record either.
        await stopMdnsAdvertiser();
        console.log("[poracode] loopback remote server ready at %s", info.localHttpBaseUrl);
        return info;
      }
      maybeAdvertiseMdns(info);
      console.log("[poracode] remote access enabled at %s", info.httpBaseUrl);
      // The pairing URL carries its live one-time credential in the fragment;
      // the headless CLI never prints raw tokens, and neither does the desktop.
      console.log("[poracode] remote pairing URL: %s", redactPairingUrlForLog(info.pairingUrl));
      return info;
    } catch (error) {
      let shutdownFailure: unknown;
      await retirements
        .run([() => disposeAttemptServer(attempt), () => attempt.coordinator?.dispose()])
        .catch((failure: unknown) => {
          shutdownFailure = failure;
        });
      // Final application shutdown intentionally leaves `tailscale serve`
      // configured, matching the historical before-quit behavior. An ordinary
      // disable or failed start still tears down a mapping owned by this attempt.
      if (!disposed) {
        await teardownAttemptTailscaleServe(attempt);
      }
      if (remoteAccessServer === attempt.server) {
        remoteAccessServer = null;
        runningLoopbackOnly = false;
      }
      if (pushCoordinator === attempt.coordinator) {
        pushCoordinator = null;
      }
      if (portForwarding === attempt.forwarding) {
        portForwarding = null;
        attempt.forwarding?.dispose();
      }

      if (shutdownFailure)
        throw new AggregateError([error, shutdownFailure], toErrorMessage(error), { cause: error });

      const superseded = !isCurrentStartAttempt(attempt);
      if (!superseded) {
        console.error("[poracode] remote access failed to start:", toErrorMessage(error));
        const diagnostic = remoteAccessStartupDiagnostic(error, options.channel);
        options.reportError(diagnostic.error, diagnostic.tags);
      }
      throw superseded ? new RemoteAccessStartSupersededError() : error;
    } finally {
      if (remoteAccessStartAttempt === attempt) {
        remoteAccessStartAttempt = null;
      }
    }
  };

  const startRemoteAccessServer = (loopbackOnly: boolean): Promise<RemoteAccessServerInfo> => {
    if (disposed) {
      return Promise.reject(new Error("Remote access controller is disposed."));
    }
    prewarmGitStateOnce();
    const runningInfo = remoteAccessServer?.getInfo();
    // A settled running server satisfies the request only when its bind mode
    // already matches: a loopback-only always-on instance must be REPLACED by
    // an enabling start (wide bind/advertised URL), and an enabled server
    // already covers the loopback role.
    if (runningInfo && runningLoopbackOnly === loopbackOnly) return Promise.resolve(runningInfo);
    if (runningInfo && runningLoopbackOnly !== loopbackOnly) {
      // Mode switch (enable upgrade): retire the settled loopback-only
      // instance, then start its replacement in this generation.
      const stale = remoteAccessServer;
      remoteAccessServer = null;
      runningLoopbackOnly = false;
      return retirements
        .run([() => (stale ? stale.dispose() : undefined), clearEventInterests])
        .catch(() => undefined)
        .then(() => {
          if (disposed) throw new Error("Remote access controller is disposed.");
          return startRemoteAccessServer(loopbackOnly);
        });
    }
    if (remoteAccessStartAttempt) {
      if (
        !remoteAccessStartAttempt.cancelled &&
        remoteAccessStartAttempt.loopbackOnly === loopbackOnly
      ) {
        return remoteAccessStartAttempt.promise;
      }
      const queuedGeneration = remoteAccessGeneration;
      return remoteAccessStartAttempt.promise
        .catch(() => undefined)
        .then(() => {
          if (disposed || queuedGeneration !== remoteAccessGeneration) {
            throw new RemoteAccessStartSupersededError();
          }
          return startRemoteAccessServer(loopbackOnly);
        });
    }

    let attempt!: RemoteAccessStartAttempt;
    const startPromise = Promise.resolve().then(() => performRemoteAccessStart(attempt));
    attempt = {
      generation: remoteAccessGeneration,
      promise: startPromise,
      cancelled: false,
      server: null,
      serverStartPromise: null,
      serverDisposalPromise: null,
      forwarding: null,
      coordinator: null,
      tailscaleServeUrl: null,
      tailscaleTeardownPromise: null,
      loopbackOnly,
    };
    remoteAccessStartAttempt = attempt;
    return startPromise;
  };

  /** Best-effort teardown of a Tailscale mapping established by this process. */
  const teardownTailscaleServe = (): Promise<void> => {
    if (!remoteTailscaleServeActiveUrl) return Promise.resolve();
    remoteTailscaleServeActiveUrl = null;
    return disableTailscaleServe().catch(() => {});
  };

  // V5 plan 2.5 completion: the unconditional full "stop" path is gone —
  // disabling DOWNGRADES to the always-on loopback instance
  // ({@link restartRemoteAccessServer}(true)) instead of tearing the server
  // out, so the managed desktop never loses its loopback leg.

  const restartRemoteAccessServer = async (loopbackOnly: boolean): Promise<void> => {
    const restartGeneration = remoteAccessGeneration;
    const starting = remoteAccessStartAttempt;
    if (!remoteAccessServer && !starting) return;
    if (starting) {
      await starting.promise.catch(() => {});
      if (starting.cancelled) return;
    }
    if (disposed || restartGeneration !== remoteAccessGeneration) return;
    const server = remoteAccessServer;
    const coordinator = pushCoordinator;
    remoteAccessServer = null;
    pushCoordinator = null;
    runningLoopbackOnly = false;
    await retirements.run([
      () => server?.dispose(),
      () => coordinator?.dispose(),
      () => stopMdnsAdvertiser(),
      teardownTailscaleServe,
    ]);
    if (disposed || restartGeneration !== remoteAccessGeneration) return;
    try {
      await startRemoteAccessServer(loopbackOnly);
    } catch (error) {
      if (
        error instanceof RemoteAccessStartSupersededError &&
        (disposed || restartGeneration !== remoteAccessGeneration)
      ) {
        return;
      }
      throw error;
    }
  };

  const buildTailscaleStatusResponse = (
    enabled: boolean,
    status: TailscaleStatus,
  ): RemoteAccessTailscaleStatus => {
    const serveActive = remoteTailscaleServeActiveUrl !== null;
    if (status.state === "not-installed") {
      return { enabled, serveActive, daemon: "not-installed" };
    }
    if (status.state === "not-running") {
      return { enabled, serveActive, daemon: "not-running" };
    }
    if (status.state === "needs-login") {
      return { enabled, serveActive, daemon: "needs-login" };
    }
    if (status.state === "error") {
      return { enabled, serveActive, daemon: "error", message: status.message };
    }
    const httpsUrl =
      remoteTailscaleServeActiveUrl ??
      (status.dnsName ? buildTailscaleHttpsUrl(status.dnsName) : undefined);
    return {
      enabled,
      serveActive,
      daemon: "running",
      httpsAvailable: status.httpsAvailable,
      ...(status.dnsName ? { dnsName: status.dnsName } : {}),
      ...(httpsUrl ? { httpsUrl } : {}),
      ...(remoteTailscaleLastError ? { message: remoteTailscaleLastError } : {}),
    };
  };

  const getTailscaleStatus = async (): Promise<RemoteAccessTailscaleStatus> => {
    const enabled = readSharedSettingsFile(options.paths.settingsPath).remoteAccessTailscaleHttps;
    const status = await probeTailscaleStatus();
    return buildTailscaleStatusResponse(enabled, status);
  };

  const setTailscaleHttps = async (enabled: boolean): Promise<RemoteAccessPairingInfo> => {
    const previous = readSharedSettingsFile(options.paths.settingsPath).remoteAccessTailscaleHttps;
    await commitSettingsPatch({ remoteAccessTailscaleHttps: enabled });
    try {
      await restartRemoteAccessServer(false);
    } catch (error) {
      await revertCommittedSetting("remoteAccessTailscaleHttps", enabled, previous);
      throw error;
    }
    return getRemoteAccessPairingInfo(remoteAccessServer);
  };

  const startTailscale = async (): Promise<StartTailscaleResult> => {
    const result = await launchTailscaleApp();
    return result.ok ? { ok: true } : { ok: false, message: result.message };
  };

  const setAdvertisedUrl = async (rawUrl: string): Promise<RemoteAccessPairingInfo> => {
    const trimmed = rawUrl.trim();
    let normalized = "";
    if (trimmed) {
      let url: URL;
      try {
        url = new URL(trimmed);
      } catch {
        throw new Error("Enter a valid URL, for example https://code.example.com.");
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Public URL must start with http:// or https://.");
      }
      if ((url.pathname && url.pathname !== "/") || url.search || url.hash) {
        throw new Error("Public URL must be an origin only, with no path or query.");
      }
      normalized = url.origin;
    }
    const previous = readSharedSettingsFile(options.paths.settingsPath).remoteAccessAdvertisedUrl;
    await commitSettingsPatch({ remoteAccessAdvertisedUrl: normalized });
    try {
      await restartRemoteAccessServer(false);
    } catch (error) {
      await revertCommittedSetting("remoteAccessAdvertisedUrl", normalized, previous);
      throw error;
    }
    return getRemoteAccessPairingInfo(remoteAccessServer);
  };

  const setEnabled = async (enabled: boolean): Promise<RemoteAccessPairingInfo> => {
    if (!enabled) {
      // Persist the disable before downgrading: a settings conflict rejects the
      // call with the server (and the enabled flag) untouched.
      await writeRemoteAccessEnabledSetting(false);
      // V5 plan 2.5 completion: disabling keeps the managed flavor's ALWAYS-ON
      // loopback instance alive — the renderer's unified leg and the loopback
      // bootstrap keep working — but the discoverable (advertised) surface is
      // torn down and pairing info reports `disabled` again. Like the old
      // stop, the downgrade never blocks on in-flight work (a held push, a
      // draining request): it runs in the background and the UI reflects
      // `disabled` immediately.
      void restartRemoteAccessServer(true).catch(() => {
        // The persisted disable already succeeded. Restore the always-on
        // loopback leg in the background; the desktop-IPC relay covers
        // meanwhile.
        void startRemoteAccessServer(true).catch(() => undefined);
      });
      return getPairingInfo();
    }

    await writeRemoteAccessEnabledSetting(true);
    try {
      await startRemoteAccessServer(false);
    } catch (error) {
      if (error instanceof RemoteAccessStartSupersededError) {
        return getPairingInfo();
      }
      throw error;
    }
    return getPairingInfo();
  };

  /**
   * Readiness (V5 plan 2.5 completion): the managed desktop ALWAYS ends up
   * with a loopback-bound remote server. When remote access is enabled the
   * full instance covers it; otherwise a loopback-only instance starts so the
   * co-located renderer can always attach (reachable, not discoverable).
   * Startup failure is contained (reported, retried on the next readiness
   * call) — the desktop-IPC relay stays the fallback leg.
   */
  const startIfEnabled = async (): Promise<void> => {
    const enabled = readSharedSettingsFile(options.paths.settingsPath).remoteAccessEnabled === true;
    try {
      await startRemoteAccessServer(!enabled);
    } catch (error) {
      if (error instanceof RemoteAccessStartSupersededError) return;
    }
  };

  const getPairingInfo = (): RemoteAccessPairingInfo => {
    // The always-on loopback instance is deliberately invisible on the
    // user-facing pairing surface.
    return getRemoteAccessPairingInfo(isRemoteAccessUserEnabled() ? remoteAccessServer : null);
  };

  const getManagedLoopbackBootstrap = async (): Promise<ManagedLoopbackBootstrap | null> => {
    if (disposed) return null;
    // Serialize behind readiness: the renderer may ask while the always-on
    // start is still in flight. The credential mint below happens only once
    // the server is actually serving.
    try {
      await startRemoteAccessServer(
        readSharedSettingsFile(options.paths.settingsPath).remoteAccessEnabled !== true,
      );
    } catch {
      return null;
    }
    if (disposed) return null;
    const server = remoteAccessServer;
    if (!server) return null;
    const credential = server.mintLoopbackRendererCredential();
    if (!credential) return null;
    return {
      endpoint: credential.endpoint,
      pairingUrl: credential.pairingUrl,
    };
  };

  return {
    getServer: () => remoteAccessServer,
    getPairingInfo,
    isUserEnabled: isRemoteAccessUserEnabled,
    getManagedLoopbackBootstrap,
    handleSupervisorEvent: (event) => {
      remoteAccessServer?.publishSupervisorEvent(event);
      pushCoordinator?.handleSupervisorEvent(event);
      threadNotifications.handleSupervisorEvent(event);
    },
    handleSupervisorReset: () => {
      // No `thread-exited` is emitted for the sessions that died with the old
      // supervisor process, so their cached background-task levels would
      // otherwise shadow the fresh live reads forever.
      remoteAccessServer?.clearBackgroundTaskLevels();
      // Follow-up queues are supervisor-owned memory. Clear the remote
      // renderer's rows when that process disappears; otherwise a phone can
      // keep stale items whose next action only fails with item-not-found.
      for (const thread of dbGetThreads()) {
        remoteAccessServer?.publishSupervisorEvent({
          type: "thread-follow-up-queue",
          threadId: thread.id,
          queue: null,
        });
      }
    },
    updateGitSummaries: (summaries) => {
      remoteGitSummaries = summaries;
      remoteAccessServer?.publishSupervisorEvent({
        type: "remote-git-summaries",
        summaries,
      });
    },
    startIfEnabled,
    setEnabled,
    getTailscaleStatus,
    setTailscaleHttps,
    startTailscale,
    setAdvertisedUrl,
    dispose: () => {
      if (disposePromise) return disposePromise;
      const barrier = Promise.withResolvers<void>();
      disposePromise = barrier.promise;
      disposed = true;
      remoteAccessGeneration += 1;
      const attempt = remoteAccessStartAttempt;
      if (attempt) attempt.cancelled = true;
      const server = remoteAccessServer ?? attempt?.server ?? null;
      const coordinator = pushCoordinator ?? attempt?.coordinator ?? null;
      const forwarding = portForwarding;
      remoteAccessServer = null;
      pushCoordinator = null;
      portForwarding = null;
      // Preserve the historical before-quit ordering: start closing the HTTP
      // server, then immediately tear down forwarding, without disabling Serve.
      const currentDisposal = retirements.run([
        () =>
          server
            ? attempt?.server === server
              ? disposeAttemptServer(attempt)
              : server.dispose()
            : undefined,
        () => coordinator?.dispose(),
        () => stopMdnsAdvertiser(),
        clearEventInterests,
        () => forwarding?.dispose(),
      ]);
      const startSettlement = attempt
        ? attempt.promise.catch((error: unknown) => {
            if (!(error instanceof RemoteAccessStartSupersededError)) throw error;
          })
        : Promise.resolve();
      void joinRuntimeShutdown([
        () => currentDisposal,
        () => startSettlement.then(() => undefined),
        () => retirements.drain(),
      ]).then(barrier.resolve, barrier.reject);
      return disposePromise;
    },
  };
}
