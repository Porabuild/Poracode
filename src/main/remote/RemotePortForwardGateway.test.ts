import { createServer as createNetServer, connect, type AddressInfo, type Server } from "node:net";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { RemoteHttpError } from "./auth";
import { RemotePortForwardGateway } from "./RemotePortForwardGateway";

const gateways: RemotePortForwardGateway[] = [];
const netServers: Server[] = [];
const httpServers: HttpServer[] = [];

function makeGateway(
  options: ConstructorParameters<typeof RemotePortForwardGateway>[0] = { bindHost: "127.0.0.1" },
): RemotePortForwardGateway {
  const gateway = new RemotePortForwardGateway(options);
  gateways.push(gateway);
  return gateway;
}

/** Whether this machine can bind an IPv6 loopback listener at all — some CI
 * hosts disable IPv6 entirely, in which case the `::1`-only tests below must
 * skip rather than fail. Checked once via a real `::1` listen attempt (there
 * is no reliable static signal for this). */
function detectIpv6LoopbackSupport(): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createNetServer();
    probe.once("error", () => resolve(false));
    probe.listen(0, "::1", () => {
      probe.close(() => resolve(true));
    });
  });
}

const ipv6Supported = await detectIpv6LoopbackSupport();

/** A plain TCP echo server (not HTTP) on an ephemeral loopback port, bound to
 * `host` (default `127.0.0.1`; pass `::1` to simulate a dev server that bound
 * IPv6-only — the defect this suite's IPv6 tests guard against). */
function startEchoServer(host = "127.0.0.1"): Promise<{ port: number; server: Server }> {
  return new Promise((resolve, reject) => {
    const server = createNetServer((socket) => socket.pipe(socket));
    server.once("error", reject);
    server.listen(0, host, () => {
      netServers.push(server);
      resolve({ port: (server.address() as AddressInfo).port, server });
    });
  });
}

/** A bare TCP listener that never responds — enough to be "detected" without
 * speaking HTTP. Swallows per-connection errors (e.g. an ECONNRESET from a
 * probe that gave up) so an unhandled 'error' can't crash the test worker, and
 * resumes each accepted socket so an unread probe request (e.g. the HTTP
 * probe's HEAD request, which this listener never answers) doesn't leave the
 * stream's readable side paused forever — without draining it, 'end'/'close'
 * never fire and `server.close()` in `afterEach` hangs waiting for it. Bound
 * to `host` (default `127.0.0.1`; pass `::1` for an IPv6-only listener). */
function startBareListener(host = "127.0.0.1"): Promise<{ port: number; server: Server }> {
  return new Promise((resolve, reject) => {
    const server = createNetServer((socket) => {
      socket.on("error", () => {});
      socket.resume();
    });
    server.once("error", reject);
    server.listen(0, host, () => {
      netServers.push(server);
      resolve({ port: (server.address() as AddressInfo).port, server });
    });
  });
}

/** Reserves the ephemeral port on IPv4 while binding the actual listener on
 * IPv6, then releases only the reservation. This prevents an unrelated IPv4
 * listener from owning the same numeric port and making the IPv6-only probe
 * test nondeterministically look like HTTP. */
async function startIpv6OnlyBareListener(): Promise<{ port: number; server: Server }> {
  const reservation = createNetServer();
  const port = await new Promise<number>((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", () => {
      resolve((reservation.address() as AddressInfo).port);
    });
  });
  try {
    const listener = await new Promise<Server>((resolve, reject) => {
      const server = createNetServer((socket) => {
        socket.on("error", () => {});
        socket.resume();
      });
      server.once("error", reject);
      server.listen(port, "::1", () => resolve(server));
    });
    netServers.push(listener);
    return { port, server: listener };
  } finally {
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
  }
}

function startHttpServer(): Promise<{ port: number; server: HttpServer }> {
  return new Promise((resolve, reject) => {
    const server = createHttpServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      httpServers.push(server);
      resolve({ port: (server.address() as AddressInfo).port, server });
    });
  });
}

async function connectAndExchange(port: number, payload: string): Promise<string> {
  const socket = connect(port, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
  const received = new Promise<string>((resolve) => {
    socket.once("data", (data) => resolve(data.toString("utf8")));
  });
  socket.write(payload);
  const result = await received;
  socket.end();
  return result;
}

afterEach(async () => {
  for (const gateway of gateways.splice(0)) {
    gateway.dispose();
  }
  await Promise.all(
    netServers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
  await Promise.all(
    httpServers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

describe("RemotePortForwardGateway.scanPorts", () => {
  it("detects a plain TCP listener as protocol unknown", async () => {
    const { port } = await startBareListener();
    const gateway = makeGateway({
      bindHost: "127.0.0.1",
      candidatePorts: [port],
      probeTimeoutMs: 100,
    });
    const detected = await gateway.scanPorts();
    expect(detected).toEqual([{ port, protocol: "unknown" }]);
  });

  it("detects an HTTP listener as protocol http", async () => {
    // Deliberately not mixing in a well-known port like 5173 here: this suite
    // must stay hermetic even when a real dev server happens to be listening
    // on one of those ports on the machine running it, and `PORT_LABELS` in
    // `portForward/portScanner.ts` isn't injectable, so there's no way to
    // exercise well-known-port labeling without a real listener on that exact
    // port. Only dynamically-allocated ports are used as candidates.
    const { port } = await startHttpServer();
    const gateway = makeGateway({
      bindHost: "127.0.0.1",
      candidatePorts: [port],
      probeTimeoutMs: 100,
    });
    const detected = await gateway.scanPorts();
    expect(detected).toEqual([{ port, protocol: "http" }]);
  });

  it("skips ports nothing is listening on and never throws", async () => {
    const gateway = makeGateway({
      bindHost: "127.0.0.1",
      candidatePorts: [59991, 59992],
      probeTimeoutMs: 80,
    });
    await expect(gateway.scanPorts()).resolves.toEqual([]);
  });

  // Reproduces the real-world defect this suite guards against: `vite --port
  // …` (and other tools that bind the bare hostname `localhost`) can end up
  // bound to `::1` only on some systems, so the scanner must probe both
  // loopback families, not just 127.0.0.1.
  it.skipIf(!ipv6Supported)("detects an IPv6-only listener as protocol unknown", async () => {
    const { port } = await startIpv6OnlyBareListener();
    const gateway = makeGateway({
      bindHost: "127.0.0.1",
      candidatePorts: [port],
      probeTimeoutMs: 100,
    });
    const detected = await gateway.scanPorts();
    expect(detected).toEqual([{ port, protocol: "unknown" }]);
  });
});

describe("RemotePortForwardGateway.startForward / stopForward", () => {
  // The upstream echo server already holds 127.0.0.1:<targetPort>, so the
  // gateway's own mirrored-port bind attempt on the same host:port collides
  // (EADDRINUSE) and it must fall back to an ephemeral listen port — this is
  // today's (pre-mirroring) behavior, preserved as a regression guard.
  it("falls back to an ephemeral listen port when the mirrored port is taken, and still pipes bytes both ways", async () => {
    const { port: targetPort } = await startEchoServer();
    const gateway = makeGateway({ bindHost: "127.0.0.1" });

    const forward = await gateway.startForward(targetPort);
    expect(forward.targetPort).toBe(targetPort);
    expect(forward.listenPort).toBeGreaterThan(0);
    expect(forward.listenPort).not.toBe(targetPort);
    expect(forward.id).toBeTruthy();

    const echoed = await connectAndExchange(forward.listenPort, "hello over the wire");
    expect(echoed).toBe("hello over the wire");

    const stopped = await gateway.stopForward(forward.id);
    expect(stopped).toBe(true);

    // The listener is gone: a new connection attempt is refused.
    await expect(
      new Promise((resolve, reject) => {
        const socket = connect(forward.listenPort, "127.0.0.1");
        socket.once("connect", () => resolve(undefined));
        socket.once("error", reject);
      }),
    ).rejects.toThrow("ECONNREFUSED");
  });

  // Same defect as the scanner test above: the outbound leg of the raw TCP
  // forward must fall back from 127.0.0.1 to ::1 when the target only bound
  // IPv6, or a Vite-style dev server is undiscoverable *and* unreachable.
  it.skipIf(!ipv6Supported)("forwards bytes both ways to an IPv6-only upstream", async () => {
    const { port: targetPort } = await startEchoServer("::1");
    const gateway = makeGateway({ bindHost: "127.0.0.1" });

    const forward = await gateway.startForward(targetPort);
    const echoed = await connectAndExchange(forward.listenPort, "hello over ipv6");
    expect(echoed).toBe("hello over ipv6");

    const stopped = await gateway.stopForward(forward.id);
    expect(stopped).toBe(true);
  });

  // Mirrors a real dev server that only bound loopback: the upstream sits on
  // `::1:<targetPort>` exclusively, so `127.0.0.1:<targetPort>` (what the
  // gateway's mirrored-port bind attempts first) is free, and the forward
  // should land on that exact port number instead of falling back.
  it.skipIf(!ipv6Supported)(
    "mirrors the target's port number when it is free on the bind host",
    async () => {
      const { port: targetPort } = await startEchoServer("::1");
      const gateway = makeGateway({ bindHost: "127.0.0.1" });

      const forward = await gateway.startForward(targetPort);
      expect(forward.listenPort).toBe(targetPort);

      const echoed = await connectAndExchange(forward.listenPort, "hello mirrored port");
      expect(echoed).toBe("hello mirrored port");

      const stopped = await gateway.stopForward(forward.id);
      expect(stopped).toBe(true);
    },
  );

  it("is idempotent per targetPort", async () => {
    const { port: targetPort } = await startEchoServer();
    const gateway = makeGateway({ bindHost: "127.0.0.1" });

    const first = await gateway.startForward(targetPort);
    const second = await gateway.startForward(targetPort);

    expect(second).toEqual(first);
    expect(gateway.listForwards()).toEqual([first]);
  });

  it("rejects an out-of-range target port", async () => {
    const gateway = makeGateway({ bindHost: "127.0.0.1" });
    await expect(gateway.startForward(0)).rejects.toThrow(RemoteHttpError);
    await expect(gateway.startForward(70000)).rejects.toThrow(RemoteHttpError);
  });

  it("rejects forwarding onto the remote-access server's own port", async () => {
    const gateway = makeGateway({ bindHost: "127.0.0.1", remoteAccessPort: 38987 });
    await expect(gateway.startForward(38987)).rejects.toMatchObject({ code: "invalid_port" });
  });

  it("caps concurrent forwards", async () => {
    const { port: targetA } = await startEchoServer();
    const { port: targetB } = await startEchoServer();
    const gateway = makeGateway({ bindHost: "127.0.0.1", maxForwards: 1 });

    await gateway.startForward(targetA);
    await expect(gateway.startForward(targetB)).rejects.toMatchObject({
      code: "forward_limit_reached",
    });
  });

  it("stopForward on an unknown id is a no-op returning false", async () => {
    const gateway = makeGateway({ bindHost: "127.0.0.1" });
    await expect(gateway.stopForward("does-not-exist")).resolves.toBe(false);
  });

  it("destroys live sockets and closes the listener on dispose", async () => {
    const { port: targetPort } = await startEchoServer();
    const gateway = makeGateway({ bindHost: "127.0.0.1" });
    const forward = await gateway.startForward(targetPort);

    const socket = connect(forward.listenPort, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", () => resolve());
      socket.once("error", reject);
    });
    const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));

    gateway.dispose();

    await closed;
    expect(gateway.listForwards()).toEqual([]);
  });

  it("rejects startForward and scanPorts once disposed", async () => {
    const { port: targetPort } = await startEchoServer();
    const gateway = makeGateway({ bindHost: "127.0.0.1" });
    gateway.dispose();

    await expect(gateway.startForward(targetPort)).rejects.toMatchObject({
      code: "gateway_disposed",
    });
    await expect(gateway.scanPorts()).rejects.toMatchObject({ code: "gateway_disposed" });
  });

  it("closes the listener when dispose() races a startForward that is mid-listen", async () => {
    const { port: targetPort } = await startEchoServer();
    const gateway = makeGateway({ bindHost: "127.0.0.1" });

    // `startForward` is not yet awaited: its `listen()` is in flight when
    // `dispose()` runs synchronously right after. The gateway must not
    // register (or leave open) a listener that nothing will ever close.
    const startPromise = gateway.startForward(targetPort);
    gateway.dispose();

    await expect(startPromise).rejects.toMatchObject({ code: "gateway_disposed" });
    expect(gateway.listForwards()).toEqual([]);
  });

  it("shares a single listener between concurrent startForward calls for the same port", async () => {
    const { port: targetPort } = await startEchoServer();
    const gateway = makeGateway({ bindHost: "127.0.0.1" });

    const [first, second] = await Promise.all([
      gateway.startForward(targetPort),
      gateway.startForward(targetPort),
    ]);

    expect(second).toEqual(first);
    expect(gateway.listForwards()).toEqual([first]);
  });

  it("counts in-flight starts toward maxForwards so concurrency can't blow the cap", async () => {
    const { port: targetA } = await startEchoServer();
    const { port: targetB } = await startEchoServer();
    const gateway = makeGateway({ bindHost: "127.0.0.1", maxForwards: 1 });

    const results = await Promise.allSettled([
      gateway.startForward(targetA),
      gateway.startForward(targetB),
    ]);

    const fulfilled = results.filter(
      (
        result,
      ): result is PromiseFulfilledResult<Awaited<ReturnType<typeof gateway.startForward>>> =>
        result.status === "fulfilled",
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject({ code: "forward_limit_reached" });
    expect(gateway.listForwards()).toHaveLength(1);
  });
});
