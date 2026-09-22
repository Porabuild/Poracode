import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { saveUploadedAttachmentFile } from "@/host/attachments/attachmentStorage";
import {
  dbGetProject,
  dbGetProjects,
  dbGetThread,
  dbGetThreads,
  dbMarkLiveThreadsInactive,
  dbUpdateProject,
} from "@/host/db";
import {
  BackendHostCore,
  RevertCheckpointRefusedError,
  type RetainedStartupCustody,
} from "@/backend/BackendHostCore";
import { BackendDurableServices } from "@/backend/BackendDurableServices";
import { joinRuntimeShutdown } from "@/backend/joinRuntimeShutdown";
import { readSharedSettingsFile } from "@/host/sharedSettingsFile";
import { createPersistentRemoteAuthStore, RemoteHttpError } from "@/host/remote/auth";
import { readOrCreateRemoteAccessIdentity } from "@/host/remote/identity";
import {
  createForwardOriginIdentity,
  type ForwardOriginIdentity,
} from "@/host/remote/portForward/forwardOriginIdentity";
import { readOrCreateForwardOriginSecret } from "@/host/remote/portForward/forwardOriginSecret";
import { createRemoteAuditLog } from "@/host/remote/server/auditLog";
import { createPortForwarding } from "@/host/remote/portForward/portForwarding";
import {
  createPushGateway,
  createWebPushPublicKeyResolver,
  PushCoordinator,
  PushRegistrationStore,
} from "@/host/remote/push";
import { RemoteAccessServer, type RemoteAccessServerInfo } from "@/host/remote/RemoteAccessServer";
import {
  createRuntimeGapAcknowledgedHook,
  createRuntimeHistoryGapPort,
} from "@/host/remote/runtimeHistoryGapComposition";
import { ThreadNotificationPublisher } from "@/host/remote/ThreadNotificationPublisher";
import {
  classifyBindHostExposure,
  remoteAccessAdvertisedHost,
  remoteAccessHost,
  remoteAccessPairingAppUrl,
  remoteForwardBaseUrl,
  resolveRemoteAccessPort,
} from "@/host/remote/config";
import {
  createMdnsAdvertiser,
  shouldAdvertiseMdns,
  type MdnsAdvertiser,
} from "@/host/remote/mdnsAdvertiser";
import { isThreadTurnActive, resolveMcpLaunchSnapshot } from "@/shared/contracts";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "@/shared/remote";
import { startRelayHost, type RelayHostHandle } from "./relay/relayHost";

import type { OwnedHostRuntime } from "@/backend/ownership/HostOwnerController";
import type { HeadlessRemoteHostOptions } from "./createHeadlessRemoteHost";
import { resolveLocalProxyBase } from "./headlessProxyBase";
import { readOwnedHeadlessRelaySecret } from "./headlessRelaySecret";
import { HostControlServer } from "@/backend/ownership/HostControlServer";
import { resolveRunningBuildIdentity } from "./serverUpgradeIdentity";
import {
  composeHeadlessSettingsAuthority,
  type HeadlessSettingsComposition,
} from "./headlessSettingsAuthority";
import { createHeadlessPrMergeEffect } from "./headlessPrWatchMerge";
import { composeHostServices } from "@/host/hostServices/composeHostServices";
import type { SshConnectionManager } from "@/host/ssh/SshConnectionManager";
import {
  composeHostEnvironments,
  type ComposedHostEnvironments,
} from "@/host/environments/composeHostEnvironments";
import { environmentRemoteAccessOptions } from "@/host/remote/environments/environmentRemoteAccessOptions";

import {
  HeadlessCompositionShutdownError,
  UNCOMPOSED_HOST_CAPABILITIES,
  type HeadlessRemoteComposition,
} from "./headlessRemoteCompositionSupport";

export { HeadlessCompositionShutdownError };
export type { HeadlessRemoteComposition };

/** Bounded default for an upgrade candidate waiting for authenticated admission. */
export const DEFAULT_STAGING_ADMISSION_DEADLINE_MS = 15 * 60_000;

export async function composeHeadlessRemoteHost(
  options: HeadlessRemoteHostOptions,
  runtime: OwnedHostRuntime,
): Promise<HeadlessRemoteComposition> {
  options.signal?.throwIfAborted();
  const isDev = options.isDev ?? false;
  const host = options.host ?? remoteAccessHost();
  const port = await resolveRemoteAccessPort({
    host,
    ...(options.port !== undefined ? { port: options.port } : {}),
  });
  const paths = runtime.paths;
  options.signal?.throwIfAborted();
  runtime.lease.assertActive();
  const relaySecret = options.relayUrl
    ? readOwnedHeadlessRelaySecret(runtime, options.relaySecret)
    : undefined;
  const getSharedSettings = () => readSharedSettingsFile(paths.settingsPath);

  // These are assigned after the core is constructed and before its supervisor
  // starts, so the event callback always sees the completed composition.
  let serverRef: RemoteAccessServer | null = null;
  let durableServices: BackendDurableServices | null = null;
  let pushCoordinator: PushCoordinator | null = null;
  let threadNotifications: ThreadNotificationPublisher | null = null;

  let backendHostRef: BackendHostCore | null = null;
  // Set only when the core constructor threw after SQLite opened and its
  // cleanup close was refused: the failed instance never becomes
  // `backendHostRef`, so this handle is the composition's only retryable path
  // to the still-open database.
  let retainedStartupCustody: RetainedStartupCustody | null = null;
  let settingsAuthority: HeadlessSettingsComposition | null = null;
  let control: HostControlServer | null = null;
  // D4 staging admission: a candidate opens its database (running any pending
  // migrations) but holds the remote listener until the upgrader proves and
  // admits this exact build, so a failed qualification cannot have accepted
  // user writes.
  let admissionOpen = options.staging !== true;
  const admissionBarrier = Promise.withResolvers<void>();
  const buildIdentity = options.buildIdentity ?? resolveRunningBuildIdentity();
  let stagingDeadline: ReturnType<typeof setTimeout> | undefined;
  if (!admissionOpen) {
    stagingDeadline = setTimeout(
      () =>
        admissionBarrier.reject(
          new Error("Upgrade staging admission was not granted before the deadline."),
        ),
      options.stagingDeadlineMs ?? DEFAULT_STAGING_ADMISSION_DEADLINE_MS,
    );
    stagingDeadline.unref?.();
  }
  const releaseAdmission = (): void => {
    if (admissionOpen) return;
    admissionOpen = true;
    if (stagingDeadline !== undefined) clearTimeout(stagingDeadline);
    stagingDeadline = undefined;
    admissionBarrier.resolve();
  };
  let portForwardingRef: ReturnType<typeof createPortForwarding> | null = null;
  let relayHandle: RelayHostHandle | null = null;
  // V5 plan item P4: the mDNS advertiser for the TLS-configured lan/tailnet
  // endpoint. Purely additive to serving; every failure is contained.
  let mdnsAdvertiser: MdnsAdvertiser | null = null;
  const stopMdnsAdvertiser = (): Promise<void> => {
    const advertiser = mdnsAdvertiser;
    mdnsAdvertiser = null;
    return advertiser ? advertiser.stop() : Promise.resolve();
  };
  // Same host-service composition the desktop uses (V5 plan 1.1): SSH
  // environments, the Chrome bridge and the computer-use ingress are all
  // Electron-free and therefore compose on the standalone server too. The
  // browser panel and overlays stay desktop-only (no native shell here).
  let hostServicesRef: ReturnType<typeof composeHostServices> | null = null;
  // Captured separately: the dispose join nulls `hostServicesRef` before the
  // SSH step runs, and the desktop-owned shutdown order disposes SSH after
  // the ingress set in its own step.
  let sshRef: SshConnectionManager | null = null;
  let environmentsRef: ComposedHostEnvironments | null = null;
  let stopping = false;
  let disposed = false;
  let starting: Promise<RemoteAccessServerInfo> | null = null;
  let disposal: Promise<void> | null = null;
  const assertRunning = () => {
    options.signal?.throwIfAborted();
    if (stopping) throw new Error("Headless host is shutting down.");
    runtime.lease.assertActive();
  };
  const dispose = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (disposal) return disposal;
    stopping = true;
    if (!admissionOpen) {
      admissionBarrier.reject(new Error("Headless host is shutting down."));
    }
    const barrier = Promise.withResolvers<void>();
    disposal = barrier.promise;
    void joinRuntimeShutdown([
      () => {
        relayHandle?.dispose();
        relayHandle = null;
      },
      () => serverRef?.dispose(),
      // The advertisement names this server's endpoint, so it stops with it.
      () => stopMdnsAdvertiser(),
      () => control?.dispose(),
      () => pushCoordinator?.dispose(),
      async () => {
        const services = hostServicesRef;
        if (!services) return;
        await services.dispose();
        if (hostServicesRef === services) hostServicesRef = null;
      },
      async () => {
        // These share a manager: environment operations must settle before
        // its final owner disposes it. Keep both handles until each join wins,
        // and attempt the manager's strongest cleanup even when the
        // environment handoff rejects: a failed per-connection handoff is not
        // proof that owned SSH children exited, so skipping `ssh.dispose()`
        // would defer that cleanup to process exit. Collect both failures and
        // retain both handles so the outer host owner keeps its lease and
        // database custody and the next dispose retries only what is still
        // outstanding.
        const failures: unknown[] = [];
        const environments = environmentsRef;
        if (environments) {
          try {
            await environments.dispose();
            if (environmentsRef === environments) environmentsRef = null;
          } catch (error) {
            failures.push(error);
          }
        }
        const ssh = sshRef;
        if (ssh) {
          try {
            await ssh.dispose();
            if (sshRef === ssh) sshRef = null;
          } catch (error) {
            failures.push(error);
          }
        }
        if (failures.length > 0) {
          throw new AggregateError(
            failures,
            "The environment handoff and its SSH manager owner did not confirm every join; handles were retained for a retry.",
            { cause: failures[0] },
          );
        }
      },
      () => durableServices?.dispose(),
      // Drains queued authority commits before the lease is released.
      () => settingsAuthority?.dispose(),
      () => backendHostRef?.disposeSupervisor(),
      // Starting admission was closed above. A failed/cancelled start still has
      // to finish before its resources or the owning controller can be released.
      () =>
        starting?.then(
          () => undefined,
          () => undefined,
        ),
    ])
      .then(() => {
        portForwardingRef?.dispose();
        if (retainedStartupCustody) {
          // Failed construction: `backendHostRef` was never assigned and this
          // handle is the only path to the database whose close was refused.
          // Retrying through the same barrier lets a transient refusal close
          // cleanly (so the outer owner can still release); a refusal that
          // persists rejects disposal and keeps the lease with the owner.
          retainedStartupCustody.retryCloseDatabase();
          retainedStartupCustody = null;
        } else {
          backendHostRef?.closeDatabase();
        }
        disposed = true;
        durableServices = null;
        barrier.resolve();
      })
      .catch((error: unknown) => {
        disposal = null;
        barrier.reject(error);
      });
    return disposal;
  };

  try {
    const backendHost = new BackendHostCore({
      baseDir: paths.baseDir,
      dbPath: paths.dbPath,
      // No agent session survived the restart; without a renderer to run
      // markThreadsInactiveOnLaunch, stale live statuses would be re-served to
      // every client snapshot until the next supervisor event for that thread.
      markLiveThreadsInactiveOnOpen: true,
      onStartupCustodyRetained: (custody) => {
        // The failed constructor's cleanup close was refused; the dispose
        // barrier below retries it before the outer owner may be released.
        retainedStartupCustody = custody;
      },
      supervisor: {
        appVersion: options.appVersion,
        isDev,
        supervisorPath: options.supervisorPath,
        wslHelpersDir: options.wslHelpersDir,
        ...(options.bundledSkillsDir ? { bundledSkillsDir: options.bundledSkillsDir } : {}),
        ...(options.bundledPluginsDir ? { bundledPluginsDir: options.bundledPluginsDir } : {}),
        secretStorageKey: runtime.secretStorageKey,
        resolveExtraEnv: () => {
          // Composed host services (chrome/computer-use MCP) plus the durable
          // app-controls ingress share one supervisor env merge.
          return {
            ...hostServicesRef?.supervisorExtraEnv(),
            ...durableServices?.getSupervisorExtraEnv(),
          };
        },
        ...(options.reportError ? { reportError: (error) => options.reportError?.(error) } : {}),
      },
      onEvent: (event) => {
        if (durableServices?.observeSupervisorEvent(event)) return;
        options.onSupervisorEvent?.(event);
        serverRef?.publishSupervisorEvent(event);
        pushCoordinator?.handleSupervisorEvent(event);
        threadNotifications?.handleSupervisorEvent(event);
      },
      onSupervisorOutputShed: (threadIds) => {
        // The supervisor shed terminal-output batches in transit; remote
        // clients must resync those threads' terminal output from the
        // supervisor, which keeps the authoritative PTY bytes.
        options.reportError?.(
          new Error(
            `supervisor shed terminal output for ${threadIds.length} thread(s) under IPC backpressure`,
          ),
        );
        serverRef?.broadcastResyncRequired(
          "Terminal output was shed under backpressure; resynchronize from the host.",
        );
      },
      onRuntimeGapAcknowledged: createRuntimeGapAcknowledgedHook(() => serverRef),
      onReset: () => {
        // Match the desktop backend: a supervisor crash leaves durable rows
        // `working`, and without a renderer launch sweep those statuses stay
        // live. Clients then try to steer a session that no longer exists.
        const interrupted = dbGetThreads().filter((thread) => isThreadTurnActive(thread.status));
        dbMarkLiveThreadsInactive();
        // No `thread-exited` is emitted for the sessions that died with the old
        // supervisor process, so their cached background-task levels would
        // otherwise shadow the fresh supervisor's live reads forever.
        serverRef?.clearBackgroundTaskLevels();
        for (const thread of dbGetThreads()) {
          serverRef?.publishSupervisorEvent({
            type: "thread-follow-up-queue",
            threadId: thread.id,
            queue: null,
          });
        }
        for (const thread of interrupted) {
          const event = {
            type: "thread-state" as const,
            threadId: thread.id,
            status: "inactive" as const,
            attention: "none" as const,
            canResumeWithConfig: thread.canResumeWithConfig,
          };
          options.onSupervisorEvent?.(event);
          durableServices?.observeSupervisorEvent(event);
          serverRef?.publishSupervisorEvent(event);
          pushCoordinator?.handleSupervisorEvent(event);
          threadNotifications?.handleSupervisorEvent(event);
        }
      },
    });
    backendHostRef = backendHost;
    const supervisorClient = backendHost.supervisorClient;

    // V5 plan 1.1 (H3): the SAME composeHostServices the desktop startup
    // calls. The standalone host declares the SSH/Chrome/computer-use inputs
    // it ships with; there is no native shell here, so the embedded browser
    // panel and overlays stay desktop-only. Failures after this point dispose
    // the partial composition through the shared dispose barrier below.
    options.signal?.throwIfAborted();
    runtime.lease.assertActive();
    const sshInputs = options.agentPluginsDir
      ? {
          mainBundleDir: dirname(options.supervisorPath),
          agentPluginsDir: options.agentPluginsDir,
          wslHelpersDir: options.wslHelpersDir,
          ...(options.bundledSkillsDir ? { bundledSkillsDir: options.bundledSkillsDir } : {}),
          ...(options.bundledPluginsDir ? { bundledPluginsDir: options.bundledPluginsDir } : {}),
        }
      : null;
    const hostServices = composeHostServices({
      baseDir: paths.baseDir,
      getSharedSettings,
      ssh: sshInputs,
      computerUse: options.computerUseHelperRoot
        ? {
            helperRootDir: options.computerUseHelperRoot,
            stateDir: join(paths.baseDir, "computer-use"),
          }
        : null,
      // The owned server key is file-based custody, not OS-backed sealing.
      nativeSecrets: false,
      // This composition always builds the port-forward gateway below.
      portForward: true,
      autoUpdate: false,
      osNotifications: false,
    });
    hostServicesRef = hostServices;
    sshRef = hostServices.sshConnectionManager;
    if (sshInputs && sshRef) {
      environmentsRef = await composeHostEnvironments({
        lease: runtime.lease,
        baseDir: paths.baseDir,
        inputs: sshInputs,
        borrowSshManager: sshRef,
      });
    }

    const publishHeadlessProjectsChanged = (): void => {
      // Declaration-aware: the catalog is read only when a legacy subscriber or
      // the embedding callback actually consumes the full list.
      serverRef?.publishCatalogChanged();
    };
    // One settings authority for the owned root: every settings writer commits through it.
    options.signal?.throwIfAborted();
    runtime.lease.assertActive();
    settingsAuthority = await composeHeadlessSettingsAuthority(runtime, {
      readSettings: getSharedSettings,
      readProject: dbGetProject,
      writeProject: dbUpdateProject,
      projectsChanged: publishHeadlessProjectsChanged,
      ...(options.reportError ? { reportError: options.reportError } : {}),
    });
    const settings = settingsAuthority;

    const identity = readOrCreateRemoteAccessIdentity(paths.baseDir);
    const authStore = createPersistentRemoteAuthStore(paths.baseDir);
    const pushStore = new PushRegistrationStore(paths.baseDir);
    const pushGatewayOptions = {
      ...(options.reportError ? { onError: (error: unknown) => options.reportError?.(error) } : {}),
    };
    const webPublicKey = createWebPushPublicKeyResolver(pushGatewayOptions);
    pushCoordinator = new PushCoordinator({
      store: pushStore,
      sendPush: createPushGateway(pushGatewayOptions),
      getThreads: () => dbGetThreads(),
      getProjects: () => dbGetProjects(),
      getSettings: () => settings.pushSettings(),
      getAttributes: () => ({ desktopId: identity.desktopId, desktopName: identity.label }),
    });
    threadNotifications = new ThreadNotificationPublisher({
      getThread: dbGetThread,
      getProjectName: (projectId) => dbGetProject(projectId)?.name ?? "Project",
      getSettings: () => settings.threadNotificationSettings(),
      publish: (notification) => {
        serverRef?.publishSupervisorEvent({
          type: "remote-user-notification",
          ...notification,
        });
      },
    });

    durableServices = new BackendDurableServices({
      appVersion: options.appVersion,
      hostId: identity.desktopId,
      supervisor: supervisorClient,
      getSharedSettings,
      // The attachments root this process owns; its durable services run the
      // one deleted-thread attachment reclaimer for it.
      attachmentsDir: paths.attachmentsDir,
      ...(options.reportError ? { reportError: options.reportError } : {}),
      writeSharedSettings: (next) => settings.writeSharedSettings(next),
      editSettingsField: (field, compute) => settings.editSettingsField(field, compute),
      // Durable auto-done effect the desktop renderer performs from `pr-watch-merged`.
      onPrMerged: createHeadlessPrMergeEffect({
        getSharedSettings,
        publishThreadsChanged: (threadIds) => {
          serverRef?.publishThreadsChanged(threadIds);
        },
        ...(options.reportError ? { reportError: options.reportError } : {}),
      }),
      sendThreadCommand: () => false,
      publishProjectsChanged: publishHeadlessProjectsChanged,
      publishThreadsChanged: (threadIds) => {
        serverRef?.publishThreadsChanged(threadIds);
      },
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

    // Dedicated persistent origin secret + configured HTTPS base → the
    // browser-forward child-origin identity. Created always (the relay v2
    // registration will carry the same secret); a malformed explicit
    // PORACODE_REMOTE_FORWARD_BASE_URL fails startup loudly, absence only
    // disables browser-origin forwarding (raw TCP keeps working).
    const forwardOriginSecret = readOrCreateForwardOriginSecret(paths.baseDir);
    const forwardDispatchKey = randomBytes(32).toString("base64url");
    let relayForwardOrigin: ForwardOriginIdentity | null = null;
    let relayPublicOrigin: string | null = null;
    const forwardOrigin = createForwardOriginIdentity({
      baseUrl: remoteForwardBaseUrl(),
      originSecret: forwardOriginSecret,
      serverId: identity.desktopId,
    });

    const portForwarding = createPortForwarding({
      bindHost: host,
      remoteAccessPort: port,
      ...(forwardOrigin ? { forwardOrigin } : {}),
      ...(options.forwardablePorts ? { forwardablePorts: options.forwardablePorts } : {}),
    });
    portForwardingRef = portForwarding;

    const server: RemoteAccessServer = new RemoteAccessServer({
      appVersion: options.appVersion,
      hostMode: "helper",
      hostCapabilities: hostServices.capabilities,
      ownsSupervisorPersistence: false,
      identity,
      isDev,
      authStore,
      ...(environmentsRef
        ? environmentRemoteAccessOptions(environmentsRef.runtimeService, authStore, () => {
            const info = server.getInfo();
            if (!info) throw new Error("Environment parent listener is not ready.");
            return info;
          })
        : {}),
      // Gate 6 item 4.7 (S7): structured audit trail of security-relevant
      // remote events under the owned root. Write failures are contained by
      // the sink (warn + drop), so the trail can never break serving.
      audit: createRemoteAuditLog(runtime.lease.paths.dataRoot),
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
      peekResourceAdmissionStatus: () => supervisorClient.peekResourceAdmissionStatus(),
      // B1: the durable gap/notice store is this composition's own backend
      // host, so the capability is advertised and the routes serve real state.
      runtimeHistoryGap: createRuntimeHistoryGapPort(backendHost),
      truncateThreadRuntime: (threadId, itemId) => {
        backendHost.truncateThreadRuntime(threadId, itemId);
      },
      revertCheckpoint: async (input) => {
        try {
          return await backendHost.revertCheckpoint(input);
        } catch (error) {
          if (error instanceof RevertCheckpointRefusedError) {
            throw new RemoteHttpError("thread_turn_active", error.message, 409);
          }
          throw error;
        }
      },
      resolveMcpLaunchSnapshot: (projectId) =>
        resolveMcpLaunchSnapshot(getSharedSettings(), dbGetProject(projectId)?.mcpServers ?? []),
      settings: settings.remoteSettingsGateway(settings.mcpSettings),
      attachments: {
        save: (input) => saveUploadedAttachmentFile(paths, input),
      },
      // `ScheduleService`'s public methods already match the gateway interface,
      // so pass it directly instead of re-wrapping each method.
      schedules: scheduleService,
      prWatches: prWatchService,
      gitState: gitStateService,
      pushRegistrations: {
        webPublicKey,
        dispose: () => webPublicKey.dispose?.(),
        upsert: (registration) => pushStore.upsert(registration),
        remove: (deviceId, routing) => pushStore.remove(deviceId, routing),
      },
      portForward: portForwarding.gateway,
      portProxy: portForwarding.proxy,
      ...(forwardOrigin ? { forwardOrigin } : {}),
      forwardDispatchKey,
      getRelayForwardOrigin: () => relayForwardOrigin,
      getRelayPublicOrigin: () => relayPublicOrigin,
    });
    serverRef = server;
    control = new HostControlServer({
      lease: runtime.lease,
      ...(options.reportError ? { reportError: options.reportError } : {}),
      describe: () => ({
        state: stopping ? "stopping" : server.getInfo() ? "ready" : "starting",
        remoteProtocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
        endpoint: server.getInfo()?.httpBaseUrl ?? null,
        capabilities: hostServicesRef?.capabilities ?? UNCOMPOSED_HOST_CAPABILITIES,
      }),
      // D4 authenticated identity: the exact immutable build this process is
      // running, published only on the mutually authenticated control surface.
      status: () => ({
        state: stopping ? "stopping" : server.getInfo() ? "ready" : "starting",
        admission: admissionOpen ? "open" : "held",
        endpoint: server.getInfo()?.httpBaseUrl ?? null,
        build: buildIdentity,
      }),
      admit: (context) => {
        context.assertActive();
        releaseAdmission();
      },
      issuePairing: (context) => {
        context.assertActive();
        return server.issueIndependentPairingUrl(
          "Local owner control",
          context.pairingPreset ? { preset: context.pairingPreset } : undefined,
        );
      },
    });

    return {
      server,
      forwardOriginSecret,
      hostServices,
      start() {
        try {
          assertRunning();
        } catch (error) {
          return Promise.reject(error);
        }
        if (starting) return starting;
        const barrier = Promise.withResolvers<RemoteAccessServerInfo>();
        starting = barrier.promise;
        void start().then(barrier.resolve, (error: unknown) => {
          starting = null;
          barrier.reject(error);
        });
        return starting;
      },
      dispose,
    };
    async function start(): Promise<RemoteAccessServerInfo> {
      assertRunning();
      // Settle the composed MCP ingress starts before anything can fork the
      // supervisor, so the launch env carries their URL/token pairs (failures
      // were already logged and degrade the same way the desktop degrades).
      // No liveness re-check between the two awaits: a stop that lands while
      // the ingress starts settle must still join this held startup, exactly
      // like the held durable ingress below.
      await hostServicesRef?.start();
      await durableServices?.startIngress();
      assertRunning();
      // D4 staging: publish the authenticated control surface first and hold
      // the remote listener until the upgrader admits this exact build. The
      // database is already open (and migrated) at this point.
      const holdAdmission = !admissionOpen;
      if (holdAdmission) {
        await control?.start();
        assertRunning();
        await admissionBarrier.promise;
        assertRunning();
      }
      const info = await server.start();
      assertRunning();
      maybeAdvertiseMdns(info);
      if (!holdAdmission) await control?.start();
      assertRunning();
      durableServices?.startBackgroundServices();
      void environmentsRef?.start().catch((error: unknown) => {
        if (options.reportError) options.reportError(error);
        else console.error("[server] environment reconnect failed:", error);
      });
      // Optionally register with a relay so devices can reach this server across
      // networks. The relay only ever talks to the server's own loopback port,
      // so RemoteAccessServer is unchanged. Requires a secret to claim the id.
      if (options.relayUrl && relaySecret && !relayHandle) {
        const localHttpUrl = resolveLocalProxyBase(host, info.httpBaseUrl);
        relayHandle = startRelayHost({
          relayUrl: options.relayUrl,
          serverId: identity.desktopId,
          secret: relaySecret,
          label: identity.label,
          localHttpUrl,
          forwardOriginSecret,
          forwardDispatchKey,
          onForwardOrigin: (registeredOrigin) => {
            relayForwardOrigin = registeredOrigin;
            if (!registeredOrigin) relayPublicOrigin = null;
          },
          ...(options.reportError ? { reportError: (e) => options.reportError?.(e) } : {}),
          onRegistered: (publicUrl) => {
            relayPublicOrigin = new URL(publicUrl).origin;
            options.onRelayRegistered?.(publicUrl);
          },
        });
      }
      return info;
    }
    function maybeAdvertiseMdns(info: RemoteAccessServerInfo): void {
      void stopMdnsAdvertiser();
      const fingerprint = serverRef?.tlsFingerprint();
      if (!fingerprint) return;
      const decision = shouldAdvertiseMdns({
        mode: classifyBindHostExposure(host),
        tlsConfigured: true,
      });
      if (!decision.advertise) return;
      let listenPort = port;
      try {
        listenPort = Number(new URL(info.localHttpBaseUrl).port) || port;
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
          onError: (error) => options.reportError?.(error),
        },
      );
      mdnsAdvertiser.start();
    }
  } catch (error) {
    try {
      await dispose();
    } catch (shutdownError) {
      throw new HeadlessCompositionShutdownError([error, shutdownError]);
    }
    throw error;
  }
}
