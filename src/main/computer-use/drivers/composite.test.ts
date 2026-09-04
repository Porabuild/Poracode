import { describe, expect, it, vi } from "vitest";
import type { ComputerUseDriver, ComputerUseInteractiveResult } from "../mcp/types";
import { CompositeComputerUseDriver } from "./composite";
import { HelperUnavailableError } from "./helper";
import { JsonLineActionError } from "./jsonLineHost";

const delivered: ComputerUseInteractiveResult = {
  ok: true,
  mode: "interactive",
  delivery: { delivered: "foreground", route: "input", verified: "unverified" },
};

function createDriver(overrides: Partial<ComputerUseDriver> = {}): ComputerUseDriver {
  return {
    activateWindow: vi.fn<ComputerUseDriver["activateWindow"]>().mockResolvedValue(delivered),
    click: vi.fn<ComputerUseDriver["click"]>().mockResolvedValue(delivered),
    describeStatus: vi.fn<ComputerUseDriver["describeStatus"]>().mockResolvedValue({
      backend: "legacy",
      helper: null,
      capabilities: {
        backgroundPointer: false,
        backgroundKeyboard: false,
        backgroundChords: false,
        accessibilityTree: false,
        elementActions: false,
        occludedCapture: false,
        foregroundInput: true,
        launchApp: true,
        stableWindowIds: false,
      },
      permissions: { accessibility: "unknown", screenRecording: "unknown" },
      notes: [],
    }),
    dispose: vi.fn<ComputerUseDriver["dispose"]>(),
    drag: vi.fn<ComputerUseDriver["drag"]>().mockResolvedValue(delivered),
    findElements: vi.fn<ComputerUseDriver["findElements"]>(),
    getWindow: vi.fn<ComputerUseDriver["getWindow"]>(),
    getWindowState: vi.fn<ComputerUseDriver["getWindowState"]>(),
    invokeElement: vi.fn<ComputerUseDriver["invokeElement"]>().mockResolvedValue(delivered),
    launchApp: vi.fn<ComputerUseDriver["launchApp"]>().mockResolvedValue({ ok: true }),
    listApps: vi.fn<ComputerUseDriver["listApps"]>().mockResolvedValue([]),
    listWindows: vi.fn<ComputerUseDriver["listWindows"]>().mockResolvedValue([]),
    pressKey: vi.fn<ComputerUseDriver["pressKey"]>().mockResolvedValue(delivered),
    scroll: vi.fn<ComputerUseDriver["scroll"]>().mockResolvedValue(delivered),
    setElementValue: vi.fn<ComputerUseDriver["setElementValue"]>().mockResolvedValue(delivered),
    typeText: vi.fn<ComputerUseDriver["typeText"]>().mockResolvedValue(delivered),
    ...overrides,
  };
}

describe("CompositeComputerUseDriver", () => {
  it("refuses background input and warns once when helper startup fails", async () => {
    const failure = new HelperUnavailableError("handshake_failed", "bad handshake");
    const primary = createDriver({
      click: vi.fn<ComputerUseDriver["click"]>().mockRejectedValue(failure),
    });
    const fallback = createDriver();
    const warn = vi.fn<(message: string) => void>();
    const driver = new CompositeComputerUseDriver({ primary, fallback, warn });
    const input = { window: { app: "app", id: 1 }, x: 1, y: 2 };

    await expect(driver.click(input)).resolves.toMatchObject({
      ok: false,
      refused: { code: "background_unavailable" },
    });
    await expect(driver.click(input)).resolves.toMatchObject({ ok: false });
    expect(fallback.click).not.toHaveBeenCalled();
    expect(primary.dispose).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("uses the legacy driver only for explicit foreground work after degradation", async () => {
    const primary = createDriver({
      click: vi
        .fn<ComputerUseDriver["click"]>()
        .mockRejectedValue(new HelperUnavailableError("protocol_mismatch", "mismatch")),
    });
    const fallback = createDriver();
    const driver = new CompositeComputerUseDriver({ primary, fallback });
    const input = { window: { app: "app", id: 1 }, x: 1, y: 2, mode: "foreground" as const };

    await expect(driver.click(input)).resolves.toBe(delivered);
    expect(fallback.click).toHaveBeenCalledWith(input);
  });

  it("does not degrade or fall back for action-level helper errors", async () => {
    const error = new JsonLineActionError("target rejected", "permission_denied");
    const primary = createDriver({
      click: vi.fn<ComputerUseDriver["click"]>().mockRejectedValue(error),
    });
    const fallback = createDriver();
    const driver = new CompositeComputerUseDriver({ primary, fallback });

    await expect(driver.click({ window: { app: "app", id: 1 }, x: 1, y: 2 })).rejects.toBe(error);
    expect(fallback.click).not.toHaveBeenCalled();
  });

  it("does not claim a legacy fallback when none is available", async () => {
    const warn = vi.fn<(message: string) => void>();
    const driver = new CompositeComputerUseDriver({ primary: null, fallback: null, warn });

    await expect(driver.listWindows()).rejects.toThrow("Computer Use native helper unavailable");
    expect(warn).toHaveBeenCalledWith(
      "Computer Use native helper unavailable. The bundled computer-use helper is missing.",
    );
  });
});
