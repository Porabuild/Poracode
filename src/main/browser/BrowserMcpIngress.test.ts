import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserMcpIngress } from "./BrowserMcpIngress";
import { AgentVisionService } from "@/host/AgentVisionService";
import type { BrowserPanelManager } from "./BrowserPanelManager";

let ingress: BrowserMcpIngress | null = null;

afterEach(async () => {
  await ingress?.dispose();
  ingress = null;
});

describe("BrowserMcpIngress", () => {
  it("advertises browser instructions and API discovery on initialize", async () => {
    ingress = new BrowserMcpIngress();
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

    expect(body.result.serverInfo.name).toBe("browser");
    expect(body.result.instructions).toContain("Use the browser MCP server");
    expect(body.result.instructions).toContain("load the browser-control skill by name");
    expect(body.result.instructions).toContain("browser.enable");
    expect(body.result.instructions).toContain("browser.disable");
    expect(body.result.instructions).toContain("browser.api");
    expect(body.result.instructions).toContain("@e refs");
  });

  it("routes MCP reload, get_url, and fill through the browser panel tab", async () => {
    ingress = new BrowserMcpIngress();
    const vision = new AgentVisionService();
    ingress.setAgentVision(vision);
    const send = vi.fn<(method: string, params?: Record<string, unknown>) => Promise<unknown>>(
      async (method) => {
        if (method === "Runtime.evaluate") {
          return { result: { type: "boolean", value: true } };
        }
        return {};
      },
    );
    const revealPanel = vi.fn<() => void>();
    const reloadGate = Promise.withResolvers<void>();
    const tab = {
      tabId: "tab-1",
      isDestroyed: () => false,
      isAttached: () => true,
      snapshot: () => ({ url: "https://example.test/page", title: "Example Page" }),
      webContents: {
        capturePage: vi.fn<() => Promise<unknown>>().mockResolvedValue({
          getSize: () => ({ width: 600, height: 400 }),
          toJPEG: () => Buffer.from("painted browser frame"),
        }),
        focus: vi.fn<() => void>(),
        executeJavaScript: vi
          .fn<(script: string, userGesture?: boolean) => Promise<unknown>>()
          .mockResolvedValue(true),
      },
      cdp: {
        attach: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        send,
      },
    };
    ingress.setManagerAccessor(
      () =>
        ({
          revealPanel,
          snapshot: () => ({
            tabs: [
              {
                tabId: "tab-1",
                url: "https://example.test/page",
                title: "Example Page",
                loading: false,
                canGoBack: false,
                canGoForward: false,
                devToolsOpen: false,
              },
            ],
            activeTabId: "tab-1",
          }),
          getActiveTab: () => tab,
          getTab: () => tab,
          ensureTabReady: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
          createTab: vi.fn<() => Promise<unknown>>().mockResolvedValue({ tabId: "tab-1" }),
          setAutomationSession: vi.fn<() => boolean>().mockReturnValue(true),
          reload: vi.fn<() => Promise<void>>(() => reloadGate.promise),
        }) as unknown as BrowserPanelManager,
    );
    const info = await ingress.start();

    const callTool = async (name: string, args: Record<string, unknown>) => {
      const response = await fetch(`${info.url}/mcp?thread=vision-thread`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${info.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: name,
          method: "tools/call",
          params: { name, arguments: args },
        }),
      });
      return (await response.json()) as {
        result: { content: Array<{ type: "text"; text: string }>; isError?: boolean };
      };
    };

    const api = await callTool("api", {});
    expect(api.result.isError).toBeUndefined();

    const reloading = callTool("reload", {});
    await vi.waitFor(async () => {
      expect(await vision.read("vision-thread", false)).toMatchObject({ status: "running" });
    });
    expect(await vision.read("vision-thread")).toMatchObject({
      status: "running",
      image: `data:image/jpeg;base64,${Buffer.from("painted browser frame").toString("base64")}`,
    });
    reloadGate.resolve();
    const reload = await reloading;
    expect(reload.result.isError).toBeUndefined();
    await expect(callTool("get_url", {})).resolves.toMatchObject({
      result: { content: [{ type: "text", text: '{\n  "url": "https://example.test/page"\n}' }] },
    });
    const fill = await callTool("fill", { selector: "input", text: "hello", submit: true });
    expect(fill.result.isError).toBeUndefined();
    const click = await callTool("click", { selector: "button" });
    expect(click.result.isError).toBeUndefined();
    const type = await callTool("type", { selector: "input", text: "hello" });
    expect(type.result.isError).toBeUndefined();
    const press = await callTool("press", { selector: "input", key: "Enter" });
    expect(press.result.isError).toBeUndefined();

    // Agent tool calls run headless: they must NOT force the browser panel
    // open (the tab's <webview> stays alive off-screen instead).
    expect(revealPanel).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalledWith("Input.insertText", { text: "hello" });
    expect(send.mock.calls.some(([method]) => String(method).startsWith("Input."))).toBe(false);
    expect(tab.webContents.executeJavaScript).toHaveBeenCalled();
    expect(
      tab.webContents.executeJavaScript.mock.calls.some(([script]) =>
        String(script).includes('press("Enter", "input", false)'),
      ),
    ).toBe(true);
    expect(tab.webContents.focus).not.toHaveBeenCalled();
    expect((await callTool("screenshot", { format: "jpeg" })).result.isError).toBeUndefined();
    expect(await vision.read("vision-thread", false)).toMatchObject({ status: "idle" });
    expect(await vision.read("vision-thread")).toMatchObject({
      image: `data:image/jpeg;base64,${Buffer.from("painted browser frame").toString("base64")}`,
    });
    expect(tab.webContents.capturePage).toHaveBeenCalledTimes(3);
  });
});
