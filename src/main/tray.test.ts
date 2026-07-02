import { beforeEach, describe, expect, it, vi } from "vitest";

const existsSyncMock = vi.hoisted(() => vi.fn<(path: string) => boolean>());
const trayConstructorMock = vi.hoisted(() =>
  vi.fn<
    (image: unknown) => {
      destroy(): void;
      on(event: string, listener: () => void): void;
      setContextMenu(menu: unknown): void;
      setToolTip(tooltip: string): void;
    }
  >(() => ({
    destroy: vi.fn<() => void>(),
    on: vi.fn<(event: string, listener: () => void) => void>(),
    setContextMenu: vi.fn<(menu: unknown) => void>(),
    setToolTip: vi.fn<(tooltip: string) => void>(),
  })),
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

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
}));

vi.mock("electron", () => ({
  app: appMock,
  Menu: { buildFromTemplate: vi.fn<(template: unknown[]) => unknown>(() => ({})) },
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
      onQuit: vi.fn<() => void>(),
      window: {
        focus: vi.fn<() => void>(),
        isDestroyed: vi.fn<() => boolean>(() => false),
        isMinimized: vi.fn<() => boolean>(() => false),
        isVisible: vi.fn<() => boolean>(() => true),
        restore: vi.fn<() => void>(),
        show: vi.fn<() => void>(),
      } as never,
    });

    expect(trayConstructorMock).not.toHaveBeenCalled();
    expect(() => handle.destroy()).not.toThrow();
  });
});
