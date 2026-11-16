import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JSONRPCMessage } from "@modelcontextprotocol/server";
import { McpFramedTransport, createFramedMcpChild } from "./mcpFramedTransport";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.allSettled(cleanups.splice(0).map((close) => close()));
});

async function fixture() {
  const input = new PassThrough();
  const output = new PassThrough();
  const transport = new McpFramedTransport(input, output);
  cleanups.push(() => transport.close());
  const messages: JSONRPCMessage[] = [];
  const errors: Error[] = [];
  transport.onmessage = (message) => messages.push(message);
  transport.onerror = (error) => errors.push(error);
  const closed = vi.fn<() => void>();
  transport.onclose = closed;
  await transport.start();
  return { transport, input, output, messages, errors, closed };
}

describe("native MCP stdio framing", () => {
  it("reads chunked Content-Length UTF-8 frames and replies in the same framing", async () => {
    const f = await fixture();
    const message = { jsonrpc: "2.0" as const, id: 1, result: { text: "héllo 👋" } };
    const body = JSON.stringify(message);
    const frame = Buffer.from(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    for (const byte of frame) f.input.write(Buffer.from([byte]));
    expect(f.messages).toEqual([message]);
    await f.transport.send(message);
    expect(f.output.read()?.toString()).toBe(frame.toString());
    expect(f.errors).toEqual([]);
  });

  it("reads blank lines and multiple NDJSON messages without altering payloads", async () => {
    const f = await fixture();
    const message = { jsonrpc: "2.0" as const, method: "notifications/initialized" };
    f.input.write(`\r\n${JSON.stringify(message)}\n${JSON.stringify(message)}\n`);
    expect(f.messages).toEqual([message, message]);
    await f.transport.send(message);
    expect(f.output.read()?.toString()).toBe(`${JSON.stringify(message)}\n`);
    f.input.end();
    await vi.waitFor(() => expect(f.closed).toHaveBeenCalledTimes(1));
    await f.transport.close();
    expect(f.closed).toHaveBeenCalledTimes(1);
    await expect(f.transport.send(message)).rejects.toThrow("closed");
  });

  it.each(["Content-Length: 999999999\r\n\r\n", "{not-json}\n"])(
    "closes a malformed or oversized frame: %s",
    async (frame) => {
      const f = await fixture();
      f.input.write(frame);
      expect(f.errors).toHaveLength(1);
      expect(f.closed).toHaveBeenCalledTimes(1);
      expect(f.messages).toEqual([]);
    },
  );

  it.each(["line", "content-length"] as const)(
    "forwards %s to a real subprocess and drains its final response before closing",
    async (framing) => {
      const message = { jsonrpc: "2.0" as const, id: 1, method: "ping" };
      const script = `
        process.stdin.once('data', chunk => {
          process.stdout.write(chunk, () => process.exit(0));
        });
      `;
      const transport = createFramedMcpChild({
        command: process.execPath,
        args: ["-e", script],
        env: {},
        framing: () => framing,
      });
      cleanups.push(() => transport.close());
      const events: unknown[] = [];
      transport.onmessage = (received) => events.push(received);
      transport.onclose = () => events.push("closed");
      await transport.start();
      await transport.send(message);
      await vi.waitFor(() => expect(events).toEqual([message, "closed"]));
    },
  );

  it("terminates an active subprocess and closes only once", async () => {
    const transport = createFramedMcpChild({
      command: process.execPath,
      args: ["-e", "setInterval(() => {}, 1000)"],
      env: {},
      framing: () => "line",
    });
    cleanups.push(() => transport.close());
    const closed = vi.fn<() => void>();
    transport.onclose = closed;
    await transport.start();
    await Promise.all([transport.close(), transport.close()]);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing executable and allows cleanup", async () => {
    const transport = createFramedMcpChild({
      command: "/poracode-missing-mcp-executable",
      args: [],
      env: {},
      framing: () => "line",
    });
    const errors = vi.fn<(error: Error) => void>();
    transport.onerror = errors;
    cleanups.push(() => transport.close());
    await expect(transport.start()).rejects.toThrow("failed to start");
    await vi.waitFor(() => expect(errors).toHaveBeenCalled());
    await transport.close();
  });
});
