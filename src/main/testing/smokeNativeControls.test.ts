import { describe, expect, it, vi } from "vitest";
import type {
  ContextBridge,
  IpcMain,
  IpcMainInvokeEvent,
  IpcRenderer,
  WebContents,
} from "electron";
import { registerSmokeNativeControls, installSmokeNativePreload } from "./smokeNativeControls";

function harness(overrides = {}) {
  const mainFrame = {};
  const sender = { mainFrame, isDestroyed: () => false } as unknown as WebContents;
  const ipcMain = { handle: vi.fn<IpcMain["handle"]>() };
  const toggleQuickComposer = vi.fn<() => void>();
  const options = {
    ipcMain,
    isDev: true,
    isPackaged: false,
    mockAgents: true,
    getMainWebContents: () => sender,
    toggleQuickComposer,
    inspectQuickComposer: () => ({ visible: false, focused: false }),
    ...overrides,
  };
  const event = { sender, senderFrame: mainFrame } as IpcMainInvokeEvent;
  return { options, event, ipcMain, toggleQuickComposer };
}

describe("mock native smoke controls", () => {
  it.each([{ isDev: false }, { isPackaged: true }, { mockAgents: false }])(
    "does not register for an ineligible launch: %j",
    (overrides) => {
      const h = harness(overrides);
      registerSmokeNativeControls(h.options);
      expect(h.ipcMain.handle).not.toHaveBeenCalled();
    },
  );

  it("invokes the native toggle only for the current main window's top frame", () => {
    const h = harness();
    registerSmokeNativeControls(h.options);
    const handler = h.ipcMain.handle.mock.calls[0]![1];
    expect(() => handler(h.event, 1)).not.toThrow();
    expect(h.toggleQuickComposer).toHaveBeenCalledTimes(1);

    expect(() => handler({ ...h.event, sender: {} as WebContents }, 1)).toThrow(/main window/);
    expect(() =>
      handler({ ...h.event, senderFrame: {} as NonNullable<IpcMainInvokeEvent["senderFrame"]> }, 1),
    ).toThrow(/main window/);
    expect(() => handler({ ...h.event, senderFrame: null }, 1)).toThrow(/main window/);
    h.options.getMainWebContents = () => null as unknown as WebContents;
    expect(() => handler(h.event, 1)).toThrow(/main window/);
    expect(h.toggleQuickComposer).toHaveBeenCalledTimes(1);
  });

  it("rejects an incompatible QA contract before invoking a native action", () => {
    const h = harness();
    registerSmokeNativeControls(h.options);
    const handler = h.ipcMain.handle.mock.calls[0]![1];
    for (const version of [undefined, 0, 2, "1", { version: 1 }]) {
      expect(() => handler(h.event, version)).toThrow(/version/);
    }
    expect(h.toggleQuickComposer).not.toHaveBeenCalled();
  });

  it("exposes a separate, narrow preload bridge only in dev mock mode", async () => {
    const contextBridge = { exposeInMainWorld: vi.fn<ContextBridge["exposeInMainWorld"]>() };
    const ipcRenderer = { invoke: vi.fn<IpcRenderer["invoke"]>().mockResolvedValue(undefined) };
    for (const [isDev, mockAgents] of [
      [false, true],
      [true, false],
      [false, false],
    ]) {
      installSmokeNativePreload({
        contextBridge,
        ipcRenderer,
        isDev: isDev!,
        mockAgents: mockAgents!,
      });
    }
    expect(contextBridge.exposeInMainWorld).not.toHaveBeenCalled();
    installSmokeNativePreload({ contextBridge, ipcRenderer, isDev: true, mockAgents: true });
    const [name, bridge] = contextBridge.exposeInMainWorld.mock.calls[0]!;
    expect(name).toBe("__poracodeSmokeNative");
    expect(Object.keys(bridge)).toEqual(["version", "toggleQuickComposer", "inspectQuickComposer"]);
    const h = harness();
    registerSmokeNativeControls(h.options);
    await bridge.toggleQuickComposer();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(h.ipcMain.handle.mock.calls[0]![0], 1);
    await bridge.inspectQuickComposer();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(h.ipcMain.handle.mock.calls[1]![0], 1);
    const inspect = h.ipcMain.handle.mock.calls[1]![1];
    expect(inspect(h.event, 1)).toEqual({ visible: false, focused: false });
    expect(() => inspect({ ...h.event, senderFrame: null }, 1)).toThrow(/main window/);
  });
});
