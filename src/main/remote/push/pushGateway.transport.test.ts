import { createServer, type ServerResponse } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, expect, it, vi } from "vitest";
import { createPushGateway, createWebPushPublicKeyResolver } from "./pushGateway";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
  vi.restoreAllMocks();
});

async function gateway(handle: (response: ServerResponse) => void) {
  const server = createServer((request, response) => {
    request.resume();
    handle(response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing fixture address.");
  return `http://127.0.0.1:${address.port}`;
}

it("keeps the public-key deadline active through an actual held response body", async () => {
  const received = Promise.withResolvers<ServerResponse>();
  let calls = 0;
  const gatewayUrl = await gateway((response) => {
    calls++;
    response.writeHead(200, { "content-type": "application/json" });
    if (calls > 1) {
      response.end('{"publicKey":"synthetic-retry-key"}');
      return;
    }
    response.write('{"publicKey":"');
    received.resolve(response);
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const resolveKey = createWebPushPublicKeyResolver({ gatewayUrl, timeoutMs: 100 });
  let settled = false;
  const result = resolveKey().then(
    (value) => {
      settled = true;
      return value;
    },
    (error: unknown) => {
      settled = true;
      return error;
    },
  );
  const response = await received.promise;
  await delay(200);
  const settledBeforePeerRelease = settled;
  response.end('synthetic-public-key"}');
  const outcome = await result;
  expect(settledBeforePeerRelease).toBe(true);
  expect(outcome).toBeInstanceOf(Error);
  await expect(resolveKey()).resolves.toBe("synthetic-retry-key");
  expect(calls).toBe(2);
});

it.each(["declared", "chunked"])("refuses an oversized %s public-key response", async (framing) => {
  const body = JSON.stringify({ publicKey: "synthetic-key", padding: "x".repeat(32 * 1024) });
  const gatewayUrl = await gateway((response) => {
    response.writeHead(200, {
      "content-type": "application/json",
      ...(framing === "declared" ? { "content-length": Buffer.byteLength(body) } : {}),
    });
    response.end(body);
  });
  const onError = vi.fn<(error: unknown) => void>();
  const resolveKey = createWebPushPublicKeyResolver({ gatewayUrl, onError });
  await expect(resolveKey()).rejects.toThrow("invalid-response");
  expect(onError).toHaveBeenCalledOnce();
});

it("accepts an exact-limit public-key response and shares its successful cache", async () => {
  let calls = 0;
  const gatewayUrl = await gateway((response) => {
    calls++;
    response.writeHead(200, { "content-type": "application/json" });
    response.end('{"publicKey":"synthetic-key"}'.padEnd(16 * 1024));
  });
  const resolveKey = createWebPushPublicKeyResolver({ gatewayUrl });
  await expect(Promise.all([resolveKey(), resolveKey()])).resolves.toEqual([
    "synthetic-key",
    "synthetic-key",
  ]);
  await expect(resolveKey()).resolves.toBe("synthetic-key");
  expect(calls).toBe(1);
});

it("cancels an unused delivery response body after consuming its status", async () => {
  let closed = false;
  const gatewayUrl = await gateway((response) => {
    response.on("close", () => {
      closed = true;
    });
    response.writeHead(200, { "content-type": "text/plain" });
    response.write("synthetic unused response body");
  });
  const send = createPushGateway({ gatewayUrl, timeoutMs: 100 });
  await expect(
    send({ platform: "android", token: "synthetic-token", pushType: "alert", payload: {} }),
  ).resolves.toMatchObject({ ok: true, status: 200 });
  await vi.waitFor(() => expect(closed).toBe(true), { timeout: 1000 });
});
