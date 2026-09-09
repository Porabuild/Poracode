import { describe, expect, it, vi } from "vitest";
import { BackendDurableServices } from "./BackendDurableServices";
import type { BackendDurableServicesOptions } from "./BackendDurableServices";

const mocks = vi.hoisted(() => ({
  ingressInstances: [] as Array<{
    info: { url: string; token: string } | null;
    start: ReturnType<typeof vi.fn<() => Promise<{ url: string; token: string }>>>;
  }>,
}));

vi.mock("@/main/db", () => ({
  dbDeleteThread: vi.fn<() => undefined>(),
  dbGetProject: vi.fn<() => undefined>(),
  dbGetProjectNotes: vi.fn<() => undefined>(),
  dbGetProjects: vi.fn<() => never[]>(() => []),
  dbGetThread: vi.fn<() => undefined>(),
  dbGetThreads: vi.fn<() => never[]>(() => []),
  dbInsertScheduleRun: vi.fn<() => undefined>(),
  dbInterruptScheduleRuns: vi.fn<() => undefined>(),
  dbUpdateScheduleRun: vi.fn<() => undefined>(),
  dbUpsertThread: vi.fn<() => undefined>(),
}));

vi.mock("@/main/app-controls", () => ({
  AppControlsMcpIngress: class {
    info: { url: string; token: string } | null = null;
    start = vi.fn<() => Promise<{ url: string; token: string }>>(() =>
      Promise.resolve({ url: "http://127.0.0.1:0/mcp", token: "token" }).then((info) => {
        // Mirrors the real ingress: the MCP endpoint only exists once the
        // start settles, so the supervisor env appears no earlier.
        this.info = info;
        return info;
      }),
    );
    constructor() {
      mocks.ingressInstances.push(this as never);
    }
    getInfo = () => this.info;
    observeSupervisorEvent = () => {};
    dispose = () => {};
  },
  buildSharedAppControlsIngressDeps: () => ({
    createThread: vi.fn<() => Promise<null>>(async () => null),
  }),
  createAppControlsSupervisorCaller: (call: unknown) => call,
}));

vi.mock("@/main/gitState", () => ({
  createGitStateExecutor: () => ({}),
  GitStateService: class {
    start = () => {};
    dispose = () => {};
    observeSupervisorEvent = () => {};
    applyObservedPullRequest = () => {};
  },
}));

vi.mock("@/main/prWatch", () => ({
  buildPrWatchExecutionDeps: () => ({}),
  createDevicePrWatchService: () => ({
    start: () => {},
    dispose: () => {},
    observeSupervisorEvent: () => {},
  }),
}));

vi.mock("@/main/schedules", () => ({
  ScheduleRunCoordinator: class {
    observeSupervisorEvent = () => {};
  },
  createDeviceScheduleService: () => ({
    start: () => {},
    dispose: () => {},
  }),
  ensureHomeProjectRow: vi.fn<() => undefined>(),
}));

function createDurable(): BackendDurableServices {
  return new BackendDurableServices({
    appVersion: "test",
    hostId: "device-1",
    supervisor: {
      call: vi.fn<(name: string, payload: unknown) => Promise<null>>(async () => null),
    },
    getSharedSettings: () => ({}),
    writeSharedSettings: () => {},
    sendThreadCommand: () => true,
    publishProjectsChanged: () => {},
    hasRendererWindow: true,
    openThreadInUi: () => true,
    notifyUser: vi.fn<() => Promise<{ delivered: true }>>(async () => ({ delivered: true })),
    checkForUpdate: vi.fn<() => Promise<{ supported: true }>>(async () => ({ supported: true })),
    onGitPatch: () => {},
  } as unknown as BackendDurableServicesOptions);
}

describe("BackendDurableServices startIngress", () => {
  it("shares one start attempt across concurrent callers", async () => {
    const durable = createDurable();
    const ingress = mocks.ingressInstances[mocks.ingressInstances.length - 1]!;
    let release!: (info: { url: string; token: string }) => void;
    ingress.start.mockImplementationOnce(
      () =>
        new Promise<{ url: string; token: string }>((resolve) => {
          release = resolve;
        }),
    );

    const first = durable.startIngress();
    const second = durable.startIngress();
    expect(ingress.start).toHaveBeenCalledTimes(1);

    release({ url: "http://127.0.0.1:0/mcp", token: "token" });
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
    // A settled start is reused, never re-run.
    await durable.startIngress();
    expect(ingress.start).toHaveBeenCalledTimes(1);
  });

  it("retries ingress start after a failed attempt", async () => {
    const durable = createDurable();
    const ingress = mocks.ingressInstances[mocks.ingressInstances.length - 1]!;
    ingress.start
      .mockRejectedValueOnce(new Error("Port 0 is unavailable."))
      .mockResolvedValueOnce({ url: "http://127.0.0.1:0/mcp", token: "token" });

    await expect(durable.startIngress()).rejects.toThrow("Port 0 is unavailable.");
    // The failure must not latch the service off: the next caller retries.
    await expect(durable.startIngress()).resolves.toBeUndefined();
    expect(ingress.start).toHaveBeenCalledTimes(2);
  });

  it("gives concurrent callers the same failed attempt and retries afterwards", async () => {
    const durable = createDurable();
    const ingress = mocks.ingressInstances[mocks.ingressInstances.length - 1]!;
    ingress.start.mockRejectedValueOnce(new Error("Ingress start failed."));

    const outcomes = await Promise.allSettled([
      durable.startIngress(),
      durable.startIngress(),
      durable.startIngress(),
    ]);
    expect(outcomes.every((outcome) => outcome.status === "rejected")).toBe(true);
    expect(ingress.start).toHaveBeenCalledTimes(1);

    ingress.start.mockResolvedValueOnce({ url: "http://127.0.0.1:0/mcp", token: "token" });
    await expect(durable.startIngress()).resolves.toBeUndefined();
    expect(ingress.start).toHaveBeenCalledTimes(2);
  });

  it("exposes the app-controls supervisor env only once ingress is up", async () => {
    const durable = createDurable();
    const ingress = mocks.ingressInstances[mocks.ingressInstances.length - 1]!;
    let release!: (info: { url: string; token: string }) => void;
    ingress.start.mockImplementationOnce(
      () =>
        new Promise<{ url: string; token: string }>((resolve) => {
          release = (info) => {
            ingress.info = info;
            resolve(info);
          };
        }),
    );

    // While the start is in flight there is no MCP endpoint, so a supervisor
    // spawned now would have to start without the app-controls env — which is
    // exactly why supervisor start-up awaits this gate.
    expect(durable.getSupervisorExtraEnv()).toEqual({});

    const started = durable.startIngress();
    expect(durable.getSupervisorExtraEnv()).toEqual({});
    release({ url: "http://127.0.0.1:0/mcp", token: "token" });
    await started;

    expect(durable.getSupervisorExtraEnv()).toEqual({
      PORACODE_APP_CONTROLS_MCP_URL: "http://127.0.0.1:0/mcp",
      PORACODE_APP_CONTROLS_MCP_TOKEN: "token",
    });
  });
});
