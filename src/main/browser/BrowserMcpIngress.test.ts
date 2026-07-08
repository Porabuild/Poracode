import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserMcpIngress } from "./BrowserMcpIngress";
import type { BrowserPanelManager } from "./BrowserPanelManager";

let ingress: BrowserMcpIngress | null = null;

afterEach(() => {
  ingress?.dispose();
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
    expect(body.result.instructions).toContain("browser.api");
    expect(body.result.instructions).toContain("@e refs");
  });

  it("routes MCP reload, get_url, and fill through the browser panel tab", async () => {
    ingress = new BrowserMcpIngress();
    const send = vi.fn<(method: string, params?: Record<string, unknown>) => Promise<unknown>>(
      async (method) => {
        if (method === "Runtime.evaluate") {
          return { result: { type: "boolean", value: true } };
        }
        return {};
      },
    );
    const revealPanel = vi.fn<() => void>();
    const tab = {
      tabId: "tab-1",
      snapshot: () => ({ url: "https://example.test/page", title: "Example Page" }),
      webContents: {
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
          reload: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        }) as unknown as BrowserPanelManager,
    );
    const info = await ingress.start();

    const callTool = async (name: string, args: Record<string, unknown>) => {
      const response = await fetch(`${info.url}/mcp`, {
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

    const reload = await callTool("reload", {});
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
  });
});
