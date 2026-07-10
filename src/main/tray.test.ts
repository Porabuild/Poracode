import { beforeEach, describe, expect, it, vi } from "vitest";

interface TrayMockInstance {
  destroy(): void;
  on(event: string, listener: () => void): void;
  setContextMenu(menu: unknown): void;
  setToolTip(tooltip: string): void;
}

const existsSyncMock = vi.hoisted(() => vi.fn<(path: string) => boolean>());
const trayConstructorMock = vi.hoisted(() =>
  vi.fn<(image: unknown) => TrayMockInstance>(function TrayMock(_image: unknown) {
    return {
      destroy: vi.fn<() => void>(),
      on: vi.fn<(event: string, listener: () => void) => void>(),
      setContextMenu: vi.fn<(menu: unknown) => void>(),
      setToolTip: vi.fn<(tooltip: string) => void>(),
    };
  }),
);
const imageMock = vi.hoisted(() => {
  const image = {
    isEmpty: vi.fn<() => boolean>(() => false),
    resize: vi.fn<(size: { width: number; height: number }) => unknown>(),
  };
  image.resize.mockReturnValue(image);
  return image;
});
const appMock = vi.hoisted(() => ({ isPackaged: false }));
const buildFromTemplateMock = vi.hoisted(() => vi.fn<(template: unknown[]) => unknown>(() => ({})));

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
}));

vi.mock("electron", () => ({
  app: appMock,
  Menu: { buildFromTemplate: buildFromTemplateMock },
  nativeImage: {
    createFromPath: vi.fn<(path: string) => unknown>(() => imageMock),
  },
  Tray: trayConstructorMock,
}));

import { createTray, resolveTrayIconPath } from "./tray";

describe("resolveTrayIconPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appMock.isPackaged = false;
    imageMock.isEmpty.mockReturnValue(false);
  });

  it("prefers the nightly icon in dev nightly builds", () => {
    existsSyncMock.mockImplementation((path) => /build[\\/]icon-nightly\.png$/u.test(path));

    expect(resolveTrayIconPath("nightly")).toMatch(/build[\\/]icon-nightly\.png$/u);
  });

  it("falls back to no tray when the icon is missing", () => {
    existsSyncMock.mockReturnValue(false);

    const handle = createTray({
      appName: "Poracode",
      channel: "stable",
      onShow: vi.fn<() => void>(),
      onQuit: vi.fn<() => void>(),
    });

    expect(trayConstructorMock).not.toHaveBeenCalled();
    expect(handle.available).toBe(false);
    expect(() => handle.destroy()).not.toThrow();
    expect(() => handle.setQuickComposerShortcut("Ctrl+Shift+K")).not.toThrow();
  });

  it("adds a quick composer entry with the registered shortcut", () => {
    existsSyncMock.mockReturnValue(true);
    const onQuickComposer = vi.fn<() => void>();
    const onShow = vi.fn<() => void>();

    const handle = createTray({
      appName: "Poracode",
      channel: "stable",
      onShow,
      onQuickComposer,
      onQuit: vi.fn<() => void>(),
    });
    handle.setQuickComposerShortcut("CommandOrControl+Alt+Space");

    const template = buildFromTemplateMock.mock.calls.at(-1)?.[0] as Array<{
      label?: string;
      click?: () => void;
    }>;
    expect(handle.available).toBe(true);
    expect(template[0]?.label).toBe("Quick Composer (CommandOrControl+Alt+Space)");
    template[0]?.click?.();
    expect(onQuickComposer).toHaveBeenCalledOnce();
    template.find((item) => item.label === "Show Poracode")?.click?.();
    expect(onShow).toHaveBeenCalledOnce();

    handle.setQuickComposerShortcut("Ctrl+Shift+K");
    const updated = buildFromTemplateMock.mock.calls.at(-1)?.[0] as Array<{ label?: string }>;
    expect(updated[0]?.label).toBe("Quick Composer (Ctrl+Shift+K)");
  });
});
