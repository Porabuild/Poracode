import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupervisorEvent } from "@/shared/ipc";

const mocks = vi.hoisted(() => ({
  initDatabase: vi.fn<(path: string, options?: { schemaMode?: "migrate" | "validate" }) => void>(),
  closeDatabase: vi.fn<() => void>(),
  dbMarkLiveThreadsInactive: vi.fn<() => void>(),
  persistSupervisorEvent: vi.fn<(event: SupervisorEvent) => void>(),
  start: vi.fn<() => void>(),
  dispose: vi.fn<() => void>(),
  supervisorOptions: null as null | {
    onEvent(event: SupervisorEvent): void;
    onReset(): void;
  },
  supervisorConstructorError: null as Error | null,
}));

vi.mock("@/main/db", () => ({
  initDatabase: mocks.initDatabase,
  closeDatabase: mocks.closeDatabase,
  dbMarkLiveThreadsInactive: mocks.dbMarkLiveThreadsInactive,
  dbAppendThreadTerminalOutput: vi.fn<() => void>(),
  dbClearThreadTerminalScrollback: vi.fn<() => void>(),
}));

vi.mock("@/main/remote/server/runtimePersistence", () => ({
  persistSupervisorEvent: mocks.persistSupervisorEvent,
}));

vi.mock("@/main/supervisor/SupervisorClient", () => ({
  SupervisorClient: class {
    start = mocks.start;
    dispose = mocks.dispose;

    constructor(options: { onEvent(event: SupervisorEvent): void; onReset(): void }) {
      if (mocks.supervisorConstructorError) throw mocks.supervisorConstructorError;
      mocks.supervisorOptions = options;
    }
  },
}));

import {
  BackendEventRouter,
  BackendHostCore,
  filterSupervisorEventForInterests,
} from "./BackendHostCore";

describe("BackendHostCore", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      if (typeof mock === "function" && "mockReset" in mock) mock.mockReset();
    }
    mocks.supervisorOptions = null;
    mocks.supervisorConstructorError = null;
  });

  it("owns database and supervisor lifecycle", () => {
    const host = new BackendHostCore({
      baseDir: "/data",
      dbPath: "/data/state.sqlite",
      markLiveThreadsInactiveOnOpen: true,
      supervisor: {
        appVersion: "test",
        isDev: false,
        supervisorPath: "/supervisor.cjs",
        wslHelpersDir: "/wsl",
        secretStorageKey: "secret",
      },
      onEvent: vi.fn<(event: SupervisorEvent) => void>(),
      onReset: vi.fn<() => void>(),
    });

    host.startSupervisor();
    host.restartSupervisor();
    host.dispose();
    host.closeDatabase();

    expect(mocks.initDatabase).toHaveBeenCalledExactlyOnceWith("/data/state.sqlite");
    expect(mocks.dbMarkLiveThreadsInactive).toHaveBeenCalledOnce();
    expect(mocks.start).toHaveBeenCalledTimes(2);
    expect(mocks.dispose).toHaveBeenCalledOnce();
    expect(mocks.closeDatabase).toHaveBeenCalledOnce();
  });

  it("persists each supervisor event before publishing it", () => {
    const order: string[] = [];
    mocks.persistSupervisorEvent.mockImplementation(() => order.push("persist"));
    const host = new BackendHostCore({
      baseDir: "/data",
      dbPath: "/data/state.sqlite",
      supervisor: {
        appVersion: "test",
        isDev: false,
        supervisorPath: "/supervisor.cjs",
        wslHelpersDir: "/wsl",
        secretStorageKey: "secret",
      },
      onEvent: () => order.push("publish"),
      onReset: vi.fn<() => void>(),
    });
    const event: SupervisorEvent = { type: "git-changed", projectId: "project" };

    mocks.supervisorOptions?.onEvent(event);
    host.dispose();

    expect(order).toEqual(["persist", "publish"]);
  });

  it("closes the database when supervisor construction fails", () => {
    mocks.supervisorConstructorError = new Error("constructor failed");

    expect(
      () =>
        new BackendHostCore({
          baseDir: "/data",
          dbPath: "/data/state.sqlite",
          supervisor: {
            appVersion: "test",
            isDev: false,
            supervisorPath: "/supervisor.cjs",
            wslHelpersDir: "/wsl",
            secretStorageKey: "secret",
          },
          onEvent: vi.fn<(event: SupervisorEvent) => void>(),
          onReset: vi.fn<() => void>(),
        }),
    ).toThrow("constructor failed");
    expect(mocks.closeDatabase).toHaveBeenCalledOnce();
  });

  it("can validate a schema owned by the desktop main process", () => {
    const host = new BackendHostCore({
      baseDir: "/data",
      dbPath: "/data/state.sqlite",
      databaseSchemaMode: "validate",
      supervisor: {
        appVersion: "test",
        isDev: false,
        supervisorPath: "/supervisor.cjs",
        wslHelpersDir: "/wsl",
        secretStorageKey: "secret",
      },
      onEvent: vi.fn<(event: SupervisorEvent) => void>(),
      onReset: vi.fn<() => void>(),
    });

    expect(mocks.initDatabase).toHaveBeenCalledExactlyOnceWith("/data/state.sqlite", {
      schemaMode: "validate",
    });
    host.dispose();
  });

  it("publishes high-volume events only for interested threads", () => {
    const interests = {
      terminalThreadIds: ["terminal-visible"],
      runtimeThreadIds: ["chat-visible"],
      allRuntimeEvents: false,
    };

    expect(
      filterSupervisorEventForInterests(
        {
          type: "thread-output",
          threadId: "terminal-hidden",
          data: "noise",
          outputLength: 5,
          terminalInstanceId: "gen-test",
        },
        interests,
      ),
    ).toBeNull();
    const hiddenShellActivityAt = new Map<string, number>();
    expect(
      filterSupervisorEventForInterests(
        {
          type: "thread-output",
          threadId: "shell:action",
          data: "done",
          outputLength: 4,
          terminalInstanceId: "gen-test",
        },
        interests,
        hiddenShellActivityAt,
        1_000,
      ),
    ).toEqual({
      type: "thread-output",
      threadId: "shell:action",
      data: "",
      outputLength: 4,
      terminalInstanceId: "gen-test",
    });
    expect(
      filterSupervisorEventForInterests(
        {
          type: "thread-output",
          threadId: "shell:action",
          data: "more",
          outputLength: 8,
          terminalInstanceId: "gen-test",
        },
        interests,
        hiddenShellActivityAt,
        1_499,
      ),
    ).toBeNull();
    expect(
      filterSupervisorEventForInterests(
        {
          type: "thread-output",
          threadId: "shell:action",
          data: "more",
          outputLength: 8,
          terminalInstanceId: "gen-test",
        },
        interests,
        hiddenShellActivityAt,
        1_500,
      ),
    ).toEqual({
      type: "thread-output",
      threadId: "shell:action",
      data: "",
      outputLength: 8,
      terminalInstanceId: "gen-test",
    });
    expect(
      filterSupervisorEventForInterests(
        {
          type: "thread-runtime-events-multi",
          batches: [
            {
              threadId: "chat-visible",
              events: [
                {
                  type: "item.completed",
                  threadId: "chat-visible",
                  itemId: "visible-item",
                },
              ],
            },
            {
              threadId: "chat-hidden",
              events: [
                {
                  type: "item.completed",
                  threadId: "chat-hidden",
                  itemId: "hidden-item",
                },
                {
                  type: "request.opened",
                  threadId: "chat-hidden",
                  requestId: "approval-1",
                  requestType: "tool_call_approval",
                  payload: { summary: "Approve the background command?" },
                },
                {
                  type: "turn.completed",
                  threadId: "chat-hidden",
                  turnId: "turn-hidden",
                  state: "completed",
                },
              ],
            },
          ],
        },
        interests,
      ),
    ).toEqual({
      type: "thread-runtime-events-multi",
      batches: [
        {
          threadId: "chat-visible",
          events: [
            {
              type: "item.completed",
              threadId: "chat-visible",
              itemId: "visible-item",
            },
          ],
        },
        {
          threadId: "chat-hidden",
          events: [
            {
              type: "request.opened",
              threadId: "chat-hidden",
              requestId: "approval-1",
              requestType: "tool_call_approval",
              payload: { summary: "Approve the background command?" },
            },
            {
              type: "turn.completed",
              threadId: "chat-hidden",
              turnId: "turn-hidden",
              state: "completed",
            },
          ],
        },
      ],
    });
    expect(
      filterSupervisorEventForInterests(
        {
          type: "thread-runtime-event",
          threadId: "chat-hidden",
          event: {
            type: "content.delta",
            threadId: "chat-hidden",
            itemId: "hidden-item",
            stream: "assistant_text",
            delta: "noise",
          },
        },
        interests,
      ),
    ).toBeNull();
  });

  it("keeps initial terminal output subscribed until interest acknowledgement", () => {
    vi.useFakeTimers();
    const router = new BackendEventRouter();
    const output: SupervisorEvent = {
      type: "thread-output",
      threadId: "terminal-starting",
      data: "first frame",
      outputLength: 11,
      terminalInstanceId: "gen-test",
    };

    router.retainTerminalBootstrap("terminal-starting");
    expect(router.filter(output)).toBe(output);
    expect(router.filter(output)).toBe(output);

    router.setInterests({
      terminalThreadIds: ["terminal-starting"],
      runtimeThreadIds: [],
      allRuntimeEvents: false,
    });
    expect(router.filter(output)).toBe(output);

    router.setInterests({
      terminalThreadIds: [],
      runtimeThreadIds: [],
      allRuntimeEvents: false,
    });
    expect(router.filter(output)).toBeNull();
    router.dispose();
    vi.useRealTimers();
  });

  it("expires unacknowledged terminal bootstrap interest", () => {
    vi.useFakeTimers();
    const router = new BackendEventRouter();
    const output: SupervisorEvent = {
      type: "thread-output",
      threadId: "terminal-starting",
      data: "first frame",
      outputLength: 11,
      terminalInstanceId: "gen-test",
    };

    router.retainTerminalBootstrap("terminal-starting");
    vi.advanceTimersByTime(10_000);

    expect(router.filter(output)).toBeNull();
    router.dispose();
    vi.useRealTimers();
  });
});
