import { afterEach, describe, expect, it, vi } from "vitest";
import { ComputerUseMcpIngress, type ComputerUseMcpIngressOptions } from "./ComputerUseMcpIngress";
import type { ComputerUseDriver, ComputerUseInteractiveResult } from "./mcp/types";

let ingress: ComputerUseMcpIngress | null = null;

function createDriver(overrides: Partial<ComputerUseDriver> = {}): ComputerUseDriver {
  return {
    activateWindow: vi.fn<ComputerUseDriver["activateWindow"]>(),
    click: vi.fn<ComputerUseDriver["click"]>(),
    dispose: vi.fn<ComputerUseDriver["dispose"]>(),
    drag: vi.fn<ComputerUseDriver["drag"]>(),
    getWindow: vi.fn<ComputerUseDriver["getWindow"]>(),
    getWindowState: vi.fn<ComputerUseDriver["getWindowState"]>(),
    launchApp: vi.fn<ComputerUseDriver["launchApp"]>(),
    listApps: vi.fn<ComputerUseDriver["listApps"]>(),
    listWindows: vi.fn<ComputerUseDriver["listWindows"]>().mockResolvedValue([]),
    pressKey: vi.fn<ComputerUseDriver["pressKey"]>(),
    scroll: vi.fn<ComputerUseDriver["scroll"]>(),
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
  it("advertises computer_use instructions and tools on initialize", async () => {
    ingress = new ComputerUseMcpIngress();
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
        serverInfo: { name: string };
        instructions: string;
      };
    };

    expect(body.result.serverInfo.name).toBe("computer_use");
    expect(body.result.instructions).toContain("computer_use.api");
    expect(body.result.instructions).toContain("switch to interactive mode");
  });

  it("requires bearer auth before listing tools", async () => {
    ingress = new ComputerUseMcpIngress();
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
        threadId: "thread-1",
        toolName: "click",
        active: true,
      });
    });
    expect(onActivity).toHaveBeenCalledTimes(1);

    resolveClick?.({ ok: true, mode: "interactive" });
    expect((await response).status).toBe(200);
    expect(onActivity.mock.calls.map(([event]) => event.active)).toEqual([true, false]);
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
    expect(onActivity.mock.calls.map(([event]) => event.toolName)).toEqual([
      "press_key",
      "press_key",
    ]);
  });
});
