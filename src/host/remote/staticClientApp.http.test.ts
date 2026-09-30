import { once } from "node:events";
import type { ReadStream } from "node:fs";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { tryServeBuiltClientApp } from "./staticClientApp";

/**
 * Real-HTTP coverage for the bundled web-client file server (plan D2): MIME,
 * cache and version handling, HEAD/Range, traversal/symlink guards, and the
 * stream lifecycle — completion, client disconnect, read error and a stalled
 * filesystem lookup that must not block the control loop.
 */

const streamLog = vi.hoisted(() => ({
  created: [] as ReadStream[],
  nextFactory: null as null | (() => ReadStream),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    createReadStream: ((...args: Parameters<typeof actual.createReadStream>) => {
      const override = streamLog.nextFactory;
      if (override) {
        streamLog.nextFactory = null;
        const stream = override();
        streamLog.created.push(stream);
        return stream;
      }
      const stream = actual.createReadStream(...args);
      streamLog.created.push(stream);
      return stream;
    }) as typeof actual.createReadStream,
  };
});

/**
 * One-shot gate on the first `realpath` of a request: while it is parked the
 * lookup is genuinely in flight, so a timer that fires before release proves
 * the request is not monopolizing the event loop.
 */
const lookupGate = vi.hoisted(() => {
  const gate = {
    armed: false,
    parked: 0,
    waiters: new Set<() => void>(),
    stallNext() {
      gate.armed = true;
      gate.parked = 0;
    },
    release() {
      gate.armed = false;
      for (const resolve of gate.waiters) resolve();
      gate.waiters.clear();
    },
    async wait() {
      if (!gate.armed) return;
      gate.armed = false;
      gate.parked += 1;
      await new Promise<void>((resolve) => gate.waiters.add(resolve));
      gate.parked -= 1;
    },
  };
  return gate;
});

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    realpath: (async (...args: Parameters<typeof actual.realpath>) => {
      await lookupGate.wait();
      return actual.realpath(...args);
    }) as typeof actual.realpath,
  };
});

const INDEX_HTML = "<!doctype html><title>Bundled client</title>";
const MANIFEST = '{"name":"Bundled client","start_url":"/"}';
const RUNTIME_BIN = Buffer.from(Array.from({ length: 64 }, (_, index) => index));
const LIFETIME_BIN_BYTES = 1024 * 1024;

/**
 * A controlled `ServerResponse` stand-in: a real `Writable` whose final
 * `_write` callback can be held to model a congested socket that has not yet
 * flushed its last chunk. It lets a test pin the serve promise's settlement
 * against both lifetimes without depending on kernel socket buffer sizes.
 */
class ControlledResponse extends Writable {
  statusCode = 0;
  headersSent = false;
  receivedBytes = 0;
  holdFinalWrite = false;
  private heldWriteCallback: ((error?: Error | null) => void) | null = null;

  constructor() {
    super({ highWaterMark: 2 * LIFETIME_BIN_BYTES });
  }

  writeHead(statusCode: number, _headers?: Record<string, string>): this {
    this.statusCode = statusCode;
    this.headersSent = true;
    return this;
  }

  override _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.receivedBytes += chunk.length;
    if (this.holdFinalWrite && this.receivedBytes >= LIFETIME_BIN_BYTES) {
      this.heldWriteCallback = callback;
      return;
    }
    callback();
  }

  releaseHeldWrite(): void {
    const callback = this.heldWriteCallback;
    this.heldWriteCallback = null;
    callback?.();
  }
}

/**
 * A readable whose `close` (and therefore its resource release) can be held
 * after it has been destroyed, so a test can assert the serve promise does not
 * settle while the owned reader is still open.
 */
class HeldCloseReadable extends Readable {
  private heldDestroyCallback: ((error?: Error | null) => void) | null = null;

  constructor() {
    super({ autoDestroy: false, emitClose: true });
  }

  override _read(): void {}

  override _destroy(_error: Error | null, callback: (error?: Error | null) => void): void {
    this.heldDestroyCallback = callback;
  }

  releaseClose(): void {
    const callback = this.heldDestroyCallback;
    this.heldDestroyCallback = null;
    callback?.();
  }
}

let root: string;
let outside: string;
let server: Server;
let baseUrl: string;
let serverPort: number;
const responses: ServerResponse[] = [];
const serveResults: { readonly res: ServerResponse; readonly served: boolean }[] = [];

/** The single settlement recorded for one response, once it has happened. */
async function servedOnceFor(res: ServerResponse): Promise<boolean> {
  await vi.waitFor(() =>
    expect(serveResults.filter((result) => result.res === res)).toHaveLength(1),
  );
  return serveResults.find((result) => result.res === res)!.served;
}

/** Waits for the server handler to receive the request after `index`. */
async function waitForResponse(index: number): Promise<ServerResponse> {
  await vi.waitFor(() => expect(responses.length).toBeGreaterThan(index));
  return responses[index]!;
}

/** Drains the serve promise's async chain before a settlement assertion. */
function drainMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "poracode-web-client-"));
  outside = mkdtempSync(join(tmpdir(), "poracode-web-outside-"));
  writeFileSync(join(outside, "secret.js"), "outside-secret");
  mkdirSync(join(root, "assets"));
  mkdirSync(join(root, "icons"));
  mkdirSync(join(root, "poracode-ssh-runtime"));
  writeFileSync(join(root, "index.html"), INDEX_HTML);
  writeFileSync(join(root, "manifest.webmanifest"), MANIFEST);
  writeFileSync(join(root, "service-worker.js"), 'const BUILD_VERSION = "v1";');
  writeFileSync(join(root, "app-icon.svg"), "<svg></svg>");
  writeFileSync(join(root, "notification.mp3"), RUNTIME_BIN);
  writeFileSync(join(root, "robots.txt"), "User-agent: *\n");
  writeFileSync(join(root, "assets/index-abc123.js"), 'console.log("bundled");');
  writeFileSync(join(root, "icons/icon-192.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(join(root, "poracode-ssh-runtime/manifest.json"), '{"archive":"runtime.bin"}');
  writeFileSync(join(root, "poracode-ssh-runtime/runtime.bin"), RUNTIME_BIN);
  symlinkSync(join(outside, "secret.js"), join(root, "assets/escape.js"));
  symlinkSync(outside, join(root, "icons/linked"));

  server = createServer((req, res) => {
    responses.push(res);
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    void tryServeBuiltClientApp(pathname, req, res, root).then(
      (served) => {
        serveResults.push({ res, served });
        if (served) return;
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("not found");
      },
      () => {
        serveResults.push({ res, served: false });
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
          res.end("serve failure");
        } else {
          res.destroy();
        }
      },
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  serverPort = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${serverPort}`;
});

afterAll(async () => {
  lookupGate.release();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

function get(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${path}`, init);
}

describe("bundled web client real HTTP serving", () => {
  it("serves the app document and the PWA root files with their real bytes", async () => {
    const document = await get("/");
    expect(document.status).toBe(200);
    expect(document.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(document.headers.get("cache-control")).toBe("no-cache");
    expect(document.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await document.text()).toBe(INDEX_HTML);

    const manifest = await get("/manifest.webmanifest");
    expect(manifest.status).toBe(200);
    expect(manifest.headers.get("content-type")).toBe("application/manifest+json; charset=utf-8");
    expect(await manifest.text()).toBe(MANIFEST);

    const icon = await get("/app-icon.svg");
    expect(icon.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(await icon.text()).toBe("<svg></svg>");

    const robots = await get("/robots.txt");
    expect(robots.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await robots.text()).toBe("User-agent: *\n");

    const runtime = await get("/poracode-ssh-runtime/manifest.json");
    expect(runtime.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(await runtime.json()).toEqual({ archive: "runtime.bin" });
  });

  it("mirrors the hosted PWA cache policy per path class", async () => {
    const asset = await get("/assets/index-abc123.js");
    expect(asset.status).toBe(200);
    expect(asset.headers.get("content-type")).toBe("application/javascript; charset=utf-8");
    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");

    const icon = await get("/icons/icon-192.png");
    expect(icon.status).toBe(200);
    expect(icon.headers.get("content-type")).toBe("image/png");
    expect(icon.headers.get("cache-control")).toBe("public, max-age=604800");

    const worker = await get("/service-worker.js");
    expect(worker.status).toBe(200);
    expect(worker.headers.get("cache-control")).toBe("no-cache, no-store, must-revalidate");
    expect(await worker.text()).toContain('BUILD_VERSION = "v1"');

    const audio = await get("/notification.mp3");
    expect(audio.headers.get("content-type")).toBe("audio/mpeg");
    expect(audio.headers.get("cache-control")).toBe("no-cache");
  });

  it("answers HEAD with the GET headers and no body", async () => {
    const response = await get("/manifest.webmanifest", { method: "HEAD" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/manifest+json; charset=utf-8");
    expect(response.headers.get("content-length")).toBe(String(Buffer.byteLength(MANIFEST)));
    expect(await response.text()).toBe("");
  });

  it("serves single byte ranges and rejects unsatisfiable ones", async () => {
    const partial = await get("/notification.mp3", { headers: { range: "bytes=0-9" } });
    expect(partial.status).toBe(206);
    expect(partial.headers.get("content-range")).toBe(`bytes 0-9/${RUNTIME_BIN.length}`);
    expect(partial.headers.get("content-length")).toBe("10");
    expect(partial.headers.get("accept-ranges")).toBe("bytes");
    expect(Buffer.from(await partial.arrayBuffer())).toEqual(RUNTIME_BIN.subarray(0, 10));

    const suffix = await get("/notification.mp3", { headers: { range: "bytes=-4" } });
    expect(suffix.status).toBe(206);
    expect(suffix.headers.get("content-range")).toBe(
      `bytes ${RUNTIME_BIN.length - 4}-${RUNTIME_BIN.length - 1}/${RUNTIME_BIN.length}`,
    );
    expect(Buffer.from(await suffix.arrayBuffer())).toEqual(
      RUNTIME_BIN.subarray(RUNTIME_BIN.length - 4),
    );

    const openEnded = await get("/notification.mp3", { headers: { range: "bytes=60-" } });
    expect(openEnded.status).toBe(206);
    expect(Buffer.from(await openEnded.arrayBuffer())).toEqual(RUNTIME_BIN.subarray(60));

    const unsatisfiable = await get("/notification.mp3", { headers: { range: "bytes=9999-" } });
    expect(unsatisfiable.status).toBe(416);
    expect(unsatisfiable.headers.get("content-range")).toBe(`bytes */${RUNTIME_BIN.length}`);

    const multiRange = await get("/notification.mp3", { headers: { range: "bytes=0-1,3-4" } });
    expect(multiRange.status).toBe(200);
    expect(Buffer.from(await multiRange.arrayBuffer())).toEqual(RUNTIME_BIN);
  });

  it("answers 416 for any byte range on an empty representation", async () => {
    writeFileSync(join(root, "assets/empty.bin"), "");
    const suffix = await get("/assets/empty.bin", { headers: { range: "bytes=-4" } });
    expect(suffix.status).toBe(416);
    expect(suffix.headers.get("content-range")).toBe("bytes */0");
    expect(suffix.headers.get("content-length")).toBe("0");
    expect(await suffix.text()).toBe("");

    const openEnded = await get("/assets/empty.bin", { headers: { range: "bytes=0-" } });
    expect(openEnded.status).toBe(416);
    expect(openEnded.headers.get("content-range")).toBe("bytes */0");

    const whole = await get("/assets/empty.bin");
    expect(whole.status).toBe(200);
    expect(whole.headers.get("content-length")).toBe("0");
    expect(await whole.text()).toBe("");
  });

  it("picks up a rebuilt client without an in-process cache", async () => {
    writeFileSync(join(root, "service-worker.js"), 'const BUILD_VERSION = "v2";');
    writeFileSync(join(root, "index.html"), "<!doctype html><title>Rebuilt</title>");
    const worker = await get("/service-worker.js");
    expect(await worker.text()).toContain('BUILD_VERSION = "v2"');
    const document = await get("/");
    expect(await document.text()).toContain("Rebuilt");
  });

  it("refuses to serve an unfinalized service-worker template", async () => {
    const templateRoot = mkdtempSync(join(tmpdir(), "poracode-web-template-"));
    writeFileSync(join(templateRoot, "index.html"), INDEX_HTML);
    writeFileSync(
      join(templateRoot, "service-worker.js"),
      'const BUILD_VERSION = "__PORACODE_BUILD_VERSION__";',
    );
    const templateServer = createServer((req, res) => {
      const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
      void tryServeBuiltClientApp(pathname, req, res, templateRoot).then((served) => {
        if (served) return;
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("not found");
      });
    });
    await new Promise<void>((resolve) => templateServer.listen(0, "127.0.0.1", resolve));
    const address = templateServer.address();
    try {
      const response = await fetch(
        `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/service-worker.js`,
      );
      expect(response.status).toBe(404);
    } finally {
      templateServer.close();
      rmSync(templateRoot, { recursive: true, force: true });
    }
  });

  it("refuses missing files, traversal and symlink escapes", async () => {
    expect((await get("/assets/missing.js")).status).toBe(404);
    expect((await get("/notification.mp3/../secrets.json")).status).toBe(404);
    expect((await get("/%2e%2e/secrets.json")).status).toBe(404);
    expect((await get("/assets/%2e%2e/%2e%2e/secrets.js")).status).toBe(404);
    expect((await get("/assets/escape.js")).status).toBe(404);
    expect((await get("/icons/linked/secret.js")).status).toBe(404);
    expect((await get("/secrets.json")).status).toBe(404);
    expect((await get("/poracode-ssh-runtime/other.bin")).status).toBe(404);
  });

  it("keeps the control loop free while a static lookup is stalled", async () => {
    lookupGate.stallNext();
    let timerFiredDuringLookup = false;
    const timer = setTimeout(() => {
      timerFiredDuringLookup = true;
    }, 0);
    try {
      const request = get("/assets/index-abc123.js");
      await vi.waitFor(() => expect(lookupGate.parked).toBeGreaterThan(0));
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(timerFiredDuringLookup).toBe(true);
      lookupGate.release();
      const response = await request;
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("bundled");
    } finally {
      lookupGate.release();
      clearTimeout(timer);
    }
  });

  it("closes the owned stream once and settles once when the client disconnects midstream", async () => {
    writeFileSync(join(root, "assets/large.bin"), Buffer.alloc(8 * 1024 * 1024, 7));
    const createdBefore = streamLog.created.length;
    const responsesBefore = responses.length;
    const socket = connect(serverPort, "127.0.0.1");
    socket.on("error", () => {});
    try {
      await once(socket, "connect");
      socket.write("GET /assets/large.bin HTTP/1.1\r\nHost: localhost\r\n\r\n");
      const [head] = (await once(socket, "data")) as [Buffer];
      expect(head.length).toBeGreaterThan(0);
      socket.pause();
      await vi.waitFor(() => expect(streamLog.created.length).toBeGreaterThan(createdBefore));
      const stream = streamLog.created.at(-1)!;
      const response = await waitForResponse(responsesBefore);
      socket.destroy();
      await vi.waitFor(() => expect(stream.destroyed).toBe(true));
      // The destroyed stream has released its descriptor (autoClose).
      await vi.waitFor(() => expect((stream as unknown as { fd: number | null }).fd).toBeNull());
      expect(await servedOnceFor(response)).toBe(true);
      // The settlement path detaches every listener it attached.
      await vi.waitFor(() => expect(stream.listenerCount("close")).toBe(0));
      expect(stream.listenerCount("error")).toBe(0);
      expect(response.listenerCount("close")).toBe(0);
    } finally {
      socket.destroy();
    }
  });

  it("tears the response down exactly once when the owned read fails midstream", async () => {
    streamLog.nextFactory = () => {
      const failing = new Readable({
        read() {
          this.destroy(new Error("synthetic read failure"));
        },
      });
      return failing as unknown as ReadStream;
    };
    const socket = connect(serverPort, "127.0.0.1");
    socket.on("error", () => {});
    const responsesBefore = responses.length;
    try {
      await once(socket, "connect");
      socket.write("GET /assets/index-abc123.js HTTP/1.1\r\nHost: localhost\r\n\r\n");
      socket.resume();
      const response = await waitForResponse(responsesBefore);
      expect(await servedOnceFor(response)).toBe(true);
      const stream = streamLog.created.at(-1)!;
      expect(stream.destroyed).toBe(true);
      expect(stream.listenerCount("close")).toBe(0);
      expect(stream.listenerCount("error")).toBe(0);
      await vi.waitFor(() => expect(response.destroyed).toBe(true));
      expect(response.listenerCount("close")).toBe(0);
    } finally {
      socket.destroy();
      streamLog.nextFactory = null;
    }
  });

  it("removes its listeners after a completed transfer", async () => {
    const responsesBefore = responses.length;
    const createdBefore = streamLog.created.length;
    const response = await get("/notification.mp3");
    expect(response.status).toBe(200);
    await response.arrayBuffer();
    const res = responses[responsesBefore]!;
    await vi.waitFor(() => expect(res.listenerCount("close")).toBe(0));
    const stream = streamLog.created[createdBefore]!;
    await vi.waitFor(() => expect(stream.listenerCount("close")).toBe(0));
    expect(stream.listenerCount("error")).toBe(0);
  });

  it("keeps the serve lifetime open until the response flushes, not only until the reader closes", async () => {
    writeFileSync(join(root, "assets/lifetime.bin"), Buffer.alloc(LIFETIME_BIN_BYTES, 9));
    const createdBefore = streamLog.created.length;
    const response = new ControlledResponse();
    response.holdFinalWrite = true;
    let settlement: boolean | null = null;
    const serve = tryServeBuiltClientApp(
      "/assets/lifetime.bin",
      { method: "GET", headers: {} } as IncomingMessage,
      response as unknown as ServerResponse,
      root,
    ).then((served) => {
      settlement = served;
      return served;
    });
    try {
      await vi.waitFor(() => expect(response.receivedBytes).toBe(LIFETIME_BIN_BYTES));
      const stream = streamLog.created[createdBefore]!;
      // The owned reader has drained the file and released its descriptor
      // while the response is still holding its final write.
      await vi.waitFor(() => expect((stream as unknown as { fd: number | null }).fd).toBeNull());
      await drainMicrotasks();
      expect(response.writableFinished).toBe(false);
      // The reader is gone, but the response has not settled: the serve
      // promise (and the ingress slot it holds) must still be open.
      expect(settlement).toBeNull();

      response.releaseHeldWrite();
      await expect(serve).resolves.toBe(true);
      expect(settlement).toBe(true);
      expect(response.statusCode).toBe(200);
      expect(response.writableFinished).toBe(true);
      expect(stream.listenerCount("close")).toBe(0);
      expect(stream.listenerCount("error")).toBe(0);
      expect(response.listenerCount("close")).toBe(0);
    } finally {
      response.releaseHeldWrite();
      response.destroy();
    }
  });

  it("does not settle a failed read before the owned reader closes", async () => {
    const failing = new HeldCloseReadable();
    streamLog.nextFactory = () => failing as unknown as ReadStream;
    const createdBefore = streamLog.created.length;
    const response = new ControlledResponse();
    let settlement: boolean | null = null;
    const serve = tryServeBuiltClientApp(
      "/assets/index-abc123.js",
      { method: "GET", headers: {} } as IncomingMessage,
      response as unknown as ServerResponse,
      root,
    ).then((served) => {
      settlement = served;
      return served;
    });
    try {
      await vi.waitFor(() => expect(streamLog.created.length).toBeGreaterThan(createdBefore));
      expect(streamLog.created[createdBefore]).toBe(failing);
      failing.emit("error", new Error("synthetic read failure"));
      await vi.waitFor(() => expect(response.destroyed).toBe(true));
      await drainMicrotasks();
      // The response is already being torn down, but the owned reader has not
      // released its resources yet: the serve promise must not claim cleanup
      // before the close it is supposed to join.
      expect(settlement).toBeNull();

      // The response teardown cancels the reader; its close stays held.
      await vi.waitFor(() => expect(failing.destroyed).toBe(true));
      await drainMicrotasks();
      expect(settlement).toBeNull();

      failing.releaseClose();
      await expect(serve).resolves.toBe(true);
      expect(settlement).toBe(true);
      expect(failing.listenerCount("close")).toBe(0);
      expect(failing.listenerCount("error")).toBe(0);
      expect(response.listenerCount("close")).toBe(0);
    } finally {
      streamLog.nextFactory = null;
      failing.destroy();
      failing.releaseClose();
      response.destroy();
    }
  });
});
