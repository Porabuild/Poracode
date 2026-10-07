import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installSidebarAutoConnect } from "./autoConnect";

const fixture = vi.hoisted(() => ({
  online: false,
  pairServer: vi.fn<(input: { endpoint: string; token: string }) => Promise<void>>(),
  connectAll: vi.fn<() => Promise<void>>(),
}));
vi.mock("@/renderer/state/remoteServersStore", () => ({
  useRemoteServersStore: { getState: () => fixture },
  selectBrowserBridgeServer: () => (fixture.online ? { desktopId: "fixture" } : undefined),
}));
const bootstrap = {
  endpoint: "http://127.0.0.1:43210/",
  pairingUrl: "http://127.0.0.1:43210/pair#token=fixture",
};
let stop = () => {};
beforeEach(() => {
  vi.useFakeTimers();
  fixture.online = false;
  fixture.pairServer.mockResolvedValue(undefined);
  fixture.connectAll.mockImplementation(async () => {
    fixture.online = true;
  });
});
afterEach(() => {
  stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("sidebar automatic connection", () => {
  it("reports an old host distinctly and keeps waiting without attempting to pair", async () => {
    const sendMessage = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({ issue: "upgradeRequired" });
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    const onStatus = vi.fn<(error: unknown | null) => void>();
    stop = installSidebarAutoConnect(onStatus);
    await vi.advanceTimersByTimeAsync(0);
    expect(onStatus).toHaveBeenLastCalledWith("upgradeRequired");
    expect(fixture.pairServer).not.toHaveBeenCalled();
    sendMessage.mockResolvedValue(bootstrap);
    await vi.advanceTimersByTimeAsync(4000);
    expect(fixture.pairServer).toHaveBeenCalledOnce();
    expect(onStatus).toHaveBeenLastCalledWith(null);
  });

  it("waits for the local app, pairs without a screen, then stops issuing credentials while online", async () => {
    const sendMessage = vi
      .fn<(message: { cmd: string }) => Promise<unknown>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValue(bootstrap);
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    const onError = vi.fn<(error: unknown) => void>();
    stop = installSidebarAutoConnect(onError);
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.pairServer).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4000);
    expect(fixture.pairServer).toHaveBeenCalledExactlyOnceWith({
      endpoint: bootstrap.endpoint,
      token: bootstrap.pairingUrl,
    });
    await vi.advanceTimersByTimeAsync(12000);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenLastCalledWith(null);
  });

  it("retries a failed pairing and reconnects after the host goes away", async () => {
    const sendMessage = vi.fn<() => Promise<unknown>>().mockResolvedValue(bootstrap);
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    fixture.pairServer.mockRejectedValueOnce(new Error("app restarted"));
    const onError = vi.fn<(error: unknown) => void>();
    stop = installSidebarAutoConnect(onError);
    await vi.advanceTimersByTimeAsync(4000);
    expect(onError.mock.calls.filter(([error]) => error !== null)).toHaveLength(1);
    expect(onError).toHaveBeenLastCalledWith(null);
    expect(fixture.online).toBe(true);
    fixture.online = false;
    await vi.advanceTimersByTimeAsync(4000);
    expect(fixture.pairServer).toHaveBeenCalledTimes(3);
  });

  it("clears a transient pairing error after recovery and an ordinary app shutdown", async () => {
    const sendMessage = vi.fn<() => Promise<unknown>>().mockResolvedValue(bootstrap);
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    const failure = new Error("app restarted");
    fixture.pairServer.mockRejectedValueOnce(failure);
    const onStatus = vi.fn<(error: unknown | null) => void>();
    stop = installSidebarAutoConnect(onStatus);
    await vi.advanceTimersByTimeAsync(0);
    expect(onStatus).toHaveBeenLastCalledWith(failure);
    await vi.advanceTimersByTimeAsync(4000);
    expect(onStatus).toHaveBeenLastCalledWith(null);
    fixture.online = false;
    sendMessage.mockResolvedValue(null);
    await vi.advanceTimersByTimeAsync(4000);
    expect(onStatus).toHaveBeenLastCalledWith(null);
  });

  it("does not pair from a late worker response after the sidebar closes", async () => {
    const pending = Promise.withResolvers<unknown>();
    const sendMessage = vi.fn<() => Promise<unknown>>().mockReturnValue(pending.promise);
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    stop = installSidebarAutoConnect(vi.fn<(error: unknown) => void>());
    await vi.advanceTimersByTimeAsync(16000);
    expect(sendMessage).toHaveBeenCalledOnce();
    stop();
    pending.resolve(bootstrap);
    await vi.advanceTimersByTimeAsync(8000);
    expect(fixture.pairServer).not.toHaveBeenCalled();
  });
});
