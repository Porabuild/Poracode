import { describe, expect, it } from "vitest";
import { isLocalhostOrigin, readBoundedNodeRequestBody, readBoundedResponseBody } from "./http";

describe("readBoundedResponseBody", () => {
  it("reads streamed response chunks", async () => {
    const encoder = new TextEncoder();
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode("ab"));
          controller.enqueue(encoder.encode("cd"));
          controller.close();
        },
      }),
    );

    const body = await readBoundedResponseBody(response, 4);

    expect(new TextDecoder().decode(body)).toBe("abcd");
  });

  it("rejects declared response bodies above the limit", async () => {
    const response = new Response("small", {
      headers: { "content-length": "5" },
    });

    await expect(readBoundedResponseBody(response, 4)).rejects.toThrow("response body too large");
  });

  it("cancels streamed response bodies once the limit is exceeded", async () => {
    let canceled = false;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2]));
          controller.enqueue(new Uint8Array([3, 4]));
        },
        cancel() {
          canceled = true;
        },
      }),
    );

    await expect(readBoundedResponseBody(response, 3)).rejects.toThrow("response body too large");
    expect(canceled).toBe(true);
  });
});

describe("readBoundedNodeRequestBody", () => {
  async function* streamOf(...chunks: string[]): AsyncIterable<Buffer> {
    for (const chunk of chunks) {
      yield Buffer.from(chunk, "utf8");
    }
  }

  it("concatenates chunks at or below the limit", async () => {
    const body = await readBoundedNodeRequestBody(
      streamOf("1234", "5678"),
      8,
      () => new Error("too large"),
    );
    expect(body.toString("utf8")).toBe("12345678");
  });

  it("throws the caller's overflow error once the limit is crossed", async () => {
    await expect(
      readBoundedNodeRequestBody(streamOf("12345678", "9"), 8, () => new Error("too large")),
    ).rejects.toThrow("too large");
  });

  it("drains the request after an overflow so the caller's 413 can be delivered", async () => {
    // A server that stops reading mid-upload and closes leaves unread bytes
    // in the socket; the close then RSTs and the client sees ECONNRESET
    // instead of the response. The remaining chunks must therefore still be
    // consumed (dropped, not retained) before the overflow error is thrown.
    let postOverflowChunks = 0;
    async function* overflowingStream(): AsyncIterable<Buffer> {
      yield Buffer.from("12345678", "utf8");
      yield Buffer.from("9", "utf8");
      postOverflowChunks += 1;
      yield Buffer.from("abcdef", "utf8");
      postOverflowChunks += 1;
    }

    const bodyPromise = readBoundedNodeRequestBody(
      overflowingStream(),
      8,
      () => new Error("too large"),
    );
    await expect(bodyPromise).rejects.toThrow("too large");
    expect(postOverflowChunks).toBe(2);
  });
});

describe("isLocalhostOrigin", () => {
  it("accepts loopback origins", () => {
    expect(isLocalhostOrigin("http://localhost:3000")).toBe(true);
    expect(isLocalhostOrigin("http://127.0.0.1:3000")).toBe(true);
    expect(isLocalhostOrigin("http://[::1]:3000")).toBe(true);
  });

  it("rejects non-loopback and invalid origins", () => {
    expect(isLocalhostOrigin("https://example.com")).toBe(false);
    expect(isLocalhostOrigin("not a url")).toBe(false);
  });
});
