import { createServer, request as httpRequest, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { PORACODE_RELAY_PROTOCOL_VERSION } from "@/shared/remote/relayProtocol";
import { RelayServer, type RelayServerInfo } from "./relayServer";
import { startRelayHost } from "./relayHost";

/**
 * Relay HTTP streaming (M2-3): once the relay advertises `httpStreaming`, a
 * host sends `res-open` (headers) then bounded `res-chunk` slices then
 * `res-end`, and the relay streams them to the visitor with an idle deadline,
 * slow-consumer isolation, and cancellation. The buffered single-`res` path
 * remains the fallback for hosts/relays that never negotiated streaming.
 *
 * Each test drives real loopback sockets on all three hops (visitor ↔ relay
 * control ↔ origin) and uses origin-side gates to prove PROGRESSIVE delivery
 * (a chunk crossing the relay before the response finishes), mirroring the
 * constrained-link scenarios the acceptance requires.
 */
describe("relay HTTP streaming", () => {
  const cleanups: Array<() => void | Promise<void>> = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  async function startRelay(options: { requestTimeoutMs?: number } = {}): Promise<RelayServerInfo> {
    const relay = new RelayServer({
      host: "127.0.0.1",
      port: 0,
      ...(options.requestTimeoutMs ? { requestTimeoutMs: options.requestTimeoutMs } : {}),
    });
    const info = await relay.start();
    cleanups.push(() => relay.dispose());
    return info;
  }

  /** A loopback origin whose handler streams under the test's control. */
  function startOrigin(
    handler: (
      req: import("node:http").IncomingMessage,
      res: import("node:http").ServerResponse,
    ) => void,
  ): Promise<{ server: HttpServer; base: string; settledCloses: () => number }> {
    let settledCloses = 0;
    const server = createServer((req, res) => {
      const settle = (): void => {
        settledCloses += 1;
      };
      req.on("close", settle);
      res.on("close", settle);
      handler(req, res);
    });
    cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
    return new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const { port } = server.address() as AddressInfo;
        resolve({ server, base: `http://127.0.0.1:${port}`, settledCloses: () => settledCloses });
      });
    });
  }

  function registerHost(
    relayInfo: RelayServerInfo,
    originBase: string,
    serverId = "stream-host",
    options: { requestTimeoutMs?: number } = {},
  ): Promise<void> {
    return new Promise((resolveRegistration) => {
      const host = startRelayHost({
        relayUrl: `ws://127.0.0.1:${relayInfo.port}/host`,
        serverId,
        secret: "stream-secret",
        localHttpUrl: originBase,
        ...(options.requestTimeoutMs ? { requestTimeoutMs: options.requestTimeoutMs } : {}),
        onRegistered: () => resolveRegistration(),
      });
      cleanups.push(() => host.dispose());
    });
  }

  /** Raw visitor GET returning chunk/body events as they arrive. */
  function visitorGet(
    relayInfo: RelayServerInfo,
    path: string,
  ): Promise<{
    status: number;
    body: () => string;
    chunks: string[];
    ended: Promise<void>;
    failed: Promise<Error>;
    destroy(): void;
  }> {
    return new Promise((resolve, reject) => {
      const req = httpRequest(`${relayInfo.url}/s/stream-host${path}`, { method: "GET" }, (res) => {
        const chunks: string[] = [];
        let body = "";
        let endedResolve: () => void = () => {};
        let failedReject: (error: Error) => void = () => {};
        const ended = new Promise<void>((resolveEnded) => {
          endedResolve = resolveEnded;
        });
        const failed = new Promise<Error>((_, rejectFailed) => {
          failedReject = rejectFailed;
        });
        res.on("data", (chunk: Buffer) => {
          chunks.push(chunk.toString("utf8"));
          body += chunk.toString("utf8");
        });
        res.on("end", () => endedResolve());
        res.on("error", (error) => failedReject(error));
        req.on("error", (error) => failedReject(error));
        // Tests that never await `failed` (disconnect/isolation) still
        // reject it when the socket dies — keep it handled unconditionally.
        failed.catch(() => undefined);
        resolve({
          status: res.statusCode ?? 0,
          body: () => body,
          chunks,
          ended,
          failed,
          destroy: () => req.destroy(),
        });
      });
      req.on("error", (error) => {
        if (!req.destroyed) reject(error);
      });
      req.end();
    });
  }

  const eventually = async (
    condition: () => boolean,
    label: string,
    timeoutMs = 4_000,
  ): Promise<void> => {
    for (let waited = 0; waited < timeoutMs; waited += 20) {
      if (condition()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect.unreachable(`${label} was not satisfied within ${timeoutMs}ms`);
  };

  it("streams progressively: a chunk crosses the relay before the response finishes", async () => {
    const relayInfo = await startRelay();
    let releaseSecondChunk: () => void = () => {};
    const secondChunkGate = new Promise<void>((resolve) => {
      releaseSecondChunk = resolve;
    });
    const origin = await startOrigin((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.write("chunk-one");
      void secondChunkGate.then(() => {
        res.write("chunk-two");
        res.end();
      });
    });
    await registerHost(relayInfo, origin.base);

    const visitor = await visitorGet(relayInfo, "/stream");
    // The origin only finishes after the VISITOR observed chunk-one — the
    // relay must have delivered it before the response completed (a fully
    // buffered pipeline could never release this gate).
    await eventually(
      () => visitor.chunks.some((chunk) => chunk.includes("chunk-one")),
      "first chunk delivery",
    );
    releaseSecondChunk();
    await visitor.ended;
    expect(visitor.status).toBe(200);
    expect(visitor.body()).toBe("chunk-onechunk-two");
  });

  it("a progressing stream outlives the whole-request deadline (idle-based)", async () => {
    // The total request timeout (600ms) is SHORTER than the full transfer
    // (~1.1s): only per-chunk idle re-arms keep it alive end to end, with a
    // wide margin so CI event-loop stalls cannot flake the pin.
    const relayInfo = await startRelay({ requestTimeoutMs: 600 });
    const origin = await startOrigin(async (_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      for (let index = 0; index < 14; index += 1) {
        res.write(`slice-${index};`);
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      res.end();
    });
    await registerHost(relayInfo, origin.base, "stream-host", { requestTimeoutMs: 600 });

    const visitor = await visitorGet(relayInfo, "/slow-progress");
    await visitor.ended;
    expect(visitor.body()).toBe(
      Array.from({ length: 14 }, (_value, index) => `slice-${index};`).join(""),
    );
  });

  it("a stalled stream is retired by the idle deadline and the origin sees the abort", async () => {
    const relayInfo = await startRelay({ requestTimeoutMs: 250 });
    const origin = await startOrigin((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.write("first-slice");
      // Then stalls forever.
    });
    await registerHost(relayInfo, origin.base, "stream-host", {
      requestTimeoutMs: 10_000,
    });

    const visitor = await visitorGet(relayInfo, "/stalled");
    await eventually(
      () => visitor.chunks.some((chunk) => chunk.includes("first-slice")),
      "first slice",
    );
    expect(visitor.status).toBe(200);
    // The relay's idle deadline fires and unwinds the exchange: the visitor
    // response is destroyed (never a clean end) and the host aborts the
    // origin fetch (its socket close lands in the origin's settled count).
    await Promise.race([
      visitor.failed.then(
        () => undefined,
        () => undefined,
      ),
      visitor.ended,
    ]);
    await eventually(
      () => origin.settledCloses() > 0,
      "origin request close after relay idle retirement",
    );
  });

  it("a visitor disconnect mid-stream cancels the host's upstream work", async () => {
    const relayInfo = await startRelay();
    let sawDisconnect = false;
    const origin = await startOrigin((req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.write("disconnect-after-this");
      req.on("close", () => {
        sawDisconnect = true;
      });
      // Keeps streaming slowly; the visitor will vanish first.
      const interval = setInterval(() => res.write("."), 50);
      res.on("close", () => clearInterval(interval));
    });
    await registerHost(relayInfo, origin.base);

    const visitor = await visitorGet(relayInfo, "/disconnect");
    await eventually(
      () => visitor.chunks.some((chunk) => chunk.includes("disconnect-after-this")),
      "first slice before disconnect",
    );
    visitor.destroy();
    await eventually(() => sawDisconnect, "origin saw the canceled fetch close its socket");
    expect(sawDisconnect).toBe(true);
  });

  it("an unwinding slow-consumer response leaves the shared control link healthy", async () => {
    const relayInfo = await startRelay();
    const origin = await startOrigin((_req, res) => {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      // More than the relay's 1 MiB streaming buffer bound: a visitor that
      // vanishes mid-firehose exercises the slow-consumer unwind (close
      // watcher → destroy → req-cancel) while the origin is still sending.
      const slice = "x".repeat(64 * 1024);
      for (let index = 0; index < 160; index += 1) res.write(slice);
      res.end();
    });
    await registerHost(relayInfo, origin.base);

    const slowVisitor = await visitorGet(relayInfo, "/firehose");
    await eventually(() => slowVisitor.chunks.length > 0, "slow visitor first slice");
    slowVisitor.destroy();
    await new Promise((resolve) => setTimeout(resolve, 150));

    // The shared relay→host link stays healthy for the next visitor.
    const healthyOrigin = await startOrigin((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("healthy");
    });
    await registerHost(relayInfo, healthyOrigin.base, "stream-host-2");
    const healthy = await visitorGet2(relayInfo, "stream-host-2", "/healthy");
    expect(await healthy.ended).toBe("healthy");
  });

  it("an old host keeps the buffered single-res path", async () => {
    const relayInfo = await startRelay();
    // Raw control socket pretending to be a host that never learned the
    // streaming frames: answers `req` with one buffered `res`.
    const control = new WebSocket(`ws://127.0.0.1:${relayInfo.port}/host`);
    cleanups.push(() => control.close());
    await new Promise<void>((resolve, reject) => {
      control.once("open", resolve);
      control.once("error", reject);
    });
    control.send(
      JSON.stringify({
        t: "register",
        protocolVersion: PORACODE_RELAY_PROTOCOL_VERSION,
        serverId: "buffered-host",
        secret: "buffered-secret",
      }),
    );
    const answered = new Promise<void>((resolve) => {
      control.on("message", (raw: unknown) => {
        const frame = JSON.parse(String(raw)) as { t: string; id?: string };
        if (frame.t === "req" && frame.id) {
          control.send(
            JSON.stringify({
              t: "res",
              id: frame.id,
              status: 200,
              headers: { "content-type": "text/plain" },
              body: Buffer.from("buffered-body").toString("base64"),
            }),
          );
          resolve();
        }
      });
    });

    const visitor = await new Promise<{
      status: number;
      body: string;
      ended: Promise<string>;
    }>((resolve, reject) => {
      const req = httpRequest(
        `${relayInfo.url}/s/buffered-host/buffered`,
        { method: "GET" },
        (res) => {
          let body = "";
          const ended = new Promise<string>((resolveEnded) => {
            res.on("end", () => resolveEnded(body));
          });
          res.on("data", (chunk: Buffer) => {
            body += chunk.toString("utf8");
          });
          resolve({ status: res.statusCode ?? 0, body, ended });
        },
      );
      req.on("error", reject);
      req.end();
    });
    await answered;
    expect(await visitor.ended).toBe("buffered-body");
    expect(visitor.status).toBe(200);
  });

  it("an origin failure mid-stream resets the visitor connection (no honest status exists)", async () => {
    const relayInfo = await startRelay();
    const origin = await startOrigin((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.write("partial-");
      // Let the partial slice flush, then die mid-body: the host's upstream
      // read fails after headers went out, so the only honest report is a
      // connection reset (never a clean end, never a late status code).
      setTimeout(() => res.destroy(), 30);
    });
    await registerHost(relayInfo, origin.base);

    const visitor = await visitorGet(relayInfo, "/origin-dies");
    const outcome = await Promise.race([
      visitor.ended.then(() => "ended" as const),
      visitor.failed.then(
        () => "failed" as const,
        () => "failed" as const,
      ),
    ]);
    expect(outcome).toBe("failed");
  });

  /** visitorGet against an arbitrary server id (multi-host suites). */
  function visitorGet2(
    relayInfo: RelayServerInfo,
    serverId: string,
    path: string,
  ): Promise<{ status: number; body: string; ended: Promise<string> }> {
    return new Promise((resolve, reject) => {
      const req = httpRequest(`${relayInfo.url}/s/${serverId}${path}`, { method: "GET" }, (res) => {
        let body = "";
        const ended = new Promise<string>((resolveEnded) => {
          res.on("end", () => resolveEnded(body));
        });
        res.on("data", (chunk: Buffer) => {
          body += chunk.toString("utf8");
        });
        resolve({ status: res.statusCode ?? 0, body, ended });
      });
      req.on("error", reject);
      req.end();
    });
  }
});
