import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { MuseSubagentObserver } from "./subagentObserver";
import { MSP_SCHEMA_VERSION } from "./protocol";

const mocks = vi.hoisted(() => ({
  spawn: vi.fn<typeof import("./client").spawnMuseServeHost>(),
  initialize: vi.fn<() => Promise<unknown>>(),
  request: vi.fn<typeof import("./client").MuseMspClient.prototype.request>(),
  dispose: vi.fn<() => void>(),
  notification: vi.fn<typeof import("./client").MuseMspClient.prototype.onNotification>(),
  error: vi.fn<typeof import("./client").MuseMspClient.prototype.onError>(),
  stop: vi.fn<typeof import("./hostLifecycle").stopMuseServeHost>(),
}));

vi.mock("./client", () => ({
  spawnMuseServeHost: mocks.spawn,
  MuseMspClient: class {
    initialize = mocks.initialize;
    request = mocks.request;
    dispose = mocks.dispose;
    onNotification = mocks.notification;
    onError = mocks.error;
  },
}));
vi.mock("./hostLifecycle", () => ({ stopMuseServeHost: mocks.stop }));

const location = { kind: "posix", path: "/fixture" } as const;
const options = { serveArgs: ["serve"] };
const hosted = {
  child: new EventEmitter(),
  transport: {},
  hostCookie: "observer-cookie",
  commandLabel: "muse serve",
} as unknown as Awaited<ReturnType<typeof import("./client").spawnMuseServeHost>>;
const observers: MuseSubagentObserver[] = [];

function setup() {
  const notifications = vi.fn<(method: string, params: Record<string, unknown>) => void>();
  const disconnected = vi.fn<() => void>();
  const observer = new MuseSubagentObserver(location, options, notifications, disconnected);
  observers.push(observer);
  return { observer, notifications, disconnected };
}

beforeEach(() => {
  vi.resetAllMocks();
  hosted.child.removeAllListeners();
  mocks.spawn.mockResolvedValue(hosted);
  mocks.initialize.mockResolvedValue({ schema: { version: MSP_SCHEMA_VERSION } });
  mocks.request.mockResolvedValue({ viewCursor: "cursor-1" });
  mocks.stop.mockResolvedValue(undefined);
  mocks.notification.mockReturnValue(() => {});
  mocks.error.mockReturnValue(() => {});
});

afterEach(async () => {
  for (const observer of observers) await observer.dispose();
  observers.length = 0;
});

describe("Muse child transcript observer", () => {
  it("lazily shares one initialized read-only host and routes its child view events", async () => {
    const { observer, notifications } = setup();
    expect(mocks.spawn).not.toHaveBeenCalled();
    await Promise.all([
      observer.request("session/read", { sessionId: "child-1", excludeItems: false }),
      observer.request("view/subscribe", { sessionId: "child-2", after: "cursor-1" }),
    ]);
    expect(mocks.spawn).toHaveBeenCalledExactlyOnceWith(location, options);
    expect(mocks.initialize).toHaveBeenCalledExactlyOnceWith("poracode_subagent_view", "1.0.0");
    const handler = mocks.notification.mock.calls[0]![0];
    handler("item/delta", { sessionId: "child-1", delta: "hello" });
    expect(notifications).toHaveBeenCalledExactlyOnceWith("item/delta", {
      sessionId: "child-1",
      delta: "hello",
    });
    await expect(observer.request("turn/start", { sessionId: "child-1" })).rejects.toThrow(
      "cannot issue turn/start",
    );
    expect(mocks.request.mock.calls.map(([method]) => method)).toEqual([
      "session/read",
      "view/subscribe",
    ]);
    await observer.dispose();
    expect(mocks.stop).toHaveBeenCalledExactlyOnceWith(
      location,
      hosted.child,
      expect.anything(),
      hosted.hostCookie,
    );
    handler("item/delta", { sessionId: "child-1", delta: "late" });
    expect(notifications).toHaveBeenCalledTimes(1);
  });

  it("closes a failed handshake before retrying and retries a failed shutdown on dispose", async () => {
    const { observer } = setup();
    mocks.initialize.mockRejectedValueOnce(new Error("handshake failed"));
    await expect(observer.request("session/read", {})).rejects.toThrow("handshake failed");
    expect(mocks.stop).toHaveBeenCalledTimes(1);
    await observer.request("session/read", {});
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
    mocks.stop.mockRejectedValueOnce(new Error("still running"));
    await expect(observer.dispose()).rejects.toThrow("still running");
    await observer.dispose();
    expect(mocks.stop).toHaveBeenCalledTimes(3);
  });

  it("stops an incompatible host without reading or subscribing to child sessions", async () => {
    const { observer } = setup();
    mocks.initialize.mockResolvedValueOnce({ schema: { version: MSP_SCHEMA_VERSION + 1 } });
    await expect(observer.request("session/read", { sessionId: "child-1" })).rejects.toThrow(
      "incompatible with supported version",
    );
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.stop).toHaveBeenCalledExactlyOnceWith(
      location,
      hosted.child,
      expect.anything(),
      hosted.hostCookie,
    );
  });

  it("owns and stops a host whose spawn resolves after disposal without initializing it", async () => {
    const { observer } = setup();
    let spawned!: (value: typeof hosted) => void;
    mocks.spawn.mockReturnValue(
      new Promise((resolve) => {
        spawned = resolve;
      }),
    );
    const reading = observer.request("session/read", {}).catch((error: unknown) => error);
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledTimes(1));
    const stopping = observer.dispose();
    spawned(hosted);
    expect(await reading).toEqual(
      expect.objectContaining({ message: "Muse transcript observer is closed." }),
    );
    await stopping;
    expect(mocks.initialize).not.toHaveBeenCalled();
    expect(mocks.stop).toHaveBeenCalledTimes(1);
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("cancels a pending handshake during disposal without issuing a child read", async () => {
    const { observer } = setup();
    let fail!: (reason: Error) => void;
    mocks.initialize.mockReturnValue(
      new Promise((_, reject) => {
        fail = reject;
      }),
    );
    mocks.dispose.mockImplementation(() => fail(new Error("disposed")));
    const reading = observer.request("session/read", {}).catch((error: unknown) => error);
    await vi.waitFor(() => expect(mocks.initialize).toHaveBeenCalledTimes(1));
    await observer.dispose();
    expect(await reading).toEqual(expect.objectContaining({ message: "disposed" }));
    expect(mocks.stop).toHaveBeenCalledTimes(1);
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("retires a disconnected observer before sharing a replacement across child requests", async () => {
    const { observer, notifications, disconnected } = setup();
    await observer.request("session/read", { sessionId: "child-1" });
    const oldNotification = mocks.notification.mock.calls[0]![0];
    hosted.child.emit("close", 1, null);
    mocks.error.mock.calls[0]![0](new Error("same disconnect"));
    expect(disconnected).toHaveBeenCalledTimes(1);
    oldNotification("item/delta", { sessionId: "child-1", delta: "stale" });
    expect(notifications).not.toHaveBeenCalled();
    await Promise.all([
      observer.request("view/subscribe", { sessionId: "child-1", after: "cursor-2" }),
      observer.request("session/read", { sessionId: "child-2" }),
    ]);
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
    expect(mocks.initialize).toHaveBeenCalledTimes(2);
    expect(mocks.stop).toHaveBeenCalledTimes(1);
    expect(mocks.stop.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.spawn.mock.invocationCallOrder[1]!,
    );
    expect(mocks.request).toHaveBeenCalledWith("view/subscribe", {
      sessionId: "child-1",
      after: "cursor-2",
    });
  });
});
