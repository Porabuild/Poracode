import { beforeEach, expect, it, vi } from "vitest";
import type { SupervisorEvent } from "@/shared/ipc";

const state = vi.hoisted(() => ({
  closed: false,
  close: vi.fn<() => void>(),
  dispose: vi.fn<() => Promise<void>>(),
  options: null as { onEvent(event: SupervisorEvent): void } | null,
}));
vi.mock("@/main/db", () => ({
  initDatabase: () => {
    state.closed = false;
  },
  closeDatabase: () => {
    state.closed = true;
    state.close();
  },
  dbAppendThreadTerminalOutput: vi.fn<() => void>(),
  dbClearThreadTerminalScrollback: vi.fn<() => void>(),
}));
vi.mock("@/host/remote/server/runtimePersistence", () => ({
  persistSupervisorEvent: () => {
    if (state.closed) throw new Error("write after database close");
  },
}));
vi.mock("@/main/supervisor/SupervisorClient", () => ({
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
