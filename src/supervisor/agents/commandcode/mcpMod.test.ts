import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedMcpServer } from "@/shared/contracts";
import {
  commandCodeMcpToolName,
  commandCodeToolResult,
  registerCommandCodeMcpTools,
  type CommandCodeModApi,
} from "./mcpMod";

const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});

function modApi() {
  const tools: Parameters<CommandCodeModApi["addTool"]>[0][] = [];
  const dispose = vi.fn<() => void>();
  return {
    tools,
    dispose,
    api: {
      addTool: (tool) => {
        tools.push(tool);
        return { dispose };
      },
      ui: { notify: vi.fn<(message: string) => void>() },
    } satisfies CommandCodeModApi,
  };
}

async function httpFixture(type: "http" | "sse") {
  let stream: ServerResponse | undefined;
  const calls: unknown[] = [];
  const requests: string[] = [];
  const authorization: (string | undefined)[] = [];
  const server = createServer((req, res) => {
    void (async () => {
      authorization.push(req.headers.authorization);
      if (req.method === "GET") {
        if (type === "http") {
          res.writeHead(405).end();
          return;
        }
        stream = res;
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write("event: endpoint\ndata: /messages\n\n");
        return;
      }
      if (req.method !== "POST") {
        res.writeHead(200).end();
        return;
      }
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const message = JSON.parse(Buffer.concat(chunks).toString());
      requests.push(message.method);
      if (message.id === undefined) {
        res.writeHead(202).end();
        return;
      }
      let result;
      if (message.method === "initialize")
        result = {
          protocolVersion: message.params.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: "fixture", version: "1" },
        };
      else if (message.method === "tools/list")
        result = message.params?.cursor
          ? { tools: [{ name: "second", inputSchema: { type: "object" } }] }
          : {
              tools: [
                { name: "echo", inputSchema: { type: "object" } },
                { name: "disabled", inputSchema: { type: "object" } },
              ],
              nextCursor: "next",
            };
      else {
        calls.push(message.params);
        result = { content: [{ type: "text", text: "verified" }] };
      }
      const response = JSON.stringify({ jsonrpc: "2.0", id: message.id, result });
      if (stream) {
        stream.write(`event: message\ndata: ${response}\n\n`);
        res.writeHead(202).end();
      } else res.writeHead(200, { "content-type": "application/json" }).end(response);
    })().catch((error: Error) => res.destroy(error));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(() => {
    stream?.end();
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing port");
  const descriptor: ResolvedMcpServer = {
    id: "fixture",
    name: "fixture",
    timeoutMs: 2000,
    disabledTools: ["disabled"],
    transport: {
      type,
      url: `http://127.0.0.1:${address.port}/mcp`,
      headers: { Authorization: "Bearer fixture" },
    },
  };
  return { descriptor, calls, requests, authorization };
}

describe("Command Code MCP mod", () => {
  it.each(["http", "sse"] as const)(
    "connects %s, lists all pages, filters disabled tools and executes calls",
    async (type) => {
      const fixture = await httpFixture(type);
      const mod = modApi();
      cleanup.push(await registerCommandCodeMcpTools(mod.api, [fixture.descriptor]));
      expect(mod.api.ui.notify).not.toHaveBeenCalled();
      expect(mod.tools.map((tool) => tool.schema.name)).toEqual([
        expect.stringMatching(/^mcp__fixture__echo_[a-f0-9]{12}$/),
        expect.stringMatching(/^mcp__fixture__second_[a-f0-9]{12}$/),
      ]);
      expect(mod.tools.every((tool) => tool.readOnly === false)).toBe(true);
      expect(mod.tools[0]!.schema.input_schema).toEqual({
        type: "object",
        properties: {},
        required: [],
      });
      await expect(mod.tools[0]!.run({ input: { value: "input" } })).resolves.toEqual({
        ok: true,
        content: [{ type: "text", text: "verified" }],
      });
      expect(fixture.calls).toEqual([{ name: "echo", arguments: { value: "input" } }]);
      expect(fixture.requests).toContain("notifications/initialized");
      expect(fixture.authorization.length).toBeGreaterThan(0);
      expect(fixture.authorization.every((value) => value === "Bearer fixture")).toBe(true);
    },
  );

  it("calls a stdio server with its configured environment and working directory", async () => {
    const mod = modApi();
    const script = `const readline = require("node:readline");
      readline.createInterface({input: process.stdin}).on("line", line => {
        const message = JSON.parse(line);
        if (message.id === undefined) return;
        const result = message.method === "initialize"
          ? {protocolVersion: message.params.protocolVersion, capabilities: {tools:{}}, serverInfo: {name:"fixture", version:"1"}}
          : message.method === "tools/list"
          ? {tools:[{name:"echo", inputSchema:{type:"object"}}]}
          : {content:[{type:"text", text:process.cwd() + ":" + process.env.PROOF}]};
        process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:message.id,result}) + "\\n");
      });`;
    cleanup.push(
      await registerCommandCodeMcpTools(mod.api, [
        {
          id: "stdio",
          name: "stdio",
          timeoutMs: 5000,
          transport: {
            type: "stdio",
            command: process.execPath,
            args: ["-e", script],
            env: { PROOF: "configured" },
            cwd: process.cwd(),
          },
        },
      ]),
    );
    expect(mod.api.ui.notify).not.toHaveBeenCalled();
    expect(mod.tools[0]!.schema.input_schema).toEqual({
      type: "object",
      properties: {},
      required: [],
    });
    await expect(mod.tools[0]!.run({ input: {} })).resolves.toEqual({
      ok: true,
      content: [{ type: "text", text: process.cwd() + ":configured" }],
    });
  });

  it("normalizes plugin names without colliding or exceeding model limits", () => {
    const first = commandCodeMcpToolName("plugin.server", "tool/name");
    expect(commandCodeMcpToolName("a__b", "c")).not.toBe(commandCodeMcpToolName("a", "b__c"));
    expect(commandCodeMcpToolName("a_", "b")).not.toBe(commandCodeMcpToolName("a", "_b"));
    expect(first).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    expect(first).not.toBe(commandCodeMcpToolName("plugin_server", "tool_name"));
    expect(commandCodeMcpToolName("a".repeat(80), "b".repeat(80))).toHaveLength(64);
  });

  it("reports failed connections without leaking configured credentials", async () => {
    const mod = modApi();
    cleanup.push(
      await registerCommandCodeMcpTools(mod.api, [
        {
          id: "bad",
          name: "bad",
          timeoutMs: 200,
          transport: {
            type: "stdio",
            command: "/no-such-command",
            args: [],
            env: { SECRET: "do-not-log" },
          },
        },
      ]),
    );
    expect(mod.tools).toEqual([]);
    expect(mod.api.ui.notify).toHaveBeenCalledExactlyOnceWith(
      "Poracode could not connect MCP server bad.",
    );
  });

  it("maps images, structured data and errors to Command Code's tool result shape", () => {
    expect(
      commandCodeToolResult({
        content: [{ type: "image", data: "aGVsbG8=", mimeType: "image/png" }],
        structuredContent: { x: 1 },
      }),
    ).toEqual({
      ok: true,
      content: [
        { type: "image", source: { type: "base64", data: "aGVsbG8=", media_type: "image/png" } },
        { type: "text", text: '{"x":1}' },
      ],
    });
    expect(
      commandCodeToolResult({ isError: true, content: [{ type: "text", text: "failed" }] }),
    ).toEqual({ ok: false, error: "failed" });
  });
});
