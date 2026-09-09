import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  onProjectThreadDataChanged: vi.fn<() => () => void>(() => () => {}),
  durableOptions: [] as Array<Record<string, unknown>>,
  durableInstances: [] as Array<{
    startIngress: ReturnType<typeof vi.fn<() => Promise<void>>>;
  }>,
  createDesktopRemoteAccessController: vi.fn<
    (options: unknown) => {
      getServer: () => null;
      handleSupervisorEvent: () => void;
      handleSupervisorReset: () => void;
      updateGitSummaries: () => void;
      startIfEnabled: () => Promise<void>;
      dispose: () => Promise<void>;
    }
  >(() => ({
    getServer: () => null,
    handleSupervisorEvent: () => {},
    handleSupervisorReset: () => {},
    updateGitSummaries: () => {},
    startIfEnabled: () => Promise.resolve(),
    dispose: () => Promise.resolve(),
  })),
  readOrCreateRemoteAccessIdentity: vi.fn<(baseDir: string) => { desktopId: string }>(() => ({
    desktopId: "desktop-1",
  })),
}));

vi.mock("@/main/db", () => ({
  dbGetProjects: vi.fn<() => never[]>(() => []),
  dbGetThreads: vi.fn<() => never[]>(() => []),
  dbMarkLiveThreadsInactive: vi.fn<() => void>(() => {}),
  onProjectThreadDataChanged: mocks.onProjectThreadDataChanged,
}));

vi.mock("@/main/remote/DesktopRemoteAccessController", () => ({
  createDesktopRemoteAccessController: mocks.createDesktopRemoteAccessController,
}));

vi.mock("@/main/remote/pairingInfo", () => ({
  getRemoteAccessPairingInfo: vi.fn<() => null>(() => null),
}));

vi.mock("@/main/profile", () => ({
  getProfileCoreStats: vi.fn<() => null>(() => null),
  getProfileDevicesResponse: vi.fn<() => null>(() => null),
  getProfileIdentityResponse: vi.fn<() => null>(() => null),
  getProfileTokenStats: vi.fn<() => null>(() => null),
  setProfileIdentityResponse: vi.fn<() => null>(() => null),
}));

vi.mock("@/main/sharedSettingsFile", () => ({
  readSharedSettingsFile: vi.fn<() => Record<string, never>>(() => ({})),
  writeSharedSettingsFile: vi.fn<() => void>(() => {}),
}));

vi.mock("@/main/remote/identity", () => ({
  readOrCreateRemoteAccessIdentity: mocks.readOrCreateRemoteAccessIdentity,
}));

vi.mock("@/main/legacyDataMigration", () => ({
  requestLegacyDataMigration: vi.fn<() => null>(() => null),
}));

vi.mock("./BackendDurableServices", () => ({
  BackendDurableServices: class {
    scheduleService = {};
    prWatchService = {};
    gitStateService = {};
    startIngress = vi.fn<() => Promise<void>>(() => Promise.resolve());
    constructor(durableOptions: Record<string, unknown>) {
      mocks.durableOptions.push(durableOptions);
      mocks.durableInstances.push(this as never);
    }
    getSupervisorExtraEnv = () => ({});
    startBackgroundServices = () => {};
    observeSupervisorEvent = () => {};
    dispose = () => {};
  },
}));

vi.mock("./BackendRemoteBrowserProxy", () => ({
  BackendRemoteBrowserProxy: class {
    publish = () => {};
    dispose = () => {};
  },
}));

vi.mock("./BackendImagePreview", () => ({
  generateBackendImagePreview: vi.fn<() => null>(() => null),
}));

import { affectsShellProjection, BackendDesktopServices } from "./BackendDesktopServices";
import type { BackendHostCore } from "./BackendHostCore";
import type {
  BackendHostInitializePayload,
  BackendNativeRequest,
} from "@/shared/backendHostProtocol";

function initialize(desktop: boolean): BackendHostInitializePayload {
  return {
    baseDir: "/data",
    dbPath: "/data/state.sqlite",
    supervisor: {
      appVersion: "test",
      isDev: false,
      supervisorPath: "/supervisor.cjs",
      wslHelpersDir: "/wsl",
      secretStorageKey: "secret",
    },
    ...(desktop
      ? { desktop: { channel: "stable" as const, settingsPath: "/data/settings.json" } }
      : {}),
  };
}

function options(desktop: boolean) {
  return {
    initialize: initialize(desktop),
    host: {
      supervisorClient: { call: vi.fn<() => null>(() => null) },
    } as unknown as BackendHostCore,
    requestNative: vi.fn<(request: never) => Promise<unknown>>(() => Promise.resolve(null)),
    emitNativeEvent: vi.fn<(event: never) => void>(() => {}),
    reportError: vi.fn<(error: unknown) => void>(() => {}),
    setRemoteEventInterests: vi.fn<(interests: never) => void>(() => {}),
  };
}

describe("BackendDesktopServices projection invalidation", () => {
  it("never turns shell projection reads into another invalidation", () => {
    expect(affectsShellProjection("dbGetProjects")).toBe(false);
    expect(affectsShellProjection("dbGetThreads")).toBe(false);
    expect(affectsShellProjection("dbGetState")).toBe(false);
    expect(affectsShellProjection("dbUpsertProject")).toBe(true);
    expect(affectsShellProjection("dbUpsertThread")).toBe(true);
  });
});

describe("BackendDesktopServices supervisor reset", () => {
  beforeEach(() => {
    mocks.createDesktopRemoteAccessController.mockClear();
  });

  it("forwards supervisor reset to the desktop remote controller", () => {
    const handleSupervisorReset = vi.fn<() => void>(() => {});
    mocks.createDesktopRemoteAccessController.mockImplementationOnce(() => ({
      getServer: () => null,
      handleSupervisorEvent: () => {},
      handleSupervisorReset,
      updateGitSummaries: () => {},
      startIfEnabled: () => Promise.resolve(),
      dispose: () => Promise.resolve(),
    }));
    const services = new BackendDesktopServices(options(true));

    services.handleSupervisorReset();

    expect(handleSupervisorReset).toHaveBeenCalledOnce();
  });

  it("no-ops supervisor reset without desktop remote access", () => {
    const services = new BackendDesktopServices(options(false));

    expect(() => services.handleSupervisorReset()).not.toThrow();
    expect(mocks.createDesktopRemoteAccessController).not.toHaveBeenCalled();
  });
});

describe("BackendDesktopServices fire-and-forget native requests", () => {
  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  /**
   * Fire-and-forget native requests must never leak a rejection to the
   * process-level handler that would kill the shared backend.
   */
  const withoutUnhandledRejections = async (body: () => Promise<void>): Promise<void> => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      await body();
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  };

  function servicesWithPendingNative() {
    const pending: Array<{
      operation: BackendNativeRequest["operation"];
      resolve: (value: unknown) => void;
      reject: (error: unknown) => void;
    }> = [];
    const serviceOptions = options(true);
    const requestNative = vi.fn<(request: BackendNativeRequest) => Promise<unknown>>(
      (request) =>
        new Promise<unknown>((resolve, reject) => {
          pending.push({ operation: request.operation, resolve, reject });
        }),
    );
    serviceOptions.requestNative = requestNative as never;
    void new BackendDesktopServices(serviceOptions);
    const durable = mocks.durableOptions[mocks.durableOptions.length - 1] as {
      openThreadInUi: (threadId: string) => boolean;
    };
    const remoteOptions = (
      mocks.createDesktopRemoteAccessController.mock.calls as Array<
        [{ updates: { install: () => void } }]
      >
    ).at(-1)![0];
    return { pending, reportError: serviceOptions.reportError, durable, remoteOptions };
  }

  it("reports a failed open-thread instead of leaking the rejection", () =>
    withoutUnhandledRejections(async () => {
      const { pending, reportError, durable } = servicesWithPendingNative();

      expect(durable.openThreadInUi("thread-1")).toBe(true);
      expect(pending.map((call) => call.operation)).toEqual(["open-thread"]);
      pending[0]!.reject(new Error("No active main window."));
      await flush();

      expect(reportError).toHaveBeenCalledOnce();
      expect((reportError.mock.calls[0]![0] as Error).message).toBe(
        'Failed to open thread "thread-1" in the desktop UI: No active main window.',
      );
    }));

  it("reports a failed install-update instead of leaking the rejection", () =>
    withoutUnhandledRejections(async () => {
      const { pending, reportError, remoteOptions } = servicesWithPendingNative();

      remoteOptions.updates.install();
      expect(pending.map((call) => call.operation)).toEqual(["install-update"]);
      pending[0]!.reject(new Error("Updater is disabled."));
      await flush();

      expect(reportError).toHaveBeenCalledOnce();
      expect((reportError.mock.calls[0]![0] as Error).message).toBe(
        "Failed to install the pending update: Updater is disabled.",
      );
    }));
});

describe("BackendDesktopServices supervisor preparation", () => {
  beforeEach(() => {
    mocks.durableOptions.length = 0;
    mocks.durableInstances.length = 0;
  });

  it("delegates to the durable single-flight start and retries after a failure", async () => {
    const services = new BackendDesktopServices(options(true));
    const durable = mocks.durableInstances[0]!;

    durable.startIngress.mockRejectedValueOnce(new Error("Ingress failed to start."));
    // The failure must not latch preparation off: the next supervisor start
    // attempt retries the ingress instead of silently skipping it forever.
    await expect(services.prepareSupervisor()).rejects.toThrow("Ingress failed to start.");
    await expect(services.prepareSupervisor()).resolves.toBeUndefined();
    expect(durable.startIngress).toHaveBeenCalledTimes(2);
  });

  it("forwards supervisor preparation to the durable start", async () => {
    const services = new BackendDesktopServices(options(true));
    const durable = mocks.durableInstances[0]!;

    // Concurrent dedupe is the durable single-flight's own contract; the
    // desktop layer must simply always delegate instead of latching.
    await services.prepareSupervisor();
    await services.prepareSupervisor();
    expect(durable.startIngress).toHaveBeenCalledTimes(2);
  });
});
