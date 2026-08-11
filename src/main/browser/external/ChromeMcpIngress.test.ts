import { afterEach, describe, expect, it, vi } from "vitest";
import { ChromeMcpIngress } from "./ChromeMcpIngress";
import type { ExternalChromeConnection } from "./ExternalChromeConnection";

let ingress: ChromeMcpIngress | null = null;

async function postMcp(
  info: { url: string; token: string },
  body: Record<string, unknown>,
  query = "",
): Promise<Response> {
  return await fetch(`${info.url}/mcp${query}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${info.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  ingress?.dispose();
  ingress = null;
});

describe("ChromeMcpIngress", () => {
  it("advertises Chrome instructions and tools through the shared transport", async () => {
    ingress = new ChromeMcpIngress();
    const info = await ingress.start();

    const initialize = await postMcp(info, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    });
    const initializeBody = (await initialize.json()) as {
      result: { serverInfo: { name: string }; instructions: string };
    };
    expect(initializeBody.result.serverInfo.name).toBe("chrome");
    expect(initializeBody.result.instructions).toContain("USER'S OWN Chrome");
    expect(initializeBody.result.instructions).toContain("chrome.enable");
    expect(initializeBody.result.instructions).toContain("chrome.disable");

    const list = await postMcp(info, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    const listBody = (await list.json()) as {
      result: { tools: Array<{ name: string; annotations?: Record<string, boolean> }> };
    };
    expect(listBody.result.tools.map((tool) => tool.name)).toContain("chrome_status");
    expect(listBody.result.tools.map((tool) => tool.name)).toContain("enable");
    expect(listBody.result.tools.map((tool) => tool.name)).toContain("disable");
    expect(
      listBody.result.tools.find((tool) => tool.name === "chrome_snapshot")?.annotations,
    ).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(
      listBody.result.tools.find((tool) => tool.name === "chrome_click")?.annotations,
    ).toMatchObject({ readOnlyHint: false, destructiveHint: true, openWorldHint: true });
  });

  it("routes Chrome tool calls and formats their result", async () => {
    ingress = new ChromeMcpIngress();
    const info = await ingress.start();

    const response = await postMcp(info, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "chrome_status", arguments: {} },
    });
    const body = (await response.json()) as {
      result: { content: Array<{ type: string; text?: string }>; isError?: boolean };
    };

    expect(body.result.isError).toBeUndefined();
    expect(body.result.content[0]?.text).toContain('"connected": false');
  });

  it("passes the connection, permission flags, and thread identity to Chrome tools", async () => {
    const send = vi.fn<(method: string) => Promise<unknown>>(async (method) => {
      if (method === "Runtime.evaluate") {
        return { result: { type: "number", value: 2 } };
      }
      if (method === "Network.getCookies") {
        return { cookies: [] };
      }
      return {};
    });
    const openTab = vi
      .fn<(url?: string, options?: Record<string, unknown>) => Promise<unknown>>()
      .mockResolvedValue({ id: 7, url: "https://example.test" });
    const connection = {
      cdpSession: () => ({ send }),
      openTab,
    } as unknown as ExternalChromeConnection;
    ingress = new ChromeMcpIngress();
    ingress.setConnectionAccessor(() => connection);
    ingress.setAllowEval(true);
    ingress.setAllowDataAccess(true);
    const info = await ingress.start();
    const query = "?thread=thread-1&title=Review%20PR";

    await postMcp(
      info,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "chrome_open",
          arguments: { url: "https://example.test" },
        },
      },
      query,
    );
    expect(openTab).toHaveBeenCalledWith(
      "https://example.test",
      expect.objectContaining({
        reuse: true,
        groupKey: "thread-1",
        groupTitle: "Review PR",
        groupColor: expect.any(String),
      }),
    );

    const evaluate = await postMcp(
      info,
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "chrome_eval", arguments: { js: "1 + 1" } },
      },
      query,
    );
    const evaluateBody = (await evaluate.json()) as {
      result: { content: Array<{ text?: string }> };
    };
    expect(evaluateBody.result.content[0]?.text).toContain('"result": 2');

    const cookies = await postMcp(
      info,
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "chrome_cookies", arguments: {} },
      },
      query,
    );
    expect(cookies.status).toBe(200);
    expect(send).toHaveBeenCalledWith("Network.getCookies", {});
  });
});
