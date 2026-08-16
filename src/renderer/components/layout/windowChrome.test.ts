import { afterEach, describe, expect, it, vi } from "vitest";
import type { ElectronHostBridge } from "@/shared/clientRuntime";

const host = vi.hoisted(() => ({ mac: false, windows: false }));

vi.mock("@/renderer/bridge", () => ({
  isMac: () => host.mac,
  isWindows: () => host.windows,
}));

import { hasMacWindowChrome, hasNativeWindowChrome, hasWindowsWindowChrome } from "./windowChrome";

const electronHost = {} as ElectronHostBridge;

describe("windowChrome", () => {
  afterEach(() => {
    host.mac = false;
    host.windows = false;
    delete window.poracodeHost;
  });

  it("keeps Mac traffic-light inset in Electron and drops it in the web client", () => {
    host.mac = true;
    window.poracodeHost = electronHost;
    expect(hasMacWindowChrome()).toBe(true);
    expect(hasNativeWindowChrome()).toBe(true);

    delete window.poracodeHost;
    expect(hasMacWindowChrome()).toBe(false);
    expect(hasNativeWindowChrome()).toBe(false);
  });

  it("keeps Windows overlay inset in Electron and drops it in the web client", () => {
    host.windows = true;
    window.poracodeHost = electronHost;
    expect(hasWindowsWindowChrome()).toBe(true);

    delete window.poracodeHost;
    expect(hasWindowsWindowChrome()).toBe(false);
  });
});
