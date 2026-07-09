import { afterEach, describe, expect, it } from "vitest";
import { ComputerUseMcpIngress } from "./ComputerUseMcpIngress";

let ingress: ComputerUseMcpIngress | null = null;

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
});
