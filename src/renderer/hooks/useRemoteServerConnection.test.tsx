import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useRemoteServerConnection } from "./useRemoteServerConnection";

const runtime = vi.hoisted(() => ({ browser: true }));
vi.mock("@/renderer/clientRuntime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/clientRuntime")>()),
  isBrowserClientRuntime: () => runtime.browser,
}));

const lifecycle = vi.hoisted(() => ({
  dispose: vi.fn<() => void>(),
  reconnect: undefined as (() => void | Promise<void>) | undefined,
}));
vi.mock("@/renderer/state/remoteServers/lifecycle", () => ({
  installRemoteServerLifecycle: (reconnect: () => void | Promise<void>) => {
    lifecycle.reconnect = reconnect;
    return lifecycle.dispose;
  },
}));

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const originalConnectAll = useRemoteServersStore.getState().connectAll;
let connectAll: ReturnType<
  typeof vi.fn<(options?: { forceTransportReconnect?: boolean }) => Promise<void>>
>;

beforeEach(() => {
  runtime.browser = true;
  lifecycle.dispose.mockReset();
  lifecycle.reconnect = undefined;
  connectAll = vi.fn<(options?: { forceTransportReconnect?: boolean }) => Promise<void>>(
    async () => {},
  );
  useRemoteServersStore.setState({ connectAll });
});

afterEach(() => {
  vi.restoreAllMocks();
  useRemoteServersStore.setState({ connectAll: originalConnectAll });
});

function mockHydration(hydrated: boolean) {
  vi.spyOn(useRemoteServersStore.persist, "hasHydrated").mockReturnValue(hydrated);
  const hydration = deferred();
  const rehydrate = vi
    .spyOn(useRemoteServersStore.persist, "rehydrate")
    .mockImplementation(() => hydration.promise);
  return { hydration, rehydrate };
}

describe("useRemoteServerConnection", () => {
  it("starts checked on desktop and unchecked in a browser client", () => {
    mockHydration(false);
    runtime.browser = false;
    const desktop = renderHook(() => useRemoteServerConnection());
    expect(desktop.result.current.checked).toBe(true);
    desktop.unmount();
    runtime.browser = true;
    const browser = renderHook(() => useRemoteServerConnection());
    expect(browser.result.current.checked).toBe(false);
    browser.unmount();
  });

  it("skips rehydration and is checked by the first commit when the store is already hydrated", async () => {
    const { rehydrate } = mockHydration(true);
    const connect = deferred();
    connectAll.mockImplementationOnce(() => connect.promise);
    const { result } = renderHook(() => useRemoteServerConnection());

    expect(result.current).toEqual({ checked: true, initialConnectSettled: false });
    expect(rehydrate).not.toHaveBeenCalled();
    expect(connectAll).toHaveBeenCalledTimes(1);
    expect(connectAll).toHaveBeenCalledWith();

    await act(async () => connect.resolve());
    expect(result.current.initialConnectSettled).toBe(true);
  });

  it("connects once saved servers rehydrate", async () => {
    const { hydration, rehydrate } = mockHydration(false);
    const { result } = renderHook(() => useRemoteServerConnection());
    expect(rehydrate).toHaveBeenCalledTimes(1);
    expect(result.current.checked).toBe(false);
    expect(connectAll).not.toHaveBeenCalled();

    await act(async () => hydration.resolve());
    expect(result.current.checked).toBe(true);
    expect(connectAll).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.initialConnectSettled).toBe(true));
  });

  it("still finishes checking and connects when rehydration rejects", async () => {
    const { hydration } = mockHydration(false);
    const { result } = renderHook(() => useRemoteServerConnection());

    await act(async () => hydration.reject(new Error("vault locked")));
    expect(result.current.checked).toBe(true);
    expect(connectAll).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.initialConnectSettled).toBe(true));
  });

  it("does nothing after unmount when rehydration settles late", async () => {
    const { hydration } = mockHydration(false);
    const { result, unmount } = renderHook(() => useRemoteServerConnection());
    unmount();

    await act(async () => hydration.resolve());
    expect(connectAll).not.toHaveBeenCalled();
    expect(result.current).toEqual({ checked: false, initialConnectSettled: false });
  });

  it("settles the initial connection when the host is unavailable", async () => {
    mockHydration(true);
    connectAll.mockRejectedValueOnce(new Error("host unavailable"));
    const { result } = renderHook(() => useRemoteServerConnection());
    await waitFor(() => expect(result.current.initialConnectSettled).toBe(true));
    expect(result.current.checked).toBe(true);
  });

  it("force-reconnects on page resume and disposes the lifecycle on unmount", () => {
    mockHydration(true);
    const { unmount } = renderHook(() => useRemoteServerConnection());
    expect(lifecycle.reconnect).toBeDefined();

    void lifecycle.reconnect?.();
    expect(connectAll).toHaveBeenLastCalledWith({ forceTransportReconnect: true });
    expect(lifecycle.dispose).not.toHaveBeenCalled();
    unmount();
    expect(lifecycle.dispose).toHaveBeenCalledTimes(1);
  });
});

it("hydrates without generic connection or resume when a surface owns proof-gated connection", async () => {
  const { hydration } = mockHydration(false);
  const { result } = renderHook(() => useRemoteServerConnection({ autoConnect: false }));
  expect(lifecycle.reconnect).toBeUndefined();
  await act(async () => hydration.resolve());
  expect(result.current).toEqual({ checked: true, initialConnectSettled: true });
  expect(connectAll).not.toHaveBeenCalled();
});
