import { randomBytes } from "node:crypto";
import { saveUploadedAttachmentFile } from "@/host/attachments/attachmentStorage";
import { dbGetProject, dbGetProjects, dbGetThreads } from "@/host/db";
import { readSharedSettingsFile } from "@/host/sharedSettingsFile";
import { toErrorMessage } from "@/shared/errorMessage";
import { resolvePoracodePaths } from "@/shared/poracodePaths";
import {
  pickRemoteSettings,
  type RemoteAccessPairingInfo,
  type RemoteGitSummaries,
} from "@/shared/remote";
import type { SharedSettings } from "@/shared/settings";
import { resolveMcpLaunchSnapshot } from "@/shared/contracts";
import { createPersistentRemoteAuthStore } from "@/host/remote/auth";
import {
  DEFAULT_REMOTE_ACCESS_HOST,
  classifyBindHostExposure,
  remoteAccessAdvertisedHost,
  remoteAccessHost,
  remoteAccessPairingAppUrl,
  remoteForwardBaseUrl,
  resolveRemoteAccessPort,
} from "@/host/remote/config";
import { readOrCreateRemoteAccessIdentity } from "@/host/remote/identity";
import { createForwardOriginIdentity } from "@/host/remote/portForward/forwardOriginIdentity";
import { readOrCreateForwardOriginSecret } from "@/host/remote/portForward/forwardOriginSecret";
import { setImagePreviewGenerator } from "@/host/remote/server/imagePreview";
import {
  createPortForwarding,
  type PortForwarding,
} from "@/host/remote/portForward/portForwarding";
import {
  createPushGateway,
  createWebPushPublicKeyResolver,
  PushCoordinator,
  PushRegistrationStore,
} from "@/host/remote/push";
import { RemoteAccessServer, type RemoteAccessServerInfo } from "@/host/remote/RemoteAccessServer";
import { RemoteBrowserGateway } from "@/host/remote/RemoteBrowserGateway";
import type { RemoteMcpSettingsGateway } from "@/host/remote/RemoteMcpSettingsGateway";
import { createRemoteAuditLog } from "@/host/remote/server/auditLog";
import {
  disposeAttemptServer,
  type RemoteAccessRetirements,
  type RemoteAccessStartAttempt,
} from "@/host/remote/remoteAccessLifecycle";
import {
  createMdnsAdvertiser,
  shouldAdvertiseMdns,
  type MdnsAdvertiser,
} from "@/host/remote/mdnsAdvertiser";
import {
  PRODUCTION_HOSTED_APP_URLS,
  PRODUCTION_PAIRING_APP_URL,
  RemoteAccessStartSupersededError,
  redactPairingUrlForLog,
  remoteAccessStartupDiagnostic,
  type DesktopRemoteAccessControllerOptions,
} from "./desktopRemoteAccessControllerTypes";

/** Mutable controller fields closed over by remote-access startup. */
export interface DesktopRemoteAccessStartRefs {
  disposed: boolean;
  remoteAccessGeneration: number;
  remoteAccessStartAttempt: RemoteAccessStartAttempt | null;
  remoteAccessServer: RemoteAccessServer | null;
  runningLoopbackOnly: boolean;
  pushCoordinator: PushCoordinator | null;
  mdnsAdvertiser: MdnsAdvertiser | null;
  portForwarding: PortForwarding | null;
  remoteTailscaleServeActiveUrl: string | null;
  remoteGitSummaries: RemoteGitSummaries;
}

export interface DesktopRemoteAccessStartContext {
  readonly options: DesktopRemoteAccessControllerOptions;
  readonly refs: DesktopRemoteAccessStartRefs;
  readonly retirements: RemoteAccessRetirements;
  readonly pushStore: PushRegistrationStore;
  readonly mcpSettings: RemoteMcpSettingsGateway;
  readonly commitSettingsPatch: (patch: {
    [K in keyof SharedSettings]?: SharedSettings[K] | undefined;
  }) => Promise<SharedSettings>;
  readonly isCurrentStartAttempt: (attempt: RemoteAccessStartAttempt) => boolean;
  readonly stopMdnsAdvertiser: () => Promise<void>;
  readonly resolveAdvertisedBaseUrl: (
    port: number,
  ) => Promise<{ advertisedBaseUrl?: string; tailscaleServeUrl?: string }>;
  readonly teardownAttemptTailscaleServe: (attempt: RemoteAccessStartAttempt) => Promise<void>;
  readonly getPairingInfo: () => RemoteAccessPairingInfo;
  readonly prewarmGitStateOnce: () => void;
  readonly clearEventInterests: () => void;
}

export async function performDesktopRemoteAccessStart(
  context: DesktopRemoteAccessStartContext,
  attempt: RemoteAccessStartAttempt,
): Promise<RemoteAccessServerInfo> {
  const {
    options,
    refs,
    retirements,
    pushStore,
    mcpSettings,
    commitSettingsPatch,
    isCurrentStartAttempt,
    stopMdnsAdvertiser,
    resolveAdvertisedBaseUrl,
    teardownAttemptTailscaleServe,
    getPairingInfo,
  } = context;
  try {
    if (!isCurrentStartAttempt(attempt)) throw new RemoteAccessStartSupersededError();
    await retirements.drain();
    if (!isCurrentStartAttempt(attempt)) throw new RemoteAccessStartSupersededError();

    refs.remoteTailscaleServeActiveUrl = null;
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
      refs.mdnsAdvertiser = createMdnsAdvertiser(
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
      refs.mdnsAdvertiser.start();
    };
    // Loopback-only never advertises: no Tailscale serve, no custom URL.
    const advertisedResolution = attempt.loopbackOnly ? {} : await resolveAdvertisedBaseUrl(port);
    attempt.tailscaleServeUrl = advertisedResolution.tailscaleServeUrl ?? null;
    if (!isCurrentStartAttempt(attempt)) throw new RemoteAccessStartSupersededError();
    refs.remoteTailscaleServeActiveUrl = attempt.tailscaleServeUrl;
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
    refs.portForwarding ??= createPortForwarding({
      bindHost: remoteHost,
      remoteAccessPort: port,
      ...(forwardOrigin ? { forwardOrigin } : {}),
    });
    attempt.forwarding = refs.portForwarding;
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
    refs.pushCoordinator = coordinator;
    setImagePreviewGenerator(options.imagePreviewGenerator ?? null);
    const server: RemoteAccessServer = new RemoteAccessServer({
      appVersion: options.appVersion,
      ...(options.environments
        ? environmentRemoteAccessOptions(options.environments, authStore, () => {
            const info = server.getInfo();
            if (!info) throw new Error("Environment parent listener is not ready.");
            return info;
          })
        : {}),
      identity,
      ...(options.hostCapabilities ? { hostCapabilities: options.hostCapabilities } : {}),
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
      ...(options.peekResourceAdmissionStatus
        ? { peekResourceAdmissionStatus: options.peekResourceAdmissionStatus }
        : {}),
      truncateThreadRuntime: options.truncateThreadRuntime,
      ...(options.runtimeHistoryGap ? { runtimeHistoryGap: options.runtimeHistoryGap } : {}),
      ...(options.revertCheckpoint ? { revertCheckpoint: options.revertCheckpoint } : {}),
      ...(options.experimentAuthority ? { experimentAuthority: options.experimentAuthority } : {}),
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
      portForward: refs.portForwarding.gateway,
      portProxy: refs.portForwarding.proxy,
      ...(forwardOrigin
        ? {
            forwardOrigin,
            // Per-instance credential the relay v2 local adapter presents
            // over loopback for trusted forward dispatch.
            forwardDispatchKey: randomBytes(32).toString("base64url"),
          }
        : {}),
      gitSummaries: () => refs.remoteGitSummaries,
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
      // Host-local project writes that do not pass through the HTTP command
      // routes (project-scoped MCP settings) reach `notifyProjectStateChanged`,
      // which the desktop composition wires to the bounded
      // `remote-projects-changed` WS membership event. No full Project[] relay
      // crosses the backend→main hop anymore, so the route-level
      // `onProjectsChanged` mirror hook is intentionally not wired here.
    });
    attempt.server = server;
    refs.remoteAccessServer = server;
    const serverStartPromise = server.start();
    attempt.serverStartPromise = serverStartPromise;
    const info = await serverStartPromise;
    if (!isCurrentStartAttempt(attempt)) throw new RemoteAccessStartSupersededError();
    refs.runningLoopbackOnly = attempt.loopbackOnly;
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
    if (!refs.disposed) {
      await teardownAttemptTailscaleServe(attempt);
    }
    if (refs.remoteAccessServer === attempt.server) {
      refs.remoteAccessServer = null;
      refs.runningLoopbackOnly = false;
    }
    if (refs.pushCoordinator === attempt.coordinator) {
      refs.pushCoordinator = null;
    }
    if (refs.portForwarding === attempt.forwarding) {
      refs.portForwarding = null;
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
    if (refs.remoteAccessStartAttempt === attempt) {
      refs.remoteAccessStartAttempt = null;
    }
  }
}

export function startRemoteAccessServer(
  context: DesktopRemoteAccessStartContext,
  loopbackOnly: boolean,
): Promise<RemoteAccessServerInfo> {
  const { refs, retirements, prewarmGitStateOnce, clearEventInterests } = context;
  if (refs.disposed) {
    return Promise.reject(new Error("Remote access controller is disposed."));
  }
  prewarmGitStateOnce();
  const runningInfo = refs.remoteAccessServer?.getInfo();
  // A settled running server satisfies the request only when its bind mode
  // already matches: a loopback-only always-on instance must be REPLACED by
  // an enabling start (wide bind/advertised URL), and an enabled server
  // already covers the loopback role.
  if (runningInfo && refs.runningLoopbackOnly === loopbackOnly) return Promise.resolve(runningInfo);
  if (runningInfo && refs.runningLoopbackOnly !== loopbackOnly) {
    // Mode switch (enable upgrade): retire the settled loopback-only
    // instance, then start its replacement in this generation.
    const stale = refs.remoteAccessServer;
    refs.remoteAccessServer = null;
    refs.runningLoopbackOnly = false;
    return retirements
      .run([() => (stale ? stale.dispose() : undefined), clearEventInterests])
      .catch(() => undefined)
      .then(() => {
        if (refs.disposed) throw new Error("Remote access controller is disposed.");
        return startRemoteAccessServer(context, loopbackOnly);
      });
  }
  if (refs.remoteAccessStartAttempt) {
    if (
      !refs.remoteAccessStartAttempt.cancelled &&
      refs.remoteAccessStartAttempt.loopbackOnly === loopbackOnly
    ) {
      return refs.remoteAccessStartAttempt.promise;
    }
    const queuedGeneration = refs.remoteAccessGeneration;
    return refs.remoteAccessStartAttempt.promise
      .catch(() => undefined)
      .then(() => {
        if (refs.disposed || queuedGeneration !== refs.remoteAccessGeneration) {
          throw new RemoteAccessStartSupersededError();
        }
        return startRemoteAccessServer(context, loopbackOnly);
      });
  }

  let attempt!: RemoteAccessStartAttempt;
  const startPromise = Promise.resolve().then(() =>
    performDesktopRemoteAccessStart(context, attempt),
  );
  attempt = {
    generation: refs.remoteAccessGeneration,
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
  refs.remoteAccessStartAttempt = attempt;
  return startPromise;
}
import { environmentRemoteAccessOptions } from "@/host/remote/environments/environmentRemoteAccessOptions";
