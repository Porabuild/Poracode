import { afterEach, expect, it, vi } from "vitest";
import type { PoracodeBridge } from "@/shared/ipc";
import { hostServiceCapabilities } from "@/shared/hostControlProtocol";
import {
  installBrowserClientRuntime,
  readClientRuntime,
  resetClientRuntimeForTest,
  UNKNOWN_HOST_CAPABILITIES,
} from "@/renderer/clientRuntime";
import type { RemoteServersState } from "./types";
import {
  __resetBrowserBridgeForTest,
  selectBrowserBridgeClientServer,
  syncDesktopBrowserBridgeClient,
} from "./browserBridge";

vi.mock("@/renderer/browser/remoteBridge", () => ({ setRemoteBridgeClient: vi.fn<() => void>() }));
vi.mock("@/renderer/browser/remoteSettingsSync", () => ({
  applyDesktopSettings: vi.fn<() => void>(),
  resetDesktopSettings: vi.fn<() => void>(),
}));

function state(): RemoteServersState {
  return {
    servers: [
      {
        desktopId: "first",
        endpoint: "http://first.test/",
        accessToken: "first",
        hostCapabilities: hostServiceCapabilities({ osNotifications: true }),
      },
      {
        desktopId: "second",
        endpoint: "http://second.test/",
        accessToken: "second",
        hostCapabilities: UNKNOWN_HOST_CAPABILITIES,
      },
    ],
    runtime: { first: { status: "online" }, second: { status: "online" } },
    clientFactory: () => ({
      settings: async () => {
        throw new Error("unused");
      },
    }),
  } as unknown as RemoteServersState;
}

afterEach(() => {
  __resetBrowserBridgeForTest();
  resetClientRuntimeForTest();
  Reflect.deleteProperty(window, "poracode");
});

it("negotiates only the selected remote owner and clears stale capabilities on failed describe", () => {
  const bridge = {} as PoracodeBridge;
  window.poracode = bridge;
  installBrowserClientRuntime(bridge);
  const current = state();
  syncDesktopBrowserBridgeClient(current);
  expect(readClientRuntime().capabilities.osNotifications).toBe(true);
  // A secondary host reconnect does not replace the selected host's capabilities.
  syncDesktopBrowserBridgeClient({ ...current, servers: [...current.servers].reverse() });
  expect(readClientRuntime().capabilities.osNotifications).toBe(true);
  // The same selected host may lose its describe without changing its token.
  syncDesktopBrowserBridgeClient({
    ...current,
    servers: current.servers.map((server) => ({
      ...server,
      hostCapabilities: UNKNOWN_HOST_CAPABILITIES,
    })),
  });
  expect(readClientRuntime().hostCapabilities).toEqual(UNKNOWN_HOST_CAPABILITIES);
});

it("restores a stored v1 owner preference", () => {
  const current = state();
  window.localStorage.setItem(
    "poracode.browser.review-owner.v1",
    JSON.stringify([1, "second", "second", "http://second.test/"]),
  );
  expect(selectBrowserBridgeClientServer(current)?.desktopId).toBe("second");
  // An owner whose endpoint changed is not adopted.
  window.localStorage.setItem(
    "poracode.browser.review-owner.v1",
    JSON.stringify([1, "second", "second", "http://moved.test/"]),
  );
  expect(selectBrowserBridgeClientServer(current)?.desktopId).toBe("first");
});

it("never rewrites an owner preference written by a future version", () => {
  const future = JSON.stringify([2, "second", "second", "http://second.test/", { extra: true }]);
  window.localStorage.setItem("poracode.browser.review-owner.v1", future);
  expect(selectBrowserBridgeClientServer(state())?.desktopId).toBe("first");
  syncDesktopBrowserBridgeClient(state());
  expect(window.localStorage.getItem("poracode.browser.review-owner.v1")).toBe(future);
});
