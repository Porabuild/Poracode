import { afterEach, describe, expect, it, vi } from "vitest";
import { registerPiMcpTools, piMcpToolResult, type PiMcpExtensionApi } from "./mcpExtension";

afterEach(() => vi.restoreAllMocks());

describe("Pi MCP extension", () => {
  it("connects a stdio server and exposes callable tools while retaining result content", async () => {
    const tools: Parameters<PiMcpExtensionApi["registerTool"]>[0][] = [];
    const close = await registerPiMcpTools(
      {
        registerTool: (tool) => {
          tools.push(tool);
        },
        on() {},
      },
      [
        {
          id: "fixture",
          name: "fixture",
          timeoutMs: 5000,
          transport: {
            type: "stdio",
            command: process.execPath,
            args: [
              "-e",
              `
        const readline = require('node:readline');
        readline.createInterface({ input: process.stdin }).on('line', line => {
          const m = JSON.parse(line);
          if (m.id === undefined) return;
          const result = m.method === 'initialize'
            ? { protocolVersion: m.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } }
            : m.method === 'tools/list' ? { tools: [{ name: 'proof', inputSchema: { type: 'object', properties: {} } }] }
            : { content: [{ type: 'text', text: process.env.FIXTURE_ENV }] };
          process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }) + '\\n');
        });
      `,
            ],
            env: { FIXTURE_ENV: "verified" },
          },
        },
      ],
    );
    try {
      expect(tools).toHaveLength(1);
      expect(await tools[0]!.execute("call", {})).toMatchObject({
        content: [{ type: "text", text: "verified" }],
      });
    } finally {
      await close();
    }
  });

  it("retains images and structured data and surfaces tool errors", () => {
    const image = { type: "image" as const, data: "aGVsbG8=", mimeType: "image/png" };
    expect(piMcpToolResult({ content: [image], structuredContent: { value: 1 } }).content).toEqual([
      image,
      { type: "text", text: '{"value":1}' },
    ]);
    expect(() =>
      piMcpToolResult({ isError: true, content: [{ type: "text", text: "failed" }] }),
    ).toThrow("failed");
  });
});
