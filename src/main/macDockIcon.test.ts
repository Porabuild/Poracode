import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import sharp from "sharp";

const electronMock = vi.hoisted(() => {
  const image = { isEmpty: vi.fn<() => boolean>(() => false) };
  return {
    app: {
      isPackaged: true,
      dock: { setIcon: vi.fn<(image: unknown) => void>() },
    },
    image,
    createFromPath: vi.fn<(path: string) => typeof image>(),
  };
});

vi.mock("electron", () => ({
  app: electronMock.app,
  nativeImage: { createFromPath: electronMock.createFromPath },
}));

import { refreshMacDockIcon } from "./macDockIcon";

describe("refreshMacDockIcon", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    electronMock.app.isPackaged = true;
    electronMock.image.isEmpty.mockReturnValue(false);
    electronMock.createFromPath.mockReturnValue(electronMock.image);
  });

  it("sets the packaged macOS Dock icon from app resources", () => {
    refreshMacDockIcon("darwin", "/Applications/Poracode.app/Contents/Resources");

    expect(electronMock.createFromPath).toHaveBeenCalledWith(
      expect.stringMatching(/[\\/]app-icon\.png$/u),
    );
    expect(electronMock.app.dock.setIcon).toHaveBeenCalledWith(electronMock.image);
  });

  it("does nothing outside packaged macOS apps", () => {
    refreshMacDockIcon("win32", "/resources");
    electronMock.app.isPackaged = false;
    refreshMacDockIcon("darwin", "/resources");

    expect(electronMock.createFromPath).not.toHaveBeenCalled();
    expect(electronMock.app.dock.setIcon).not.toHaveBeenCalled();
  });

  it("does not set an empty image", () => {
    electronMock.image.isEmpty.mockReturnValue(true);

    refreshMacDockIcon("darwin", "/resources");

    expect(electronMock.app.dock.setIcon).not.toHaveBeenCalled();
  });

  it("ships a centered stable runtime icon inside the macOS optical safe area", async () => {
    const { data, info } = await sharp(resolve("build/icon-mac.png"))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let minX = info.width;
    let minY = info.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        if (data[(y * info.width + x) * 4 + 3] === 0) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    expect(info).toMatchObject({ width: 1024, height: 1024 });
    expect({ minX, minY, maxX, maxY }).toEqual({ minX: 100, minY: 100, maxX: 923, maxY: 923 });
  });
});
