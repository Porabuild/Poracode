import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupervisorEvent } from "@/shared/ipc";
import type { RemoteGitSummaries } from "@/shared/remote";
import { defaultSharedSettings, type SharedSettings } from "@/shared/settings";
import type { SettingsMutationResult } from "@/shared/settingsTransactions";
import type { RemoteAccessServerInfo, RemoteAccessServerOptions } from "./RemoteAccessServer";
import type { TailscaleStatus } from "./tailscale";

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

interface ServerPlan {
  readonly startPromise?: Promise<RemoteAccessServerInfo>;
  readonly disposePromise?: Promise<void>;
}

interface FakeServer {
  readonly options: RemoteAccessServerOptions;
  readonly info: RemoteAccessServerInfo | null;
  readonly start: ReturnType<typeof vi.fn>;
  readonly dispose: ReturnType<typeof vi.fn>;
  readonly getInfo: ReturnType<typeof vi.fn>;
  readonly issuePairingUrl: ReturnType<typeof vi.fn>;
  readonly listAccessSessions: ReturnType<typeof vi.fn>;
  readonly publishSupervisorEvent: ReturnType<typeof vi.fn>;
  readonly clearBackgroundTaskLevels: ReturnType<typeof vi.fn>;
}

interface FakeForwarding {
  readonly gateway: object;
  readonly proxy: object;
  readonly dispose: ReturnType<typeof vi.fn>;
}

interface FakePushCoordinator {
  readonly options: unknown;
  readonly handleSupervisorEvent: ReturnType<typeof vi.fn>;
  readonly dispose: ReturnType<typeof vi.fn>;
}

const h = vi.hoisted(() => ({
  settings: null as unknown as SharedSettings,
  settingsPatches: [] as Array<{
    [K in keyof SharedSettings]?: SharedSettings[K] | undefined;
  }>,
  readSettings: vi.fn<(path: string) => SharedSettings>(),
  patchSettings:
    vi.fn<
      (
        path: string,
        patch: { [K in keyof SharedSettings]?: SharedSettings[K] | undefined },
      ) => SharedSettings
    >(),
  commitCompatPatch: vi.fn<
    (patch: {
      [K in keyof SharedSettings]?: SharedSettings[K] | undefined;
    }) => Promise<SharedSettings>
  >(),
  editSettingsField:
    vi.fn<
      <F extends keyof SharedSettings>(
        field: F,
        compute: (current: SharedSettings) => SharedSettings[F] | undefined,
      ) => Promise<SettingsMutationResult>
    >(),
  getProjects: vi.fn<() => unknown[]>(() => []),
  updateProject: vi.fn<(project: unknown) => void>(),
  getThreads: vi.fn<() => unknown[]>(() => []),
  refreshGitInterests: vi.fn<() => Promise<void>>(async () => undefined),
  defaultInfo: {
    httpBaseUrl: "http://127.0.0.1:38987/",
    localHttpBaseUrl: "http://127.0.0.1:38987",
    wsBaseUrl: "ws://127.0.0.1:38987/",
    pairingUrl: "http://127.0.0.1:38987/pair?token=startup",
    pairingExpiresAt: "2026-01-01T00:10:00.000Z",
  } satisfies RemoteAccessServerInfo,
  serverPlans: [] as ServerPlan[],
  servers: [] as FakeServer[],
  serverCreatedWaiters: [] as Array<(server: FakeServer) => void>,
  forwardings: [] as FakeForwarding[],
  forwardingDisposedWaiters: [] as Array<(forwarding: FakeForwarding) => void>,
  pushCoordinators: [] as FakePushCoordinator[],
  probeTailscaleStatus: vi.fn<() => Promise<TailscaleStatus>>(),
  enableTailscaleServe:
    vi.fn<(port: number) => Promise<{ ok: true } | { ok: false; message: string }>>(),
  disableTailscaleServe: vi.fn<() => Promise<void>>(),
  launchTailscaleApp: vi.fn<() => Promise<{ ok: true } | { ok: false; message: string }>>(),
  resolveRemoteAccessPort: vi.fn<() => Promise<number>>(),
}));

vi.mock("../db", () => ({
  dbGetProjects: () => h.getProjects(),
  dbGetProject: (projectId: string) =>
    (h.getProjects() as Array<{ id: string }>).find((project) => project.id === projectId) ?? null,
  dbUpdateProject: (project: unknown) => h.updateProject(project),
  dbGetThreads: () => h.getThreads(),
  dbGetThread: (threadId: string) =>
    (h.getThreads() as Array<{ id: string }>).find((thread) => thread.id === threadId) ?? null,
}));

vi.mock("../sharedSettingsFile", () => ({
  readSharedSettingsFile: (path: string) => h.readSettings(path),
  patchSharedSettingsFile: (path: string, patch: Partial<SharedSettings>) =>
    h.patchSettings(path, patch),
}));

vi.mock("./auth", () => ({
  createPersistentRemoteAuthStore: () => ({}),
}));

vi.mock("./config", () => ({
  remoteAccessAdvertisedHost: () => "127.0.0.1",
  remoteAccessHost: () => "127.0.0.1",
  remoteAccessPairingAppUrl: () => undefined,
  remoteForwardBaseUrl: () => undefined,
  resolveRemoteAccessPort: () => h.resolveRemoteAccessPort(),
}));

vi.mock("./identity", () => ({
  readOrCreateRemoteAccessIdentity: () => ({
    desktopId: "desktop-test",
    label: "Test Desktop",
  }),
}));

vi.mock("./portForward/portForwarding", () => ({
  createPortForwarding: () => {
    const forwarding: FakeForwarding = {
      gateway: {},
      proxy: {},
      dispose: vi.fn<() => void>(),
    };
    forwarding.dispose.mockImplementation(() => {
      h.forwardingDisposedWaiters.shift()?.(forwarding);
    });
    h.forwardings.push(forwarding);
    return forwarding;
  },
}));

vi.mock("./push", () => ({
  createPushGateway: () => vi.fn<() => void>(),
  createWebPushPublicKeyResolver: () => vi.fn<() => Promise<string>>(async () => "public-key"),
  PushRegistrationStore: class {
    upsert = vi.fn<(registration: unknown) => void>();
    remove = vi.fn<(deviceId: string) => void>();
  },
  PushCoordinator: class {
    readonly handleSupervisorEvent = vi.fn<(event: SupervisorEvent) => void>();
    readonly dispose = vi.fn<() => Promise<void>>(async () => {});

    constructor(readonly options: unknown) {
      h.pushCoordinators.push(this);
    }
  },
}));

vi.mock("./RemoteAccessServer", () => ({
  RemoteAccessServer: class {
    info: RemoteAccessServerInfo | null = null;
    private readonly plan = h.serverPlans.shift() ?? {};

    readonly start = vi.fn<() => Promise<RemoteAccessServerInfo>>(async () => {
      const info = await (this.plan.startPromise ?? Promise.resolve(h.defaultInfo));
      this.info = info;
      return info;
    });

    readonly dispose = vi.fn<() => Promise<void>>(async () => {
      await (this.plan.disposePromise ?? Promise.resolve());
      this.info = null;
    });

    readonly getInfo = vi.fn<() => RemoteAccessServerInfo | null>(() => this.info);
    readonly issuePairingUrl = vi.fn<() => string>(
      () => "http://127.0.0.1:38987/pair?token=settings",
    );
    readonly listAccessSessions = vi.fn<() => unknown[]>(() => []);
    readonly publishSupervisorEvent = vi.fn<(event: unknown) => void>();
    readonly clearBackgroundTaskLevels = vi.fn<() => void>();

    constructor(readonly options: RemoteAccessServerOptions) {
      h.servers.push(this);
      h.serverCreatedWaiters.shift()?.(this);
    }
  },
}));

vi.mock("./RemoteBrowserGateway", () => ({
  RemoteBrowserGateway: class {},
}));

vi.mock("./tailscale", () => ({
  buildTailscaleHttpsUrl: (dnsName: string) => `https://${dnsName.trim().replace(/\.$/, "")}`,
  probeTailscaleStatus: () => h.probeTailscaleStatus(),
  enableTailscaleServe: (port: number) => h.enableTailscaleServe(port),
  disableTailscaleServe: () => h.disableTailscaleServe(),
  launchTailscaleApp: () => h.launchTailscaleApp(),
}));

import {
  createDesktopRemoteAccessController,
  type DesktopRemoteAccessControllerOptions,
} from "./DesktopRemoteAccessController";

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function committedResult(): SettingsMutationResult {
  return {
    status: "committed",
    authorityId: "00000000-0000-4000-8000-000000000000",
    sequence: 0,
    changes: [],
    revisions: {},
  };
}

function conflictResult(): SettingsMutationResult {
  return {
    status: "conflict",
    authorityId: "00000000-0000-4000-8000-000000000000",
    sequence: 0,
    reason: "revision-changed",
    current: [],
    revisions: {},
  };
}

function waitForNextServerCreated(): Promise<FakeServer> {
  return new Promise((resolve) => h.serverCreatedWaiters.push(resolve));
}

function waitForNextForwardingDisposed(): Promise<FakeForwarding> {
  return new Promise((resolve) => h.forwardingDisposedWaiters.push(resolve));
}

function deferredTailscaleProbe(): {
  readonly probe: Deferred<TailscaleStatus>;
  readonly entered: Promise<void>;
} {
  const probe = deferred<TailscaleStatus>();
  const entered = deferred<void>();
  h.probeTailscaleStatus.mockImplementationOnce(() => {
    entered.resolve();
    return probe.promise;
  });
  return { probe, entered: entered.promise };
}

function createController(
  devServerUrl?: string,
  channel: DesktopRemoteAccessControllerOptions["channel"] = "stable",
  notifyRemoteAccessPairingChanged?: DesktopRemoteAccessControllerOptions["notifyRemoteAccessPairingChanged"],
  reportError: DesktopRemoteAccessControllerOptions["reportError"] = vi.fn<
    DesktopRemoteAccessControllerOptions["reportError"]
  >(),
) {
  const callSupervisor = vi.fn<() => Promise<Record<string, never>>>(
    async () => ({}),
  ) as unknown as RemoteAccessServerOptions["callSupervisor"];
  return createDesktopRemoteAccessController({
    appVersion: "9.9.9-test",
    channel,
    paths: {
      baseDir: "/tmp/poracode-controller-test",
      settingsPath: "/tmp/poracode-controller-test/settings.json",
    },
    ...(devServerUrl ? { devServerUrl } : {}),
    callSupervisor,
    truncateThreadRuntime: vi.fn<DesktopRemoteAccessControllerOptions["truncateThreadRuntime"]>(),
    dispatchThreadCommand: vi.fn<DesktopRemoteAccessControllerOptions["dispatchThreadCommand"]>(
      () => true,
    ),
    getBrowserPanelManager: () => null,
    settingsWrites: {
      commitCompatPatch: (patch) => h.commitCompatPatch(patch),
      editSettingsField: (field, compute) => h.editSettingsField(field, compute),
    },
    notifyRemoteAccessPairingChanged:
      notifyRemoteAccessPairingChanged ??
      vi.fn<DesktopRemoteAccessControllerOptions["notifyRemoteAccessPairingChanged"]>(),
    notifyProjectStateChanged:
      vi.fn<DesktopRemoteAccessControllerOptions["notifyProjectStateChanged"]>(),
    notifyEventInterestsChanged:
      vi.fn<DesktopRemoteAccessControllerOptions["notifyEventInterestsChanged"]>(),
    reportError,
    scheduleService: {} as never,
    prWatchService: {} as never,
    gitStateService: { refreshInterests: h.refreshGitInterests } as never,
    updates: {
      currentVersion: () => "9.9.9-test",
      status: () => null,
      check: vi.fn<() => Promise<void>>(async () => {}),
      install: vi.fn<() => void>(),
    },
  });
}

describe("DesktopRemoteAccessController", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    h.serverPlans.length = 0;
    h.servers.length = 0;
    h.serverCreatedWaiters.length = 0;
    h.forwardings.length = 0;
    h.forwardingDisposedWaiters.length = 0;
    h.pushCoordinators.length = 0;
    h.settingsPatches.length = 0;
    h.refreshGitInterests.mockReset();
    h.refreshGitInterests.mockResolvedValue(undefined);
    h.getThreads.mockReset();
    h.getThreads.mockReturnValue([]);
    h.settings = {
      ...defaultSharedSettings,
      remoteAccessEnabled: false,
      remoteAccessAdvertisedUrl: "",
      remoteAccessTailscaleHttps: false,
      remotePushEnabled: false,
      remotePushRedactContent: true,
    };
    h.readSettings.mockImplementation(() => h.settings);
    h.patchSettings.mockImplementation((_path, patch) => {
      h.settingsPatches.push(patch);
      const merged = { ...h.settings } as Record<string, unknown>;
      for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) merged[key] = value;
      }
      h.settings = merged as SharedSettings;
      return h.settings;
    });
    // The compat-write seam defaults to the same in-memory merge the former
    // patchSharedSettingsFile mock provided, so existing patch assertions keep
    // observing every committed patch.
    h.commitCompatPatch.mockImplementation(async (patch) =>
      h.patchSettings("/tmp/poracode-controller-test/settings.json", patch),
    );
    h.editSettingsField.mockImplementation(async (field, compute) => {
      const next = compute(h.settings);
      const record = h.settings as Record<string, unknown>;
      if (next === undefined) delete record[field];
      else record[field] = next;
      return committedResult();
    });
    h.probeTailscaleStatus.mockResolvedValue({ state: "not-running" });
    h.enableTailscaleServe.mockResolvedValue({ ok: true });
    h.disableTailscaleServe.mockResolvedValue();
    h.launchTailscaleApp.mockResolvedValue({ ok: true });
    h.resolveRemoteAccessPort.mockResolvedValue(38987);
    delete process.env.PORACODE_REMOTE_ACCESS_ADVERTISED_HOST;
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    delete process.env.PORACODE_REMOTE_ACCESS_ADVERTISED_HOST;
  });

  it("uses the hosted pairing app in production and the canonical web app in development", async () => {
    const production = createController();
    await production.setEnabled(true);

    expect(h.servers[0]?.options.pairingAppUrl).toBe("https://poracode.com");
    expect(h.servers[0]?.options.trustedCorsOrigins).toEqual([
      "https://app.poracode.com",
      "https://app-nightly.poracode.com",
    ]);
    expect(h.servers[0]?.options.devWebAppUrl).toBeUndefined();
    expect(h.servers[0]?.options.isDev).toBe(false);

    const development = createController("http://127.0.0.1:3100");
    await development.setEnabled(true);

    expect(h.servers[1]?.options.pairingAppUrl).toBeUndefined();
    expect(h.servers[1]?.options.trustedCorsOrigins).toBeUndefined();
    expect(h.servers[1]?.options.devWebAppUrl).toBe("http://127.0.0.1:3100/");
    expect(h.servers[1]?.options.isDev).toBe(true);
  });

  it("uses the nightly web app by default while trusting both hosted apps", async () => {
    const nightly = createController(undefined, "nightly");
    await nightly.setEnabled(true);

    expect(h.servers[0]?.options.pairingAppUrl).toBe("https://app-nightly.poracode.com");
    expect(h.servers[0]?.options.trustedCorsOrigins).toEqual([
      "https://app.poracode.com",
      "https://app-nightly.poracode.com",
    ]);
  });

  it("publishes the rotated pairing state from the server", async () => {
    const notifyRemoteAccessPairingChanged =
      vi.fn<DesktopRemoteAccessControllerOptions["notifyRemoteAccessPairingChanged"]>();
    const controller = createController(undefined, "stable", notifyRemoteAccessPairingChanged);
    await controller.setEnabled(true);

    h.servers[0]?.options.onPairingChanged?.();

    expect(notifyRemoteAccessPairingChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "ready",
        pairingUrl: h.defaultInfo.pairingUrl,
      }),
    );
  });

  it("coalesces enable calls while a server start is in flight", async () => {
    const start = deferred<RemoteAccessServerInfo>();
    h.serverPlans.push({ startPromise: start.promise });
    const controller = createController();
    const serverCreated = waitForNextServerCreated();

    const first = controller.setEnabled(true);
    await serverCreated;
    const second = controller.setEnabled(true);

    expect(h.servers).toHaveLength(1);
    expect(h.servers[0]?.start).toHaveBeenCalledTimes(1);
    expect(controller.getServer()).toBe(h.servers[0]);
    expect(h.servers[0]?.info).toBeNull();

    start.resolve(h.defaultInfo);
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ status: "ready" }),
      expect.objectContaining({ status: "ready" }),
    ]);
  });

  it("coalesces concurrent enables before advertised URL preflight completes", async () => {
    const { probe, entered } = deferredTailscaleProbe();
    h.settings.remoteAccessTailscaleHttps = true;
    const controller = createController();

    const first = controller.setEnabled(true);
    const second = controller.setEnabled(true);
    await entered;

    expect(h.probeTailscaleStatus).toHaveBeenCalledTimes(1);
    expect(h.servers).toHaveLength(0);

    probe.resolve({ state: "not-running" });
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ status: "ready" }),
      expect.objectContaining({ status: "ready" }),
    ]);
    expect(h.servers).toHaveLength(1);
    expect(h.servers[0]?.start).toHaveBeenCalledTimes(1);
    expect(h.forwardings).toHaveLength(1);
  });

  it("cancels an enable disabled during advertised URL preflight", async () => {
    const { probe, entered } = deferredTailscaleProbe();
    h.settings.remoteAccessTailscaleHttps = true;
    const controller = createController();

    const enabling = controller.setEnabled(true);
    await entered;
    await expect(controller.setEnabled(false)).resolves.toEqual({ status: "disabled" });
    probe.resolve({ state: "not-running" });

    await expect(enabling).resolves.toEqual({ status: "disabled" });
    expect(h.servers).toHaveLength(0);
    expect(h.forwardings).toHaveLength(0);
    expect(controller.getServer()).toBeNull();
    expect(h.settings.remoteAccessEnabled).toBe(false);
  });

  it("waits for a preflight enable to cancel during final disposal", async () => {
    const { probe, entered } = deferredTailscaleProbe();
    h.settings.remoteAccessTailscaleHttps = true;
    const controller = createController();

    const enabling = controller.setEnabled(true);
    await entered;
    const disposing = controller.dispose();
    probe.resolve({
      state: "running",
      dnsName: "desktop.tailnet.ts.net",
      httpsAvailable: true,
    });

    await expect(disposing).resolves.toBeUndefined();
    await expect(enabling).resolves.toEqual({ status: "disabled" });
    expect(h.servers).toHaveLength(0);
    expect(h.forwardings).toHaveLength(0);
    expect(h.enableTailscaleServe).toHaveBeenCalledTimes(1);
    expect(h.disableTailscaleServe).not.toHaveBeenCalled();
    expect(controller.getServer()).toBeNull();
  });

  it("closes a server that finishes starting after it was disabled", async () => {
    const start = deferred<RemoteAccessServerInfo>();
    h.serverPlans.push({ startPromise: start.promise });
    const controller = createController();
    const serverCreated = waitForNextServerCreated();

    const enabling = controller.setEnabled(true);
    await serverCreated;
    await expect(controller.setEnabled(false)).resolves.toEqual({ status: "disabled" });
    expect(h.servers[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(h.forwardings[0]?.dispose).not.toHaveBeenCalled();

    const forwardingDisposed = waitForNextForwardingDisposed();
    start.resolve(h.defaultInfo);
    await expect(enabling).resolves.toEqual({ status: "disabled" });
    await forwardingDisposed;

    expect(h.servers[0]?.dispose).toHaveBeenCalledTimes(2);
    expect(h.servers[0]?.info).toBeNull();
    expect(h.forwardings[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(controller.getServer()).toBeNull();
    expect(h.settings.remoteAccessEnabled).toBe(false);
  });

  it("closes a server that finishes starting after final disposal", async () => {
    const start = deferred<RemoteAccessServerInfo>();
    h.serverPlans.push({ startPromise: start.promise });
    const controller = createController();
    const serverCreated = waitForNextServerCreated();

    const enabling = controller.setEnabled(true);
    await serverCreated;
    const forwardingDisposed = waitForNextForwardingDisposed();
    const disposing = controller.dispose();
    await forwardingDisposed;
    expect(h.servers[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(h.forwardings[0]?.dispose).toHaveBeenCalledTimes(1);

    start.resolve(h.defaultInfo);
    await expect(disposing).resolves.toBeUndefined();
    await expect(enabling).resolves.toEqual({ status: "disabled" });

    expect(h.servers[0]?.dispose).toHaveBeenCalledTimes(2);
    expect(h.servers[0]?.info).toBeNull();
    expect(h.forwardings[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(controller.getServer()).toBeNull();
  });

  it("preserves enablement and disposes forwarding after a start failure", async () => {
    const start = deferred<RemoteAccessServerInfo>();
    h.serverPlans.push({ startPromise: start.promise });
    const controller = createController();
    const serverCreated = waitForNextServerCreated();

    const enabling = controller.setEnabled(true);
    await serverCreated;
    start.reject(new Error("bind failed"));

    await expect(enabling).rejects.toThrow("bind failed");
    expect(h.settingsPatches.map((patch) => patch.remoteAccessEnabled)).toEqual([true]);
    expect(h.settings.remoteAccessEnabled).toBe(true);
    expect(h.forwardings[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(controller.getServer()).toBeNull();
  });

  it("reports an exhausted port conflict without its address and with normalized tags", async () => {
    const start = deferred<RemoteAccessServerInfo>();
    h.serverPlans.push({ startPromise: start.promise });
    const reportError = vi.fn<DesktopRemoteAccessControllerOptions["reportError"]>();
    const controller = createController(undefined, "stable", undefined, reportError);
    const serverCreated = waitForNextServerCreated();

    const enabling = controller.setEnabled(true);
    await serverCreated;
    const conflict = Object.assign(new Error("listen EADDRINUSE 192.168.1.20:38987"), {
      code: "EADDRINUSE",
    });
    start.reject(conflict);

    await expect(enabling).rejects.toBe(conflict);
    expect(reportError).toHaveBeenCalledOnce();
    expect(reportError.mock.calls[0]?.[0]).toMatchObject({
      name: "RemoteAccessPortConflictError",
      message: "Remote access server port remained unavailable after retries.",
    });
    expect(reportError.mock.calls[0]?.[1]).toEqual({
      "poracode.feature_area": "remote-access",
      "poracode.channel": "stable",
      "poracode.platform": process.platform,
      "event.origin": "remote-access.listen.port-conflict",
    });
    expect((reportError.mock.calls[0]![0] as Error).message).not.toContain("192.168");
  });

  it("does not report a port bind failure from a superseded shutdown race", async () => {
    const start = deferred<RemoteAccessServerInfo>();
    h.serverPlans.push({ startPromise: start.promise });
    const reportError = vi.fn<DesktopRemoteAccessControllerOptions["reportError"]>();
    const controller = createController(undefined, "stable", undefined, reportError);
    const serverCreated = waitForNextServerCreated();

    const enabling = controller.setEnabled(true);
    await serverCreated;
    await controller.setEnabled(false);
    start.reject(
      Object.assign(new Error("listen EADDRINUSE private-address"), { code: "EADDRINUSE" }),
    );

    await expect(enabling).resolves.toEqual({ status: "disabled" });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("keeps forwarding alive until a full disable finishes closing the server", async () => {
    const close = deferred<void>();
    h.serverPlans.push({ disposePromise: close.promise });
    const controller = createController();
    await controller.setEnabled(true);

    await expect(controller.setEnabled(false)).resolves.toEqual({ status: "disabled" });
    expect(h.servers[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(h.forwardings[0]?.dispose).not.toHaveBeenCalled();

    const forwardingDisposed = waitForNextForwardingDisposed();
    close.resolve();
    await forwardingDisposed;
    expect(h.forwardings[0]?.dispose).toHaveBeenCalledTimes(1);
  });

  it("waits for restart disposal and reuses the forwarding unit", async () => {
    const close = deferred<void>();
    h.serverPlans.push({ disposePromise: close.promise }, {});
    const controller = createController();
    await controller.setEnabled(true);

    const changing = controller.setAdvertisedUrl(" https://code.example.com/ ");
    // The compat patch commits asynchronously before the restart begins.
    await new Promise((resolve) => setImmediate(resolve));
    expect(h.servers[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(h.servers).toHaveLength(1);
    expect(h.forwardings).toHaveLength(1);

    close.resolve();
    await expect(changing).resolves.toEqual(expect.objectContaining({ status: "ready" }));
    expect(h.servers).toHaveLength(2);
    expect(h.forwardings).toHaveLength(1);
    expect(h.forwardings[0]?.dispose).not.toHaveBeenCalled();
    expect(h.servers[1]?.options.advertisedBaseUrl).toBe("https://code.example.com/");
  });

  it("rolls back an advertised URL when the replacement server fails", async () => {
    h.settings.remoteAccessAdvertisedUrl = "https://old.example.com";
    const replacementStart = deferred<RemoteAccessServerInfo>();
    h.serverPlans.push({}, { startPromise: replacementStart.promise });
    const controller = createController();
    await controller.setEnabled(true);

    const replacementCreated = waitForNextServerCreated();
    const changing = controller.setAdvertisedUrl("https://new.example.com");
    await replacementCreated;
    replacementStart.reject(new Error("replacement failed"));

    await expect(changing).rejects.toThrow("replacement failed");
    expect(h.settings.remoteAccessAdvertisedUrl).toBe("https://old.example.com");
    // Only the forward set flows through the patch seam; the rollback is a
    // scoped CAS field edit (see the concurrency tests below).
    expect(
      h.settingsPatches
        .map((patch) => patch.remoteAccessAdvertisedUrl)
        .filter((value) => value !== undefined),
    ).toEqual(["https://new.example.com"]);
    expect(h.forwardings[0]?.dispose).toHaveBeenCalledTimes(1);
  });

  it("fails a remote-access enable explicitly when the settings authority conflicts", async () => {
    const controller = createController();
    h.commitCompatPatch.mockRejectedValueOnce(
      new Error(
        "settings patch conflicted with concurrent changes (revision-changed) and was not applied.",
      ),
    );

    await expect(controller.setEnabled(true)).rejects.toThrow("conflicted with concurrent changes");
    expect(h.servers).toHaveLength(0);
    expect(h.settingsPatches).toEqual([]);
    expect(h.settings.remoteAccessEnabled).toBe(false);
  });

  it("fails a remote-access disable explicitly instead of clobbering the flag", async () => {
    const controller = createController();
    await controller.setEnabled(true);
    h.commitCompatPatch.mockRejectedValueOnce(
      new Error(
        "settings patch conflicted with concurrent changes (revision-changed) and was not applied.",
      ),
    );

    await expect(controller.setEnabled(false)).rejects.toThrow(
      "conflicted with concurrent changes",
    );
    // The persisted flag is untouched, so a later boot still restores access.
    expect(h.settings.remoteAccessEnabled).toBe(true);
    expect(controller.getServer()).not.toBeNull();
  });

  it("surfaces a settings conflict from setTailscaleHttps without restarting the server", async () => {
    const controller = createController();
    await controller.setEnabled(true);
    h.commitCompatPatch.mockRejectedValueOnce(
      new Error(
        "settings patch conflicted with concurrent changes (revision-changed) and was not applied.",
      ),
    );

    await expect(controller.setTailscaleHttps(true)).rejects.toThrow(
      "conflicted with concurrent changes",
    );
    expect(h.servers).toHaveLength(1);
    expect(h.settings.remoteAccessTailscaleHttps).toBe(false);
  });

  it("rolls back tailscale HTTPS through a CAS edit when the replacement server fails", async () => {
    h.settings.remoteAccessTailscaleHttps = true;
    const replacementStart = deferred<RemoteAccessServerInfo>();
    h.serverPlans.push({}, { startPromise: replacementStart.promise });
    const controller = createController();
    await controller.setEnabled(true);

    const replacementCreated = waitForNextServerCreated();
    const changing = controller.setTailscaleHttps(false);
    await replacementCreated;
    replacementStart.reject(new Error("replacement failed"));

    await expect(changing).rejects.toThrow("replacement failed");
    expect(h.editSettingsField).toHaveBeenCalledWith(
      "remoteAccessTailscaleHttps",
      expect.any(Function),
    );
    expect(h.settings.remoteAccessTailscaleHttps).toBe(true);
  });

  it("keeps a concurrent advertised-URL writer that a stale revert would clobber", async () => {
    h.settings.remoteAccessAdvertisedUrl = "https://old.example.com";
    const replacementStart = deferred<RemoteAccessServerInfo>();
    h.serverPlans.push({}, { startPromise: replacementStart.promise });
    const controller = createController();
    await controller.setEnabled(true);

    const replacementCreated = waitForNextServerCreated();
    const changing = controller.setAdvertisedUrl("https://new.example.com");
    await replacementCreated;
    replacementStart.reject(new Error("replacement failed"));
    // The revert's CAS sees a third value committed by a concurrent writer:
    // neither ours (`new`) nor the stale `previous` may overwrite it.
    h.editSettingsField.mockImplementationOnce(async (field, compute) => {
      h.settings.remoteAccessAdvertisedUrl = "https://someone-else.example.com";
      const next = compute(h.settings);
      (h.settings as Record<string, unknown>)[field] = next;
      return committedResult();
    });

    await expect(changing).rejects.toThrow("replacement failed");
    expect(h.settings.remoteAccessAdvertisedUrl).toBe("https://someone-else.example.com");
  });

  it("rejects a remote settings patch that loses the authority race", async () => {
    const controller = createController();
    await controller.setEnabled(true);
    h.commitCompatPatch.mockRejectedValueOnce(
      new Error(
        "settings patch conflicted with concurrent changes (revision-changed) and was not applied.",
      ),
    );

    const update = h.servers[0]!.options.settings!.update;
    await expect(update({ searchUseIgnoreFiles: true })).rejects.toThrow(
      "conflicted with concurrent changes",
    );
  });

  it("reports a surviving global MCP server conflict instead of writing over it", async () => {
    const reportError = vi.fn<DesktopRemoteAccessControllerOptions["reportError"]>();
    const controller = createController(undefined, "stable", undefined, reportError);
    await controller.setEnabled(true);
    h.editSettingsField.mockResolvedValueOnce(conflictResult());

    const result = h.servers[0]!.options.settings!.commandMcpServers({
      kind: "upsert",
      scope: { kind: "global" },
      server: {
        id: "global-1",
        name: "private_api",
        description: "Private API",
        enabled: true,
        timeoutMs: 30_000,
        transport: {
          type: "http",
          url: "https://example.test/mcp",
          headers: { Authorization: "Bearer header-secret" },
        },
      },
    });

    expect(h.editSettingsField).toHaveBeenCalledWith("mcpServers", expect.any(Function));
    expect(result.servers).toEqual([]);
    // The conflict report is fire-and-forget.
    await new Promise((resolve) => setImmediate(resolve));
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("not committed") }),
      { "poracode.feature_area": "remote-access" },
    );
  });

  it("fans supervisor events to the current server and push coordinator", async () => {
    const controller = createController();
    await controller.setEnabled(true);
    const event: SupervisorEvent = {
      type: "thread-exited",
      threadId: "thread-1",
      exitCode: 0,
    };
    const summaries: RemoteGitSummaries = {
      "thread-1": {
        isRepo: true,
        branch: "feature/controller",
        totalInsertions: 12,
        totalDeletions: 3,
        ahead: 1,
        behind: 0,
        pr: null,
      },
    };

    controller.handleSupervisorEvent(event);
    expect(h.servers[0]?.publishSupervisorEvent).toHaveBeenCalledWith(event);
    expect(h.pushCoordinators[0]?.handleSupervisorEvent).toHaveBeenCalledWith(event);

    controller.updateGitSummaries(summaries);
    expect(h.servers[0]?.publishSupervisorEvent).toHaveBeenLastCalledWith({
      type: "remote-git-summaries",
      summaries,
    });
    expect(h.servers[0]?.options.gitSummaries?.()).toEqual(summaries);
  });

  it("clears supervisor-owned follow-up queues when the supervisor resets", async () => {
    const controller = createController();
    await controller.setEnabled(true);
    h.getThreads.mockReturnValue([{ id: "thread-1" }, { id: "thread-2" }]);

    controller.handleSupervisorReset();

    expect(h.servers[0]?.publishSupervisorEvent).toHaveBeenCalledWith({
      type: "thread-follow-up-queue",
      threadId: "thread-1",
      queue: null,
    });
    expect(h.servers[0]?.publishSupervisorEvent).toHaveBeenCalledWith({
      type: "thread-follow-up-queue",
      threadId: "thread-2",
      queue: null,
    });
  });

  it("starts only when persisted enabled and preserves the setting on boot failure", async () => {
    const controller = createController();
    await controller.startIfEnabled();
    expect(h.servers).toHaveLength(0);

    h.settings.remoteAccessEnabled = true;
    const start = deferred<RemoteAccessServerInfo>();
    h.serverPlans.push({ startPromise: start.promise });
    const serverCreated = waitForNextServerCreated();
    const restoring = controller.startIfEnabled();
    await serverCreated;
    start.reject(new Error("restore failed"));

    await expect(restoring).resolves.toBeUndefined();
    expect(h.settings.remoteAccessEnabled).toBe(true);
    expect(h.settingsPatches).toEqual([]);
  });

  it("runs one bounded Git warm-up when remote access first starts", async () => {
    h.getThreads.mockReturnValue([
      {
        id: "thread-1",
        projectId: "project-1",
        worktreePath: "/repo/worktrees/thread-1",
        status: "idle",
        archived: false,
        updatedAt: "2026-07-30T12:00:00.000Z",
      },
    ]);
    const controller = createController();

    await controller.setEnabled(true);
    await controller.setEnabled(true);

    expect(h.refreshGitInterests).toHaveBeenCalledTimes(1);
    expect(h.refreshGitInterests).toHaveBeenCalledWith(
      [
        {
          kind: "target",
          projectId: "project-1",
          worktreePath: "/repo/worktrees/thread-1",
          includePrDetails: true,
        },
      ],
      { fetchRemote: true },
    );
  });

  it("preserves immediate quit teardown and makes final disposal idempotent", async () => {
    h.settings.remoteAccessTailscaleHttps = true;
    h.probeTailscaleStatus.mockResolvedValue({
      state: "running",
      dnsName: "desktop.tailnet.ts.net",
      httpsAvailable: true,
    });
    const close = deferred<void>();
    h.serverPlans.push({ disposePromise: close.promise });
    const controller = createController();
    await controller.setEnabled(true);

    expect(h.servers[0]?.options.tailscaleHttpBaseUrl).toBe("https://desktop.tailnet.ts.net");

    const first = controller.dispose();
    const second = controller.dispose();

    expect(second).toBe(first);
    expect(h.servers[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(h.forwardings[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(h.disableTailscaleServe).not.toHaveBeenCalled();
    expect(controller.getServer()).toBeNull();

    close.resolve();
    await expect(first).resolves.toBeUndefined();
  });
});
