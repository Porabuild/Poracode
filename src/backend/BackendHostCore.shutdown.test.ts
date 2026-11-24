import { beforeEach, expect, it, vi } from "vitest";
import type { SupervisorEvent } from "@/shared/ipc";

const state = vi.hoisted(() => ({
  closed: false,
  close: vi.fn<() => void>(),
  dispose: vi.fn<() => Promise<void>>(),
  options: null as { onEvent(event: SupervisorEvent): void } | null,
}));
// This fixture mocks the application DB. Admission is an explicit unit dependency;
// real SQLite/Core qualification lives in BackendHostCore.settingsAdmission.test.ts.
vi.mock("@/host/db/preparedDatabaseWriteAdmission", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/host/db/preparedDatabaseWriteAdmission")>()),
  capturePreparedDatabaseWriteAdmission: () => () => {},
}));

vi.mock("@/host/db", () => ({
  initDatabase: () => {
    state.closed = false;
  },
  closeDatabase: () => {
    state.closed = true;
    state.close();
  },
  attachRuntimePersistenceDurableGapFromCurrentConnection: vi.fn<() => void>(),
  armRuntimeThreadForLaunch: vi.fn<(threadId: string) => void>(),
  getRuntimeThreadGapDescriptor: vi.fn<() => null>(() => null),
  acknowledgeRuntimeThreadGap: vi.fn<() => Promise<never>>(),
  addRuntimePersistenceHealthListener: vi.fn<() => () => void>(() => () => undefined),
  getRuntimePersistenceShutdownReport: vi.fn<() => null>(() => null),
  setRuntimePersistenceInFlightWindowBytes: vi.fn<(bytes: number | null) => void>(),
  dbAppendThreadTerminalOutput: vi.fn<() => void>(),
  dbClearThreadTerminalScrollback: vi.fn<() => void>(),
  dbAppendUsageEvents: vi.fn<() => void>(),
  dbGetProjects: vi.fn<() => { id: string }[]>(() => []),
  dbGetThread: vi.fn<() => null>(() => null),
  dbUpsertProject: vi.fn<() => void>(),
}));
vi.mock("@/host/remote/server/runtimePersistence", () => ({
  persistSupervisorEvent: (event: SupervisorEvent) => {
    if (state.closed) throw new Error("write after database close");
    return { kind: "publish", event };
  },
}));
vi.mock("@/host/supervisor/SupervisorClient", () => ({
  SupervisorClient: class {
    dispose = state.dispose;
    constructor(options: typeof state.options) {
      state.options = options;
    }
  },
}));

import { BackendHostCore } from "./BackendHostCore";

beforeEach(() => {
  state.closed = false;
  state.options = null;
  state.close.mockReset();
  state.dispose.mockReset();
});

it("keeps the database open for final supervisor events until joined disposal finishes", async () => {
  let finish!: () => void;
  state.dispose.mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const onEvent = vi.fn<(event: SupervisorEvent) => void>();
  const host = new BackendHostCore({
    baseDir: "/fixture",
    dbPath: "/fixture/state.sqlite",
    supervisor: {
      appVersion: "test",
      isDev: false,
      supervisorPath: "/fixture/supervisor.cjs",
      wslHelpersDir: "/fixture/wsl",
      secretStorageKey: "fixture",
    },
    onEvent,
    onReset: vi.fn<() => void>(),
  });
  const disposing = host.dispose();
  expect(host.dispose()).toBe(disposing);
  expect(state.closed).toBe(false);
  expect(() => host.closeDatabase()).toThrow("before supervisor work has joined");
  const finalEvent: SupervisorEvent = { type: "git-changed", projectId: "fixture" };
  state.options?.onEvent(finalEvent);
  expect(onEvent).toHaveBeenCalledExactlyOnceWith(finalEvent);
  finish();
  await disposing;
  expect(state.close).toHaveBeenCalledOnce();
});

it("does not close the database when child termination cannot be confirmed", async () => {
  state.dispose.mockRejectedValue(new Error("supervisor still alive"));
  const host = new BackendHostCore({
    baseDir: "/fixture",
    dbPath: "/fixture/state.sqlite",
    supervisor: {
      appVersion: "test",
      isDev: false,
      supervisorPath: "/fixture/supervisor.cjs",
      wslHelpersDir: "/fixture/wsl",
      secretStorageKey: "fixture",
    },
    onEvent: vi.fn<(event: SupervisorEvent) => void>(),
    onReset: vi.fn<() => void>(),
  });
  await expect(host.dispose()).rejects.toThrow("supervisor still alive");
  expect(() => host.closeDatabase()).toThrow("before supervisor work has joined");
  expect(state.close).not.toHaveBeenCalled();
});

it("records canonical runtime usage before the database closes", async () => {
  const db = await import("@/host/db");
  const appendUsage = vi.mocked(db.dbAppendUsageEvents);
  const getThread = vi.mocked(db.dbGetThread);
  appendUsage.mockClear();
  getThread.mockReturnValue({
    id: "t1",
    projectId: "p1",
    title: "Thread",
    agentKind: "codex",
    config: { model: "test-model" },
    presentationMode: "gui",
    status: "working",
    attention: "working",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as never);

  const host = new BackendHostCore({
    baseDir: "/fixture",
    dbPath: "/fixture/state.sqlite",
    supervisor: {
      appVersion: "test",
      isDev: false,
      supervisorPath: "/fixture/supervisor.cjs",
      wslHelpersDir: "/fixture/wsl",
      secretStorageKey: "fixture",
    },
    onEvent: vi.fn<(event: SupervisorEvent) => void>(),
    onReset: vi.fn<() => void>(),
  });
  state.options?.onEvent({
    type: "thread-runtime-events",
    threadId: "t1",
    events: [{ type: "turn.completed", threadId: "t1", turnId: "turn-1", state: "completed" }],
  } as never);

  await host.dispose();

  expect(state.close).toHaveBeenCalledOnce();
  expect(appendUsage).toHaveBeenCalledOnce();
  expect(appendUsage.mock.calls[0]?.[0]).toEqual([
    expect.objectContaining({ kind: "turn", provider: "codex", model: "test-model" }),
  ]);
  expect(appendUsage.mock.invocationCallOrder[0]).toBeLessThan(
    state.close.mock.invocationCallOrder[0]!,
  );
});
