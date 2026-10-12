import type { AnyMessage } from "@agentclientprotocol/sdk";
import { describe, expect, it, vi } from "vitest";
import { createAcpInboundStream } from "./sessionInboundStream";

const prompt: AnyMessage = {
  jsonrpc: "2.0",
  id: 7,
  method: "session/prompt",
  params: { sessionId: "restored-session", prompt: [{ type: "text", text: "continue 🙂" }] },
};

describe("ACP outbound byte-write boundary", () => {
  it("runs synchronously after framing's write tail and before prompt bytes reach the sink", async () => {
    const blocked = Promise.withResolvers<void>();
    const parseErrorWritten = Promise.withResolvers<void>();
    const promptWritten = Promise.withResolvers<void>();
    const calls: string[] = [];
    const bytesWritten: string[] = [];
    const output = new WritableStream<Uint8Array>({
      async write(bytes) {
        const text = new TextDecoder().decode(bytes);
        bytesWritten.push(text);
        const message = JSON.parse(text) as AnyMessage;
        if ("error" in message) {
          calls.push("parse-error.write");
          parseErrorWritten.resolve();
          await blocked.promise;
          calls.push("parse-error.completed");
        } else {
          calls.push("prompt.write");
          promptWritten.resolve();
        }
      },
    });
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const input = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
      },
    });
    const onBeforeWrite = vi.fn<(message: AnyMessage) => void>((message) => {
      calls.push("error" in message ? "parse-error.before" : "prompt.before");
    });
    const stream = createAcpInboundStream(output, input, { onBeforeWrite });
    const reader = stream.readable.getReader();
    const read = reader.read();
    controller.enqueue(new TextEncoder().encode("{broken}\n"));
    await parseErrorWritten.promise;
    const writer = stream.writable.getWriter();
    const writing = writer.write(prompt);
    try {
      await Promise.resolve();
      await Promise.resolve();
      expect(calls).toEqual(["parse-error.before", "parse-error.write"]);
      expect(onBeforeWrite).toHaveBeenCalledTimes(1);
      blocked.resolve();
      await promptWritten.promise;
      await writing;
      expect(calls).toEqual([
        "parse-error.before",
        "parse-error.write",
        "parse-error.completed",
        "prompt.before",
        "prompt.write",
      ]);
      expect(onBeforeWrite).toHaveBeenLastCalledWith(prompt);
      expect(bytesWritten).toEqual([
        `${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`,
        `${JSON.stringify(prompt)}\n`,
      ]);
    } finally {
      blocked.resolve();
      await writing.catch(() => {});
      writer.releaseLock();
      await reader.cancel();
      await read;
    }
  });

  it("does not announce a dispatch if acquiring the output writer fails", async () => {
    const output = new WritableStream<Uint8Array>();
    const held = output.getWriter();
    const onBeforeWrite = vi.fn<(message: AnyMessage) => void>();
    const stream = createAcpInboundStream(output, new ReadableStream(), { onBeforeWrite });
    const writer = stream.writable.getWriter();
    try {
      await expect(writer.write(prompt)).rejects.toBeInstanceOf(TypeError);
      expect(onBeforeWrite).not.toHaveBeenCalled();
    } finally {
      writer.releaseLock();
      held.releaseLock();
      await stream.readable.cancel();
    }
  });
});
