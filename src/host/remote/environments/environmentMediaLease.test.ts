import { Agent, createServer, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { readChildMediaLease } from "./environmentMediaLease";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const clean of cleanups.splice(0).reverse()) await clean();
});
async function child(handler: (res: ServerResponse) => void) {
  const server = createServer((_req, res) => handler(res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const agent = new Agent({ keepAlive: true, maxSockets: 1 });
  cleanups.push(async () => {
    agent.destroy();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return {
    port: (server.address() as import("node:net").AddressInfo).port,
    agent,
    ticket: `pc_media_${"x".repeat(43)}`,
    signal: new AbortController().signal,
  };
}

describe("bounded child media lease verification", () => {
  it("refuses redirects, stale/missing expiry and oversized/short/disconnected responses without following another URL", async () => {
    for (const variant of [
      "redirect",
      "missing",
      "stale",
      "oversized",
      "short",
      "disconnect",
    ] as const) {
      const input = await child((res) => {
        res.writeHead(variant === "redirect" ? 302 : 206, {
          location: "http://untrusted.invalid/secret",
          ...(variant === "missing"
            ? {}
            : {
                "x-poracode-media-expires-at": new Date(
                  Date.now() + (variant === "stale" ? -1 : 120_000),
                ).toISOString(),
              }),
          ...(variant === "disconnect" ? { "content-length": "1" } : {}),
        });
        if (variant === "disconnect") {
          res.flushHeaders();
          res.destroy();
        } else res.end(variant === "oversized" ? "too large" : variant === "short" ? "" : "x");
      });
      await expect(readChildMediaLease(input)).rejects.toMatchObject({
        code: "invalid_media_ticket",
      });
    }
  });
  it("deadlines a stalled child socket and responds to owned abort without retaining the agent socket", async () => {
    const input = await child(() => {});
    await expect(readChildMediaLease(input)).rejects.toMatchObject({
      code: "invalid_media_ticket",
    });
    const controller = new AbortController();
    const pending = readChildMediaLease({ ...input, signal: controller.signal }).catch(
      (error: unknown) => error,
    );
    controller.abort();
    expect(await pending).toMatchObject({ code: "invalid_media_ticket" });
  });
});
