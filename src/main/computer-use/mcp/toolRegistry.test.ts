import { describe, expect, it, vi } from "vitest";
import type { ComputerUseDriver } from "./types";
import { dispatchTool, isInteractiveToolName, TOOLS } from "./toolRegistry";

function createDriver(overrides: Partial<ComputerUseDriver> = {}): ComputerUseDriver {
  const driver: ComputerUseDriver = {
    activateWindow: vi.fn<ComputerUseDriver["activateWindow"]>(),
    click: vi.fn<ComputerUseDriver["click"]>(),
    dispose: vi.fn<ComputerUseDriver["dispose"]>(),
    drag: vi.fn<ComputerUseDriver["drag"]>(),
    getWindow: vi.fn<ComputerUseDriver["getWindow"]>(),
    getWindowState: vi.fn<ComputerUseDriver["getWindowState"]>(),
    launchApp: vi.fn<ComputerUseDriver["launchApp"]>(),
    listApps: vi.fn<ComputerUseDriver["listApps"]>(),
    listWindows: vi.fn<ComputerUseDriver["listWindows"]>(),
    pressKey: vi.fn<ComputerUseDriver["pressKey"]>(),
    scroll: vi.fn<ComputerUseDriver["scroll"]>(),
    typeText: vi.fn<ComputerUseDriver["typeText"]>(),
    ...overrides,
  };
  return driver;
}

describe("computer-use toolRegistry", () => {
  it("does not advertise unsupported accessibility action tools", () => {
    expect(TOOLS.map((tool) => tool.name)).not.toContain("set_value");
    expect(TOOLS.map((tool) => tool.name)).not.toContain("perform_secondary_action");
  });

  it("distinguishes takeover tools from passive inspection", () => {
    expect(isInteractiveToolName("click")).toBe(true);
    expect(isInteractiveToolName("type")).toBe(true);
    expect(isInteractiveToolName("get_window_state")).toBe(false);
    expect(isInteractiveToolName("list_windows")).toBe(false);
  });

  it("preserves the refreshed window returned by interactive driver actions", async () => {
    const inputWindow = { app: "calc", id: 1 };
    const refreshedWindow = { app: "calc", id: 2, title: "Calculator" };
    const driver = createDriver({
      click: vi.fn<ComputerUseDriver["click"]>().mockResolvedValue({
        ok: true,
        mode: "interactive",
        window: refreshedWindow,
      }),
    });

    await expect(
      dispatchTool("click", { window: inputWindow, x: 10, y: 20 }, { driver }),
    ).resolves.toEqual({
      ok: true,
      mode: "interactive",
      window: refreshedWindow,
    });
    expect(driver.click).toHaveBeenCalledWith({ window: inputWindow, x: 10, y: 20 });
  });

  it("rejects malformed click options instead of silently left-clicking", async () => {
    const driver = createDriver();
    const window = { app: "calc", id: 1 };

    await expect(
      dispatchTool("click", { window, x: 10, y: 20, mouse_button: "primary" }, { driver }),
    ).rejects.toThrow("mouse_button must be left, right, or middle");
    await expect(
      dispatchTool("click", { window, x: 10, y: 20, click_count: 100 }, { driver }),
    ).rejects.toThrow("click_count must be 1 or 2");
    expect(driver.click).not.toHaveBeenCalled();
  });
});
