import { afterEach, describe, expect, it, vi } from "vitest";
import { ComputerUseMcpIngress, type ComputerUseMcpIngressOptions } from "./ComputerUseMcpIngress";
import type { ComputerUseDriver, ComputerUseInteractiveResult } from "./mcp/types";

let ingress: ComputerUseMcpIngress | null = null;

function createDriver(overrides: Partial<ComputerUseDriver> = {}): ComputerUseDriver {
  return {
    activateWindow: vi.fn<ComputerUseDriver["activateWindow"]>(),
    click: vi.fn<ComputerUseDriver["click"]>(),
    describeStatus: vi.fn<ComputerUseDriver["describeStatus"]>().mockResolvedValue({
      backend: "helper",
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
      permissions: { accessibility: "not_required", screenRecording: "not_required" },
      notes: [],
    }),
    dispose: vi.fn<ComputerUseDriver["dispose"]>(),
    drag: vi.fn<ComputerUseDriver["drag"]>(),
    findElements: vi.fn<ComputerUseDriver["findElements"]>(),
    getWindow: vi.fn<ComputerUseDriver["getWindow"]>(),
    getWindowState: vi.fn<ComputerUseDriver["getWindowState"]>(),
    launchApp: vi.fn<ComputerUseDriver["launchApp"]>(),
    listApps: vi.fn<ComputerUseDriver["listApps"]>(),
    listWindows: vi.fn<ComputerUseDriver["listWindows"]>().mockResolvedValue([]),
    invokeElement: vi.fn<ComputerUseDriver["invokeElement"]>(),
    pressKey: vi.fn<ComputerUseDriver["pressKey"]>(),
    scroll: vi.fn<ComputerUseDriver["scroll"]>(),
    setElementValue: vi.fn<ComputerUseDriver["setElementValue"]>(),
    typeText: vi.fn<ComputerUseDriver["typeText"]>(),
    ...overrides,
  };
}

function callTool(
  info: { url: string; token: string },
  name: string,
  args: Record<string, unknown>,
  threadId = "thread-1",
): Promise<Response> {
  return fetch(`${info.url}/mcp?thread=${encodeURIComponent(threadId)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${info.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
}

afterEach(() => {
  ingress?.dispose();
  ingress = null;
});

describe("ComputerUseMcpIngress", () => {
  it("prewarms the native driver after the MCP ingress starts", async () => {
    const driver = createDriver();
    ingress = new ComputerUseMcpIngress({ driver });

    await ingress.start();

    await vi.waitFor(() => expect(driver.describeStatus).toHaveBeenCalledOnce());
  });

  it("advertises computer_use instructions and tools on initialize", async () => {
    ingress = new ComputerUseMcpIngress({ driver: createDriver() });
    const info = await ingress.start();

    const response = await fetch(`${info.url}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${info.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {},
      }),
    });

    const body = (await response.json()) as {
      result: {
        serverInfo: { name: string; version: string };
        instructions: string;
      };
    };

    expect(body.result.serverInfo.name).toBe("computer_use");
    expect(body.result.serverInfo.version).toBe("0.2.0");
    expect(body.result.instructions).toContain("call api only when");
    expect(body.result.instructions).toContain("computer_use.enable");
    expect(body.result.instructions).toContain("computer_use.disable");
    expect(body.result.instructions).toContain('mode:"background" by default');
    expect(body.result.instructions).toContain("Use perform for a short deterministic sequence");
    expect(body.result.instructions).toContain("delivery or refused");
  });

  it("requires bearer auth before listing tools", async () => {
    ingress = new ComputerUseMcpIngress({ driver: createDriver() });
    const info = await ingress.start();

    const unauthorized = await fetch(`${info.url}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(unauthorized.status).toBe(401);

    const authorized = await fetch(`${info.url}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${info.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    });
    const body = (await authorized.json()) as { result: { tools: Array<{ name: string }> } };
    expect(body.result.tools.map((tool) => tool.name)).toContain("get_window_state");
  });

  it("emits thread activity only while an interactive tool is running", async () => {
    let resolveClick: ((result: ComputerUseInteractiveResult) => void) | undefined;
    const clickResult = new Promise<ComputerUseInteractiveResult>((resolve) => {
      resolveClick = resolve;
    });
    const onActivity = vi.fn<NonNullable<ComputerUseMcpIngressOptions["onActivity"]>>();
    ingress = new ComputerUseMcpIngress({
      driver: createDriver({
        click: vi.fn<ComputerUseDriver["click"]>(() => clickResult),
      }),
      onActivity,
    });
    const info = await ingress.start();

    const response = callTool(info, "click", {
      window: { app: "calc", id: 1 },
      x: 10,
      y: 20,
    });
    await vi.waitFor(() => {
      expect(onActivity).toHaveBeenCalledWith({
        kind: "action",
        threadId: "thread-1",
        toolName: "click",
        delivery: "background",
        active: true,
      });
    });
    expect(onActivity).toHaveBeenCalledTimes(1);

    resolveClick?.({
      ok: true,
      mode: "interactive",
      window: {
        app: "calc",
        id: 1,
        x: 2100,
        y: 100,
        width: 800,
        height: 600,
      },
      delivery: { delivered: "background", route: "message", verified: "unverified" },
    });
    expect((await response).status).toBe(200);
    expect(onActivity.mock.calls.map(([event]) => event.active)).toEqual([true, false]);
    expect(onActivity).toHaveBeenLastCalledWith({
      kind: "action",
      threadId: "thread-1",
      toolName: "click",
      delivery: "background",
      target: "calc",
      targetBounds: { x: 2100, y: 100, width: 800, height: 600 },
      active: false,
    });
  });

  it("holds takeover activity between explicit enable and disable calls", async () => {
    const onActivity = vi.fn<NonNullable<ComputerUseMcpIngressOptions["onActivity"]>>();
    ingress = new ComputerUseMcpIngress({ driver: createDriver(), onActivity });
    const info = await ingress.start();

    expect((await callTool(info, "enable", {})).status).toBe(200);
    expect((await callTool(info, "disable", {})).status).toBe(200);
    expect(onActivity.mock.calls.map(([event]) => event)).toEqual([
      { kind: "session", threadId: "thread-1", active: true },
      { kind: "session", threadId: "thread-1", active: false },
    ]);
  });

  it("does not attach a badge target to a refused background action", async () => {
    const onActivity = vi.fn<NonNullable<ComputerUseMcpIngressOptions["onActivity"]>>();
    ingress = new ComputerUseMcpIngress({
      driver: createDriver({
        click: vi.fn<ComputerUseDriver["click"]>().mockResolvedValue({
          ok: false,
          mode: "interactive",
          refused: {
            code: "background_unavailable",
            reason: "not safe",
            hint: "use an element action",
          },
        }),
      }),
      onActivity,
    });
    const info = await ingress.start();

    expect(
      (await callTool(info, "click", { window: { app: "calc", id: 1 }, x: 10, y: 20 })).status,
    ).toBe(200);
    expect(
      onActivity.mock.calls.map(([event]) => event).filter((event) => event.kind === "action"),
    ).toEqual([
      {
        kind: "action",
        threadId: "thread-1",
        toolName: "click",
        delivery: "background",
        active: true,
      },
      {
        kind: "action",
        threadId: "thread-1",
        toolName: "click",
        delivery: "background",
        active: false,
      },
    ]);
  });

  it("attaches one badge target after a delivered batch", async () => {
    const onActivity = vi.fn<NonNullable<ComputerUseMcpIngressOptions["onActivity"]>>();
    ingress = new ComputerUseMcpIngress({
      driver: createDriver({
        pressKey: vi.fn<ComputerUseDriver["pressKey"]>().mockResolvedValue({
          ok: true,
          mode: "interactive",
          delivery: { delivered: "background", route: "message", verified: "unverified" },
        }),
      }),
      onActivity,
    });
    const info = await ingress.start();

    expect(
      (
        await callTool(info, "perform", {
          window: { app: "calc", id: 1 },
          steps: [{ action: "press_key", key: "Escape" }],
        })
      ).status,
    ).toBe(200);
    expect(onActivity).toHaveBeenLastCalledWith({
      kind: "action",
      threadId: "thread-1",
      toolName: "perform",
      delivery: "background",
      target: "calc",
      active: false,
    });
  });

  it("ends the activity window before an observation capture, not after it", async () => {
    let releaseObservation: (() => void) | undefined;
    const observationStarted = new Promise<void>((resolve) => {
      releaseObservation = resolve;
    });
    const onActivity = vi.fn<NonNullable<ComputerUseMcpIngressOptions["onActivity"]>>();
    let activeAtObservation: boolean[] = [];
    ingress = new ComputerUseMcpIngress({
      driver: createDriver({
        pressKey: vi.fn<ComputerUseDriver["pressKey"]>().mockResolvedValue({
          ok: true,
          mode: "interactive",
          window: { app: "calc", id: 1 },
          delivery: { delivered: "foreground", route: "input", verified: "unverified" },
        }),
        getWindowState: vi
          .fn<ComputerUseDriver["getWindowState"]>()
          .mockImplementation(async () => {
            // Snapshot what the overlay has been told by the time the capture runs:
            // a foreground press_key suppresses Escape for the whole activity
            // window, so the window must already be closed here.
            activeAtObservation = onActivity.mock.calls.map(([event]) => event.active);
            await observationStarted;
            return {
              accessibility: null,
              mode: "passive",
              screenshots: [],
              window: { app: "calc", id: 1 },
            };
          }),
      }),
      onActivity,
    });
    const info = await ingress.start();

    const response = callTool(info, "press_key", {
      window: { app: "calc", id: 1 },
      key: "Escape",
      mode: "foreground",
      observe: "text",
    });
    releaseObservation?.();
    expect((await response).status).toBe(200);

    expect(activeAtObservation).toEqual([true, false]);
  });

  it("reports an unexpected foreground escalation in a batch before observing", async () => {
    const onActivity = vi.fn<NonNullable<ComputerUseMcpIngressOptions["onActivity"]>>();
    let deliveriesAtObservation: Array<string | null> = [];
    ingress = new ComputerUseMcpIngress({
      driver: createDriver({
        pressKey: vi.fn<ComputerUseDriver["pressKey"]>().mockResolvedValue({
          ok: true,
          mode: "interactive",
          window: { app: "calc", id: 1 },
          delivery: { delivered: "foreground", route: "input", verified: "unverified" },
        }),
        getWindowState: vi
          .fn<ComputerUseDriver["getWindowState"]>()
          .mockImplementation(async () => {
            deliveriesAtObservation = onActivity.mock.calls.map(([event]) =>
              event.kind === "action" ? event.delivery : null,
            );
            return {
              accessibility: null,
              mode: "passive",
              screenshots: [],
              window: { app: "calc", id: 1 },
            };
          }),
      }),
      onActivity,
    });
    const info = await ingress.start();

    expect(
      (
        await callTool(info, "perform", {
          window: { app: "calc", id: 1 },
          steps: [{ action: "press_key", key: "Enter" }],
          observe: "text",
        })
      ).status,
    ).toBe(200);

    // The takeover border must already be raised when the capture starts.
    expect(deliveriesAtObservation).toContain("foreground");
  });

  it("does not emit takeover activity for passive tools", async () => {
    const onActivity = vi.fn<NonNullable<ComputerUseMcpIngressOptions["onActivity"]>>();
    ingress = new ComputerUseMcpIngress({ driver: createDriver(), onActivity });
    const info = await ingress.start();

    expect((await callTool(info, "list_windows", {})).status).toBe(200);
    expect(onActivity).not.toHaveBeenCalled();
  });

  it("cancels active driver actions on emergency exit", () => {
    const driver = createDriver();
    ingress = new ComputerUseMcpIngress({ driver });

    ingress.interruptActiveActions();

    expect(driver.dispose).toHaveBeenCalledOnce();
  });

  it("normalizes interactive tool aliases in activity events", async () => {
    const onActivity = vi.fn<NonNullable<ComputerUseMcpIngressOptions["onActivity"]>>();
    ingress = new ComputerUseMcpIngress({ driver: createDriver(), onActivity });
    const info = await ingress.start();

    expect(
      (await callTool(info, "key", { window: { app: "calc", id: 1 }, key: "Escape" })).status,
    ).toBe(200);
    expect(
      onActivity.mock.calls.map(([event]) => (event.kind === "action" ? event.toolName : null)),
    ).toEqual(["press_key", "press_key"]);
  });

  it("marks native Wayland portal input as foreground while the action is running", async () => {
    let resolveClick: ((result: ComputerUseInteractiveResult) => void) | undefined;
    const clickResult = new Promise<ComputerUseInteractiveResult>((resolve) => {
      resolveClick = resolve;
    });
    const onActivity = vi.fn<NonNullable<ComputerUseMcpIngressOptions["onActivity"]>>();
    ingress = new ComputerUseMcpIngress({
      driver: createDriver({
        click: vi.fn<ComputerUseDriver["click"]>(() => clickResult),
      }),
      onActivity,
    });
    const info = await ingress.start();

    const response = callTool(info, "click", {
      window: { app: "editor", id: -1, source: "atspi" },
      x: 10,
      y: 20,
    });
    await vi.waitFor(() => {
      expect(onActivity).toHaveBeenCalledWith({
        kind: "action",
        threadId: "thread-1",
        toolName: "click",
        delivery: "foreground",
        active: true,
      });
    });
    expect(onActivity).toHaveBeenCalledTimes(1);

    resolveClick?.({
      ok: true,
      mode: "interactive",
      delivery: {
        delivered: "foreground",
        route: "input",
        verified: "unverified",
        notes: ["wayland_portal_fallback"],
      },
    });
    expect((await response).status).toBe(200);
    expect(
      onActivity.mock.calls.map(([event]) =>
        event.kind === "action" ? [event.delivery, event.active] : null,
      ),
    ).toEqual([
      ["foreground", true],
      ["foreground", false],
    ]);
  });
});
