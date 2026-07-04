import { describe, expect, it } from "vitest";
import { readBoundedResponseBody } from "./http";

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
