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

const helperStatus = {
  backend: "helper" as const,
  helper: null,
  capabilities: {
    backgroundPointer: true,
    backgroundKeyboard: true,
    backgroundChords: false,
    accessibilityTree: true,
    elementActions: true,
    occludedCapture: true,
    foregroundInput: true,
    launchApp: true,
    stableWindowIds: false,
  },
  permissions: { accessibility: "not_required" as const, screenRecording: "not_required" as const },
  notes: [],
};

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

  it("keeps api status compact instead of repeating instructions and tool descriptions", async () => {
    const driver = createDriver({
      describeStatus: vi.fn<ComputerUseDriver["describeStatus"]>().mockResolvedValue(helperStatus),
    });

    const result = (await dispatchTool("api", {}, { driver })) as Record<string, unknown>;

    expect(result).toMatchObject({ backend: "helper", platform: process.platform });
    expect(result).not.toHaveProperty("instructions");
    expect(result).not.toHaveProperty("tools");
    expect(JSON.stringify(result).length).toBeLessThan(1_000);
  });

  it("appends degraded backend notes without changing the structured result", () => {
    const formatted = formatToolResult("list_windows", [{ app: "calc", id: 1 }], {
      notes: ["Native helper unavailable; using the legacy driver."],
    });

    expect(formatted.content).toEqual([
      {
        type: "text",
        text: `${JSON.stringify([{ app: "calc", id: 1 }])}\n\nComputer Use backend notes:\n- Native helper unavailable; using the legacy driver.`,
      },
    ]);
  });

  it("keeps accessibility state metadata compact enough for provider tool outputs", () => {
    const tree = Array.from(
      { length: 50 },
      (_, index) => `[s1:${index}] button "Button ${index}" (0,0 40x40) actions=invoke`,
    ).join("\n");
    const formatted = formatToolResult("get_window_state", {
      accessibility: {
        source: "uia",
        tree,
        snapshotId: "s1",
        elementCount: 50,
        truncated: false,
      },
      mode: "passive",
      notes: [],
      screenshots: [],
      window: { app: "calc", id: 1, title: "Calculator" },
    });

    expect(formatted.content[0]?.text).toBe(
      JSON.stringify({
        accessibility: {
          source: "uia",
          tree,
          snapshotId: "s1",
          elementCount: 50,
          truncated: false,
        },
        mode: "passive",
        notes: [],
        screenshots: [],
        window: { app: "calc", id: 1, title: "Calculator" },
      }),
    );
    expect(formatted.content[0]?.text?.length).toBeLessThan(4_096);
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

  it("extracts an observed screenshot from a partial batch result", () => {
    const formatted = formatToolResult("perform", {
      ok: false,
      mode: "batch",
      window: { app: "calc", id: 1 },
      steps: [],
      failed: { index: 0, effect: "unknown" },
      observation: {
        ok: true,
        state: {
          accessibility: null,
          mode: "passive",
          screenshots: [{ data: "encoded", id: "shot", mimeType: "image/jpeg", zIndex: 0 }],
          window: { app: "calc", id: 1 },
        },
      },
    });

    expect(formatted.content[0]?.text).not.toContain("encoded");
    expect(formatted.content[1]).toEqual({
      type: "image",
      data: "encoded",
      mimeType: "image/jpeg",
    });
  });

  it("treats every desktop-driving tool as interactive", () => {
    // Pins the derived set so a new tool cannot silently skip the activity
    // overlay by being annotated non-destructive.
    expect(
      TOOLS.filter((tool) => isInteractiveToolName(tool.name)).map((tool) => tool.name),
    ).toEqual([
      "launch_app",
      "invoke_element",
      "set_element_value",
      "activate_window",
      "perform",
      "click",
      "press_key",
      "type_text",
      "scroll",
      "drag",
    ]);
  });

  it("distinguishes takeover tools from passive inspection", () => {
    expect(isInteractiveToolName("click")).toBe(true);
    expect(isInteractiveToolName("perform")).toBe(true);
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

  it("can return a post-action text observation without another agent turn", async () => {
    const inputWindow = { app: "calc", id: 1 };
    const refreshedWindow = { app: "calc", id: 2, title: "Calculator" };
    const state = {
      accessibility: { tree: "[s1:0] window", snapshotId: "s1" },
      mode: "passive" as const,
      screenshots: [],
      window: refreshedWindow,
    };
    const driver = createDriver({
      click: vi.fn<ComputerUseDriver["click"]>().mockResolvedValue({
        ok: true,
        mode: "interactive",
        window: refreshedWindow,
        delivery: { delivered: "background", route: "message", verified: "unverified" },
      }),
      getWindowState: vi.fn<ComputerUseDriver["getWindowState"]>().mockResolvedValue(state),
    });

    await expect(
      dispatchTool("click", { window: inputWindow, x: 10, y: 20, observe: "text" }, { driver }),
    ).resolves.toMatchObject({ observation: { ok: true, state } });
    expect(driver.getWindowState).toHaveBeenCalledWith({
      window: refreshedWindow,
      include_screenshot: false,
      include_text: true,
    });
  });

  it("does not turn a successful action into an error when observation fails", async () => {
    const window = { app: "calc", id: 1 };
    const driver = createDriver({
      click: vi.fn<ComputerUseDriver["click"]>().mockResolvedValue({
        ok: true,
        mode: "interactive",
        window,
        delivery: { delivered: "background", route: "message", verified: "unverified" },
      }),
      getWindowState: vi
        .fn<ComputerUseDriver["getWindowState"]>()
        .mockRejectedValue(new Error("capture failed")),
    });

    await expect(
      dispatchTool("click", { window, x: 10, y: 20, observe: "both" }, { driver }),
    ).resolves.toMatchObject({ observation: { ok: false, error: "capture failed" } });
  });

  it("rejects an invalid observation mode before executing an action", async () => {
    const window = { app: "calc", id: 1 };
    const driver = createDriver();

    await expect(
      dispatchTool("click", { window, x: 10, y: 20, observe: "texts" }, { driver }),
    ).rejects.toThrow('observe must be "none", "text", "screenshot", or "both"');
    expect(driver.click).not.toHaveBeenCalled();
  });

  it("runs deterministic background steps in order and observes once", async () => {
    const original = { app: "editor", id: 1 };
    const refreshed = { app: "editor", id: 2 };
    const state = {
      accessibility: { tree: "[s2:0] window", snapshotId: "s2" },
      mode: "passive" as const,
      screenshots: [],
      window: refreshed,
    };
    const driver = createDriver({
      invokeElement: vi.fn<ComputerUseDriver["invokeElement"]>().mockResolvedValue({
        ok: true,
        mode: "interactive",
        window: refreshed,
        delivery: { delivered: "background", route: "accessibility", verified: "confirmed" },
      }),
      typeText: vi.fn<ComputerUseDriver["typeText"]>().mockResolvedValue({
        ok: true,
        mode: "interactive",
        window: refreshed,
        delivery: { delivered: "background", route: "message", verified: "unverified" },
      }),
      getWindowState: vi.fn<ComputerUseDriver["getWindowState"]>().mockResolvedValue(state),
    });

    await expect(
      dispatchTool(
        "perform",
        {
          window: original,
          steps: [
            { action: "invoke_element", element_id: "s1:2", element_action: "invoke" },
            { action: "type_text", text: "hello" },
          ],
          observe: "text",
        },
        { driver },
      ),
    ).resolves.toMatchObject({
      ok: true,
      mode: "batch",
      window: refreshed,
      steps: [
        { index: 0, action: "invoke_element" },
        { index: 1, action: "type_text" },
      ],
      observation: { ok: true, state },
    });
    expect(driver.typeText).toHaveBeenCalledWith({
      window: refreshed,
      text: "hello",
      mode: "background",
    });
    expect(driver.getWindowState).toHaveBeenCalledOnce();
  });

  it("stops a deterministic batch on the first refusal", async () => {
    const window = { app: "editor", id: 1 };
    const state = {
      accessibility: { tree: "[s1:0] window", snapshotId: "s1" },
      mode: "passive" as const,
      screenshots: [],
      window,
    };
    const refused = {
      ok: false as const,
      mode: "interactive" as const,
      window,
      refused: {
        code: "stale_snapshot" as const,
        reason: "stale",
        hint: "refresh",
      },
    };
    const driver = createDriver({
      invokeElement: vi.fn<ComputerUseDriver["invokeElement"]>().mockResolvedValue(refused),
      getWindowState: vi.fn<ComputerUseDriver["getWindowState"]>().mockResolvedValue(state),
    });

    await expect(
      dispatchTool(
        "perform",
        {
          window,
          steps: [
            { action: "invoke_element", element_id: "s1:2", element_action: "invoke" },
            { action: "type_text", text: "must not run" },
          ],
          observe: "text",
        },
        { driver },
      ),
    ).resolves.toMatchObject({
      ok: false,
      mode: "batch",
      steps: [{ result: refused }],
      observation: { ok: true, state },
    });
    expect(driver.typeText).not.toHaveBeenCalled();
  });

  it("returns partial completion without probing after a later batch step throws", async () => {
    const window = { app: "editor", id: 1 };
    const state = {
      accessibility: { tree: "[s2:0] window", snapshotId: "s2" },
      mode: "passive" as const,
      screenshots: [],
      window,
    };
    const driver = createDriver({
      invokeElement: vi.fn<ComputerUseDriver["invokeElement"]>().mockResolvedValue({
        ok: true,
        mode: "interactive",
        window,
        delivery: { delivered: "background", route: "accessibility", verified: "confirmed" },
      }),
      pressKey: vi
        .fn<ComputerUseDriver["pressKey"]>()
        .mockRejectedValue(new Error("helper stopped")),
      typeText: vi.fn<ComputerUseDriver["typeText"]>(),
      getWindowState: vi.fn<ComputerUseDriver["getWindowState"]>().mockResolvedValue(state),
    });

    await expect(
      dispatchTool(
        "perform",
        {
          window,
          steps: [
            { action: "invoke_element", element_id: "s1:2", element_action: "invoke" },
            { action: "press_key", key: "Enter" },
            { action: "type_text", text: "must not run" },
          ],
          observe: "text",
        },
        { driver },
      ),
    ).resolves.toMatchObject({
      ok: false,
      mode: "batch",
      steps: [{ index: 0, action: "invoke_element" }],
      failed: { index: 1, action: "press_key", effect: "unknown", error: "helper stopped" },
    });
    expect(driver.typeText).not.toHaveBeenCalled();
    expect(driver.getWindowState).not.toHaveBeenCalled();
  });

  it("rejects native Wayland key batches before executing any step", async () => {
    const window = { app: "editor", id: -1, source: "atspi" as const };
    const driver = createDriver();

    await expect(
      dispatchTool(
        "perform",
        {
          window,
          steps: [{ action: "press_key", key: "Enter" }],
        },
        { driver },
      ),
    ).rejects.toThrow("perform cannot batch key or text input for native Wayland targets");
    expect(driver.pressKey).not.toHaveBeenCalled();
  });

  it("stops a batch after an unexpected foreground delivery", async () => {
    const window = { app: "editor", id: 1, source: "x11" as const };
    const driver = createDriver({
      pressKey: vi.fn<ComputerUseDriver["pressKey"]>().mockResolvedValue({
        ok: true,
        mode: "interactive",
        window,
        delivery: { delivered: "foreground", route: "input", verified: "unverified" },
      }),
      typeText: vi.fn<ComputerUseDriver["typeText"]>(),
    });

    await expect(
      dispatchTool(
        "perform",
        {
          window,
          steps: [
            { action: "press_key", key: "Enter" },
            { action: "type_text", text: "must not run" },
          ],
        },
        { driver },
      ),
    ).resolves.toMatchObject({
      ok: false,
      failed: { index: 0, effect: "delivered_foreground" },
    });
    expect(driver.typeText).not.toHaveBeenCalled();
  });

  it("passes an installed-app search query to the driver", async () => {
    const driver = createDriver({
      listApps: vi.fn<ComputerUseDriver["listApps"]>().mockResolvedValue([]),
    });

    await dispatchTool("list_apps", { query: "Calculator" }, { driver });

    expect(driver.listApps).toHaveBeenCalledWith({ query: "Calculator" });
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
