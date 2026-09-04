import { describe, expect, it, vi } from "vitest";
import { COMPUTER_USE_INVOKABLE_ELEMENT_ACTIONS, type ComputerUseDriver } from "./types";
import { dispatchTool, formatToolResult, isInteractiveToolName, TOOLS } from "./toolRegistry";

function createDriver(overrides: Partial<ComputerUseDriver> = {}): ComputerUseDriver {
  const driver: ComputerUseDriver = {
    activateWindow: vi.fn<ComputerUseDriver["activateWindow"]>(),
    click: vi.fn<ComputerUseDriver["click"]>(),
    describeStatus: vi.fn<ComputerUseDriver["describeStatus"]>(),
    dispose: vi.fn<ComputerUseDriver["dispose"]>(),
    drag: vi.fn<ComputerUseDriver["drag"]>(),
    findElements: vi.fn<ComputerUseDriver["findElements"]>(),
    getWindow: vi.fn<ComputerUseDriver["getWindow"]>(),
    getWindowState: vi.fn<ComputerUseDriver["getWindowState"]>(),
    launchApp: vi.fn<ComputerUseDriver["launchApp"]>(),
    listApps: vi.fn<ComputerUseDriver["listApps"]>(),
    listWindows: vi.fn<ComputerUseDriver["listWindows"]>(),
    invokeElement: vi.fn<ComputerUseDriver["invokeElement"]>(),
    pressKey: vi.fn<ComputerUseDriver["pressKey"]>(),
    scroll: vi.fn<ComputerUseDriver["scroll"]>(),
    setElementValue: vi.fn<ComputerUseDriver["setElementValue"]>(),
    typeText: vi.fn<ComputerUseDriver["typeText"]>(),
    ...overrides,
  };
  return driver;
}

describe("computer-use toolRegistry", () => {
  it("does not advertise unsupported accessibility action tools", () => {
    expect(TOOLS.map((tool) => tool.name)).not.toContain("set_value");
    expect(TOOLS.map((tool) => tool.name)).not.toContain("perform_secondary_action");
    const invoke = TOOLS.find((tool) => tool.name === "invoke_element");
    expect(invoke).toBeDefined();
    if (!invoke) throw new Error("invoke_element tool is missing");
    const actions =
      (invoke.inputSchema.properties as Record<string, { enum?: readonly string[] }>)["action"]
        ?.enum ?? [];
    expect(actions).toEqual(COMPUTER_USE_INVOKABLE_ELEMENT_ACTIONS);
  });

  it("appends degraded backend notes without changing the structured result", () => {
    const formatted = formatToolResult("list_windows", [{ app: "calc", id: 1 }], {
      notes: ["Native helper unavailable; using the legacy driver."],
    });

    expect(formatted.content).toEqual([
      {
        type: "text",
        text: `${JSON.stringify([{ app: "calc", id: 1 }], null, 2)}\n\nComputer Use backend notes:\n- Native helper unavailable; using the legacy driver.`,
      },
    ]);
  });

  it("appends backend notes to screenshot metadata without altering image content", () => {
    const formatted = formatToolResult(
      "get_window_state",
      {
        accessibility: null,
        mode: "passive",
        screenshots: [{ data: "encoded", id: "shot", mimeType: "image/png", zIndex: 0 }],
        window: { app: "calc", id: 1 },
      },
      { notes: ["Native helper unavailable."] },
    );

    expect(formatted.content[0]?.text).toContain(
      "Computer Use backend notes:\n- Native helper unavailable.",
    );
    expect(formatted.content[0]?.text).not.toContain('"data"');
    expect(formatted.content[1]).toEqual({
      type: "image",
      data: "encoded",
      mimeType: "image/png",
    });
  });

  it("distinguishes takeover tools from passive inspection", () => {
    expect(isInteractiveToolName("click")).toBe(true);
    expect(isInteractiveToolName("type")).toBe(true);
    expect(isInteractiveToolName("get_window_state")).toBe(false);
    expect(isInteractiveToolName("list_windows")).toBe(false);
    expect(TOOLS.find((tool) => tool.name === "get_window_state")?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
    });
    expect(TOOLS.find((tool) => tool.name === "click")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    });
  });

  it("keeps a stale find_elements snapshot as a structured refusal result", async () => {
    const window = { app: "calc", id: 1 };
    const refused = {
      ok: false as const,
      mode: "interactive" as const,
      window,
      refused: {
        code: "stale_snapshot" as const,
        reason: "The element snapshot is no longer cached.",
        hint: "Call find_elements again.",
      },
    };
    const driver = createDriver({
      findElements: vi.fn<ComputerUseDriver["findElements"]>().mockResolvedValue(refused),
    });

    await expect(
      dispatchTool("find_elements", { window, snapshot_id: "s1" }, { driver }),
    ).resolves.toEqual(refused);
  });

  it("preserves the refreshed window returned by interactive driver actions", async () => {
    const inputWindow = { app: "calc", id: 1 };
    const refreshedWindow = { app: "calc", id: 2, title: "Calculator" };
    const driver = createDriver({
      click: vi.fn<ComputerUseDriver["click"]>().mockResolvedValue({
        ok: true,
        mode: "interactive",
        window: refreshedWindow,
        delivery: { delivered: "background", route: "message", verified: "unverified" },
      }),
    });

    await expect(
      dispatchTool("click", { window: inputWindow, x: 10, y: 20 }, { driver }),
    ).resolves.toEqual({
      ok: true,
      mode: "interactive",
      window: refreshedWindow,
      delivery: { delivered: "background", route: "message", verified: "unverified" },
    });
    expect(driver.click).toHaveBeenCalledWith({
      window: inputWindow,
      x: 10,
      y: 20,
      mode: "background",
      verify: "fast",
    });
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
