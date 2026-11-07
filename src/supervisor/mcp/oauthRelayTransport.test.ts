import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { RelaySseEndpoint, relayRequestHeaders, relayResponseHeaders } from "./oauthRelayTransport";

describe("MCP relay headers", () => {
  it("preserves protocol, session, resume and extension headers in both directions", () => {
    const headers = {
      "mcp-protocol-version": "2025-11-25",
      "mcp-session-id": "session-one",
      "last-event-id": "event-one",
      "mcp-method": "tools/call",
      "mcp-name": "example-tool",
      "x-tool-context": "context-one",
    };
    const requestHeaders = relayRequestHeaders(headers);
    for (const [name, value] of Object.entries(headers)) {
      expect(requestHeaders.get(name)).toBe(value);
    }
    expect(relayResponseHeaders(new Headers(headers))).toEqual(headers);
  });
});

describe("legacy MCP SSE endpoint forwarding", () => {
  it.each(["\n", "\r\n", "\r", "\uFEFF\n", "\uFEFF\r\n", "\uFEFF\r"])(
    "preserves a large UTF-8 message split after the %j endpoint event",
    async (newline) => {
      const bom = newline.startsWith("\uFEFF") ? "\uFEFF" : "";
      const separator = newline.replace("\uFEFF", "");
      const header = Buffer.from(
        `${bom}event: endpoint${separator}data: /messages${separator}${separator}`,
      );
      const message = Buffer.from(
        `event: message\ndata: ${JSON.stringify({ text: `🧪${"x".repeat(80_000)}` })}\n\n`,
      );
      const split = message.indexOf(Buffer.from("🧪")) + 2;
      const input = Readable.from([
        Buffer.concat([header, message.subarray(0, split)]),
        message.subarray(split),
      ]);
      const chunks: Buffer[] = [];
      for await (const chunk of input.pipe(new RelaySseEndpoint((url) => `/relay${url}`))) {
        chunks.push(chunk as Buffer);
      }
      expect(Buffer.concat(chunks)).toEqual(
        Buffer.concat([Buffer.from("event: endpoint\ndata: /relay/messages\n\n"), message]),
      );
    },
  );
});
