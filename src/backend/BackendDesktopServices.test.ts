import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  onProjectThreadDataChanged: vi.fn<() => () => void>(() => () => {}),
  durableOptions: [] as Array<Record<string, unknown>>,
  durableInstances: [] as Array<{
    startIngress: ReturnType<typeof vi.fn<() => Promise<void>>>;
    startBackgroundServices: ReturnType<typeof vi.fn<() => void>>;
  }>,
  settingsAccessOptions: [] as Array<Record<string, unknown>>,
  settingsAccesses: [] as Array<{
    call: ReturnType<typeof vi.fn>;
    editSettingsField: ReturnType<typeof vi.fn>;
    commitCompatPatch: ReturnType<typeof vi.fn>;
    writeSharedSettingsCompat: ReturnType<typeof vi.fn<(next: never) => void>>;
    dispose: ReturnType<typeof vi.fn<() => Promise<void>>>;
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

vi.mock("@/host/db", () => ({
  dbGetProjects: vi.fn<() => never[]>(() => []),
  dbGetThreads: vi.fn<() => never[]>(() => []),
  dbMarkLiveThreadsInactive: vi.fn<() => void>(() => {}),
  onProjectThreadDataChanged: mocks.onProjectThreadDataChanged,
}));

vi.mock("@/backend/remote/DesktopRemoteAccessController", () => ({
  createDesktopRemoteAccessController: mocks.createDesktopRemoteAccessController,
}));

vi.mock("@/host/remote/pairingInfo", () => ({
  getRemoteAccessPairingInfo: vi.fn<() => null>(() => null),
}));

vi.mock("@/host/profile", () => ({
  getProfileCoreStats: vi.fn<() => null>(() => null),
  getProfileDevicesResponse: vi.fn<() => null>(() => null),
  getProfileIdentityResponse: vi.fn<() => null>(() => null),
  getProfileTokenStats: vi.fn<() => null>(() => null),
  setProfileIdentityResponse: vi.fn<() => null>(() => null),
}));

vi.mock("@/host/sharedSettingsFile", () => ({
  readSharedSettingsFile: vi.fn<() => Record<string, never>>(() => ({})),
  writeSharedSettingsFile: vi.fn<() => void>(() => {}),
}));

vi.mock("@/host/remote/identity", () => ({
  readOrCreateRemoteAccessIdentity: mocks.readOrCreateRemoteAccessIdentity,
}));

vi.mock("@/host/legacyDataMigration", () => ({
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
    startBackgroundServices = vi.fn<() => void>(() => {});
    observeSupervisorEvent = () => {};
    dispose = () => {};
  },
}));

vi.mock("./BackendSettingsService", () => ({
  createBackendSettingsAccess: (accessOptions: Record<string, unknown>) => {
    mocks.settingsAccessOptions.push(accessOptions);
    const access = {
      call: vi.fn<() => Promise<null>>(async () => null),
      editSettingsField: vi.fn<() => Promise<null>>(async () => null),
      commitCompatPatch: vi.fn<() => Promise<null>>(async () => null),
      writeSharedSettingsCompat: vi.fn<() => void>(() => {}),
      dispose: vi.fn<() => Promise<void>>(async () => {}),
    };
    mocks.settingsAccesses.push(access);
    return access;
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
import {
  UNKNOWN_HOST_SERVICE_CAPABILITIES,
  type HostServiceCapabilities,
} from "@/shared/hostControlProtocol";
import { writeSharedSettingsFile } from "@/host/sharedSettingsFile";
import { defaultSharedSettings, type SharedSettings } from "@/shared/settings";
import type { Project } from "@/shared/contracts";

function initialize(
  desktop: boolean,
  hostCapabilities?: HostServiceCapabilities,
): BackendHostInitializePayload {
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
      ? {
          desktop: {
            channel: "stable" as const,
            settingsPath: "/data/settings.json",
            ...(hostCapabilities ? { hostCapabilities } : {}),
          },
        }
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

describe("BackendDesktopServices settings notifications", () => {
  it("keeps a committed routing write successful when notifying main fails", async () => {
    const serviceOptions = options(true);
    const error = new Error("Fixture main disconnected");
    serviceOptions.emitNativeEvent.mockImplementationOnce(() => {
      throw error;
    });
    void new BackendDesktopServices(serviceOptions);
    const durable = mocks.durableOptions.at(-1) as unknown as {
      writeSharedSettings(settings: SharedSettings): void;
    };
    const access = mocks.settingsAccesses.at(-1)!;
    const accessOptions = mocks.settingsAccessOptions.at(-1)!;
    // Mirror the real access contract: the committed broadcast is
    // fire-and-forget and reports failures instead of throwing into the
    // durable event path.
    access.writeSharedSettingsCompat.mockImplementation((next) => {
      const { onChanged, reportError } = accessOptions as {
        onChanged: (settings: SharedSettings) => void;
        reportError?: (error: unknown) => void;
      };
      void Promise.resolve()
        .then(() => onChanged(next))
        .catch((notifyError: unknown) => reportError?.(notifyError));
    });

    expect(() => durable.writeSharedSettings(defaultSharedSettings)).not.toThrow();
    // The settings authority owns the document; no direct file patch remains.
    expect(writeSharedSettingsFile).not.toHaveBeenCalled();
    await new Promise((resolve) => setImmediate(resolve));
    expect(serviceOptions.emitNativeEvent).toHaveBeenCalledExactlyOnceWith({
      type: "shared-settings-changed",
      settings: defaultSharedSettings,
    });
    expect(serviceOptions.reportError).toHaveBeenCalledExactlyOnceWith(error);
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

describe("BackendDesktopServices project membership publication", () => {
  beforeEach(() => {
    mocks.createDesktopRemoteAccessController.mockClear();
  });

  it("publishes host-local project rows through the declaration-aware membership publisher", () => {
    const publishCatalogChanged = vi.fn<() => void>();
    const publishCatalogChangedRows = vi.fn<(projects: readonly Project[]) => void>();
    mocks.createDesktopRemoteAccessController.mockImplementationOnce((() => ({
      getServer: () => ({ publishCatalogChanged, publishCatalogChangedRows }),
      handleSupervisorEvent: () => {},
      handleSupervisorReset: () => {},
      updateGitSummaries: () => {},
      startIfEnabled: () => Promise.resolve(),
      dispose: () => Promise.resolve(),
    })) as never);
    const serviceOptions = options(true);
    const services = new BackendDesktopServices(serviceOptions);
    expect(services).toBeDefined();
    const controllerOptions = mocks.createDesktopRemoteAccessController.mock.calls.at(-1)?.[0] as {
      notifyProjectStateChanged(projects: readonly Project[]): void;
    };
    const project: Project = {
      id: "p1",
      name: "Project",
      location: { kind: "posix", path: "/repo" },
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    controllerOptions.notifyProjectStateChanged([project]);

    // The rows are already in hand: the declaration-aware publisher receives
    // them and decides whether a full wire event is needed at all.
    expect(publishCatalogChangedRows).toHaveBeenCalledWith([project]);
    expect(publishCatalogChanged).not.toHaveBeenCalled();
    // The removed full-Project[] native relay is never emitted again.
    expect(serviceOptions.emitNativeEvent).not.toHaveBeenCalled();
  });
});

describe("BackendDesktopServices background services", () => {
  beforeEach(() => {
    mocks.durableOptions.length = 0;
    mocks.durableInstances.length = 0;
  });

  it("starts the durable background services that own the host housekeeping sweep", async () => {
    const services = new BackendDesktopServices(options(true));
    await services.startBackgroundServices();
    // Housekeeping is launched inside the durable layer's start (fire and
    // forget, no readiness block) and is asserted end-to-end in
    // BackendDurableServices.test.ts.
    expect(mocks.durableInstances[0]!.startBackgroundServices).toHaveBeenCalledTimes(1);
  });
});

describe("BackendDesktopServices environment composition (F-3)", () => {
  beforeEach(() => {
    mocks.createDesktopRemoteAccessController.mockClear();
  });

  function remoteOptionsOfLastCall(): {
    environments?: unknown;
    hostCapabilities?: { ssh?: boolean };
  } {
    const call = mocks.createDesktopRemoteAccessController.mock.calls.at(-1);
    expect(call).toBeDefined();
    return call![0] as { environments?: unknown; hostCapabilities?: { ssh?: boolean } };
  }

  it("passes the composed runtime and forces the declared ssh capability true", () => {
    const environments = { start: vi.fn<() => Promise<void>>(async () => {}) };
    const serviceOptions = options(true);
    serviceOptions.initialize = initialize(true, {
      ...UNKNOWN_HOST_SERVICE_CAPABILITIES,
      ssh: false,
    });
    void new BackendDesktopServices({ ...serviceOptions, environments: environments as never });

    const remoteOptions = remoteOptionsOfLastCall();
    expect(remoteOptions.environments).toBe(environments);
    // The declared capability is a statement about the actual composition,
    // never the stale payload: an environment runtime present means `ssh`.
    expect(remoteOptions.hostCapabilities?.ssh).toBe(true);
  });

  it("never upgrades the declared ssh capability without an environment runtime", () => {
    const serviceOptions = options(true);
    serviceOptions.initialize = initialize(true, {
      ...UNKNOWN_HOST_SERVICE_CAPABILITIES,
      ssh: true,
    });
    void new BackendDesktopServices(serviceOptions);

    const remoteOptions = remoteOptionsOfLastCall();
    expect(remoteOptions.environments).toBeUndefined();
    expect(remoteOptions.hostCapabilities?.ssh).toBe(false);
  });
});
