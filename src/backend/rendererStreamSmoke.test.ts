import { createHash } from "node:crypto";
import { BACKEND_RENDERER_STREAM_VERSION } from "@/shared/backendHostProtocol";
import { describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { BackendRendererStream } from "./BackendRendererStream";

/**
 * Focused large-reply smoke: a 200KB reply fragments into bounded frames and
 * reassembles with hash equality over a real WebSocket (production stream).
 */
describe("large-reply smoke", () => {
  it("delivers 200KB chunked with hash equality", async () => {
    const big = { blob: "z".repeat(200_000) };
    const expected = createHash("sha256").update(JSON.stringify(big), "utf8").digest("hex");
    const stream = new BackendRendererStream({ onRequest: async () => big });
    try {
      const info = await stream.start();
      const socket = new WebSocket(`${info.url}?token=${info.token}`);
      const queue: string[] = [];
      const waiters: Array<(v: string) => void> = [];
      socket.on("message", (data) => {
        const raw = data.toString();
        const w = waiters.shift();
        if (w) w(raw);
        else queue.push(raw);
      });
      await new Promise<void>((resolve, reject) => {
        socket.once("open", () => resolve());
        socket.once("error", reject);
      });
      const next = async (): Promise<string> => {
        const b = queue.shift();
        if (b !== undefined) return b;
        return new Promise<string>((resolve) => waiters.push(resolve));
      };
      await next();
      socket.send(
        JSON.stringify({
          version: BACKEND_RENDERER_STREAM_VERSION,
          type: "interests",
          terminalThreadIds: [],
          runtimeThreadIds: [],
          lastSeq: 0,
        }),
      );
      await next();
      socket.send(
        JSON.stringify({
          version: BACKEND_RENDERER_STREAM_VERSION,
          type: "request",
          id: "big-1",
          operation: "database",
          name: "dbGetThreadRuntimeItems",
          payload: {},
        }),
      );
      let chunks = 0;
      const parts: string[] = [];
      const deadline = Date.now() + 20_000;
      while (true) {
        if (Date.now() > deadline) throw new Error(`stuck at ${chunks}`);
        const raw = await next();
        const frame = JSON.parse(raw) as Record<string, unknown>;
        if (frame.type === "reply-chunk" && frame.id === "big-1") {
          chunks += 1;
          parts.push(frame.data as string);
          socket.send(
            JSON.stringify({
              version: BACKEND_RENDERER_STREAM_VERSION,
              type: "reply-ack",
              id: "big-1",
              seq: frame.seq,
            }),
          );
        } else if (frame.type === "reply-end") {
          break;
        } else if (
          frame.type === "reply-abort" ||
          (frame.type === "reply" && frame.id === "big-1")
        ) {
          throw new Error(`unexpected terminal frame: ${raw.slice(0, 160)}`);
        }
      }
      expect(chunks).toBeGreaterThan(1);
      expect(createHash("sha256").update(parts.join(""), "utf8").digest("hex")).toBe(expected);
      expect(socket.readyState).toBe(WebSocket.OPEN);
      socket.close();
    } finally {
      await stream.dispose();
    }
  }, 25_000);
});
