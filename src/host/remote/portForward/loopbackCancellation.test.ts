import { getEventListeners } from "node:events";
import { createServer, type AddressInfo, type Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { connectLoopback } from "./loopback";

const servers: Server[] = [];
const controllers: AbortController[] = [];

afterEach(async () => {
  for (const controller of controllers.splice(0)) controller.abort();
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

async function freeIpv4Port(): Promise<number> {
  const reservation = createServer();
  await new Promise<void>((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const port = (reservation.address() as AddressInfo).port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  return port;
}

async function startEcho(): Promise<{ port: number; connectionCount: () => number }> {
  let connections = 0;
  const server = createServer((socket) => {
    connections += 1;
    socket.pipe(socket);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return { port: (server.address() as AddressInfo).port, connectionCount: () => connections };
}

/** An echo listener reachable only via `::1`. The IPv4 side of the port is
 * reserved while the IPv6 listener binds, so no unrelated listener can own the
 * same numeric port and make the "first family refused" premise flaky (same
 * trick as `RemotePortForwardGateway.test.ts`). */
async function startIpv6OnlyEcho(): Promise<{ port: number; connectionCount: () => number }> {
  const port = await freeIpv4Port();
  let connections = 0;
  const server = createServer((socket) => {
    connections += 1;
    socket.pipe(socket);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "::1", resolve);
  });
  servers.push(server);
  return { port, connectionCount: () => connections };
}

/** Whether this machine can bind an IPv6 loopback listener at all (some CI
 * hosts disable IPv6) — same probe as `RemotePortForwardGateway.test.ts`. */
const ipv6Supported = await new Promise<boolean>((resolve) => {
  const probe = createServer();
  probe.once("error", () => resolve(false));
  probe.listen(0, "::1", () => probe.close(() => resolve(true)));
});

describe("connectLoopback cancellation", () => {
  it("rejects without dialing when the signal is already aborted", async () => {
    const upstream = await startEcho();
    const controller = new AbortController();
    controller.abort();

    await expect(connectLoopback(upstream.port, { signal: controller.signal })).rejects.toThrow(
      /Cancelled connecting/,
    );
    // Give any illegal dial a grace tick; none may have happened.
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(upstream.connectionCount()).toBe(0);
  });

  it.skipIf(!ipv6Supported)(
    "destroys the pending attempt and suppresses the family fallback when aborted mid-dial",
    async () => {
      const upstream = await startIpv6OnlyEcho();
      const controller = new AbortController();
      controllers.push(controller);

      const pending = connectLoopback(upstream.port, { signal: controller.signal });
      // Abort synchronously, before the kernel can refuse the first attempt:
      // the pending socket must be destroyed and the `::1` fallback family
      // must never be dialed.
      controller.abort();

      // The rejection is the cancellation itself, not the first family's
      // connect error — proving cancellation won the race against fallback.
      await expect(pending).rejects.toThrow(/Cancelled connecting/);
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(upstream.connectionCount()).toBe(0);
    },
  );

  it("does not disturb a dial that already connected", async () => {
    const upstream = await startEcho();
    const controller = new AbortController();
    controllers.push(controller);
    const connection = await connectLoopback(upstream.port, { signal: controller.signal });

    // Cancellation covers the dial only: a handed-back socket stays usable.
    controller.abort();

    const echoed = await new Promise<string>((resolve, reject) => {
      connection.socket.once("data", (data) => resolve(data.toString()));
      connection.socket.once("error", reject);
      connection.socket.write("still mine");
    });
    expect(echoed).toBe("still mine");
    connection.socket.destroy();
  });

  it("removes its abort registration once the dial settles", async () => {
    const upstream = await startEcho();
    const successSignal = new AbortController();
    controllers.push(successSignal);
    const connection = await connectLoopback(upstream.port, { signal: successSignal.signal });
    expect(getEventListeners(successSignal.signal, "abort")).toHaveLength(0);
    connection.socket.destroy();

    const port = await freeIpv4Port();
    const failureSignal = new AbortController();
    controllers.push(failureSignal);
    // Exhausting every family rejects with the last attempt's connect error.
    await expect(connectLoopback(port, { signal: failureSignal.signal })).rejects.toThrow(
      /ECONNREFUSED/,
    );
    expect(getEventListeners(failureSignal.signal, "abort")).toHaveLength(0);
  });
});
