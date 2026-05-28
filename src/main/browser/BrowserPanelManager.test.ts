import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveWebContentsById = vi.hoisted(() => vi.fn<(id: number) => unknown>());

vi.mock("electron", () => ({
  BrowserWindow: class BrowserWindow {},
  shell: { openExternal: vi.fn<(url: string) => Promise<void>>() },
}));

vi.mock("../db", () => ({
  dbGetState: vi.fn<(key: string) => string | null>(),
  dbSetState: vi.fn<(key: string, value: string) => void>(),
}));

vi.mock("../sharedSettingsFile", () => ({
  readSharedSettingsFile: vi.fn<(path: string) => unknown>(),
}));

vi.mock("../attachments/localFiles", () => ({
  saveClipboardImageFile: vi.fn<() => string>(),
}));

vi.mock("@/shared/ipc", () => ({
  IPC_EVENT_CHANNELS: { browserEvent: "browser-event" },
}));

vi.mock("./picker/pickerProtocol", () => ({
  PICKER_COMMIT_ORIGIN: "lightcode-picker",
  onPickerCommit: vi.fn<() => () => void>(() => vi.fn<() => void>()),
}));

vi.mock("./picker/pickerScript", () => ({
  buildPickerScript: vi.fn<() => string>(),
}));

vi.mock("./BrowserTab", () => ({
  BrowserTab: class BrowserTab {},
  resolveWebContentsById,
}));

function createManagerWithTab() {
  const tab = {
    tabId: "tab-1",
    attach: vi.fn<(webContents: unknown) => void>(),
  };
  const hostWebContents = {
    id: 42,
    on: vi.fn<() => void>(),
    send: vi.fn<() => void>(),
  };
  const host = {
    webContents: hostWebContents,
    once: vi.fn<() => void>(),
    isDestroyed: () => false,
  };
  return { tab, host, hostWebContents };
}

describe("BrowserPanelManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects the host window WebContents as a browser tab target", async () => {
    const { BrowserPanelManager } = await import("./BrowserPanelManager");
    const manager = new BrowserPanelManager({ settingsPath: "settings.json" } as never);
    const { tab, host } = createManagerWithTab();

    manager.bindHost(host as never);
    (manager as unknown as { tabs: (typeof tab)[] }).tabs = [tab];
    manager.attachWebContents("tab-1", 42);

    expect(resolveWebContentsById).not.toHaveBeenCalled();
    expect(tab.attach).not.toHaveBeenCalled();
  });

  it("attaches a non-host WebContents to the browser tab", async () => {
    const { BrowserPanelManager } = await import("./BrowserPanelManager");
    const manager = new BrowserPanelManager({ settingsPath: "settings.json" } as never);
    const { tab, host } = createManagerWithTab();
    const guestWebContents = { id: 99 };
    resolveWebContentsById.mockReturnValue(guestWebContents);

    manager.bindHost(host as never);
    (manager as unknown as { tabs: (typeof tab)[] }).tabs = [tab];
    manager.attachWebContents("tab-1", 99);

    expect(resolveWebContentsById).toHaveBeenCalledWith(99);
    expect(tab.attach).toHaveBeenCalledWith(guestWebContents);
  });
});
