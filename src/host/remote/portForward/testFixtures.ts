import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type ServerResponse,
} from "node:http";
import { createServer as createTcpServer, type AddressInfo, type Socket } from "node:net";

/** Teardown callbacks for a test's `afterEach` — fixtures register their own
 * cleanup here instead of touching any shared state, so each test file stays
 * self-contained. */
export type CleanupRegistry = Array<() => Promise<void>>;

/**
 * A loopback `http.Server` upstream that streams `label` and then holds the
 * response open, so mid-stream revocation is observable on the upstream's own
 * response object (`destroyed`) and via its request count.
 */
export async function startStreamUpstream(cleanup: CleanupRegistry, label: string) {
  let response: ServerResponse | undefined;
  let requests = 0;
  const server = createServer((_req, res) => {
    requests += 1;
    response = res;
    res.writeHead(200, { "content-type": "text/plain" });
    res.write(label);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return {
    port: (server.address() as AddressInfo).port,
    write: (value: string) => response!.write(value),
    end: () => response!.end(),
    isClosed: () => response?.destroyed === true,
    requestCount: () => requests,
  };
}

/**
 * A raw TCP upstream that answers each parsed HTTP request with `label` and
 * keeps established sockets open across responses — real keep-alive
 * semantics, and the shape of an upstream draining an old instance after its
 * listener has closed (unlike `http.Server.close()`, which drops
 * connections). Raw rather than `http.Server` so its socket set is
 * observable: keep-alive *reuse* is "many requests, one distinct socket", and
 * idle-pool destruction is that socket closing.
 */
export async function startRawUpstream(
  cleanup: CleanupRegistry,
  label: string,
  port = 0,
): Promise<{
  server: ReturnType<typeof createTcpServer>;
  port: number;
  connectionCount: () => number;
  openConnectionCount: () => number;
}> {
  const sockets = new Set<Socket>();
  let connections = 0;
  const server = createTcpServer((socket) => {
    connections += 1;
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    let pending = "";
    socket.on("data", (data) => {
      pending += data.toString();
      const end = pending.indexOf("\r\n\r\n");
      if (end < 0) return;
      pending = pending.slice(end + 4);
      socket.write(`HTTP/1.1 200 OK\r\nContent-Length: ${label.length}\r\n\r\n${label}`);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  cleanup.push(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return {
    server,
    port: (server.address() as AddressInfo).port,
    connectionCount: () => connections,
    openConnectionCount: () => sockets.size,
  };
}

export interface RawRequestInput {
  /** Loopback port the request actually dials. */
  readonly port: number;
  readonly path: string;
  /** `Host` header value — child origins don't resolve in DNS, so tests send
   * the generated authority explicitly while dialing loopback. */
  readonly authority: string;
  readonly method?: string;
  readonly headers?: Record<string, string>;
}

export interface RawResponse {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  text(): Promise<string>;
}

/** node:http request with an explicit `Host` authority (see {@link RawRequestInput}). */
export function rawRequestWithAuthority(input: RawRequestInput): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port: input.port,
        method: input.method ?? "GET",
        path: input.path,
        headers: { host: input.authority, ...input.headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            text: async () => Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

export interface RawStreamResponse {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  /** Resolves the next buffered chunk, or `undefined` once the response ends. */
  read(): Promise<Uint8Array | undefined>;
  /** Destroys the response leg (the client-disconnect side of a stream). */
  cancel(): Promise<void>;
  /** Resolves when the response leg is closed by either side. */
  readonly closed: Promise<void>;
}

/** Streaming node:http request with an explicit `Host` authority — the
 * raw-socket stand-in for `fetch`'s streaming reader, for origins that don't
 * resolve in DNS. */
export function rawStreamRequestWithAuthority(input: RawRequestInput): Promise<RawStreamResponse> {
  interface ReadRequest {
    resolve: (value: Uint8Array | undefined) => void;
    reject: (error: unknown) => void;
  }
  return new Promise((resolveOuter, rejectOuter) => {
    const queue: Uint8Array[] = [];
    const readers: ReadRequest[] = [];
    let ended = false;
    let failed = false;
    let closeResolve: (() => void) | undefined;
    const closed = new Promise<void>((resolve) => {
      closeResolve = resolve;
    });

    const settleReader = () => {
      while (readers.length > 0) {
        const next = queue.shift();
        if (next) {
          readers.shift()!.resolve(next);
          continue;
        }
        if (failed) {
          readers.shift()!.reject(new Error("stream failed"));
          continue;
        }
        if (ended) {
          readers.shift()!.resolve(undefined);
          continue;
        }
        // No data yet: leave the reader queued and wait for a future event.
        return;
      }
    };

    const req = httpRequest(
      {
        host: "127.0.0.1",
        port: input.port,
        method: input.method ?? "GET",
        path: input.path,
        headers: { host: input.authority, ...input.headers },
      },
      (res) => {
        res.on("data", (chunk: Buffer) => {
          queue.push(new Uint8Array(chunk));
          settleReader();
        });
        res.on("end", () => {
          ended = true;
          settleReader();
        });
        res.on("close", () => {
          ended = true;
          closeResolve?.();
          settleReader();
        });
        res.on("error", () => {
          failed = true;
          closeResolve?.();
          settleReader();
        });
        resolveOuter({
          status: res.statusCode ?? 0,
          headers: res.headers,
          read: () =>
            new Promise<Uint8Array | undefined>((resolve, reject) => {
              readers.push({ resolve, reject });
              settleReader();
            }),
          cancel: () =>
            new Promise<void>((resolve) => {
              res.destroy();
              resolve();
            }),
          closed,
        });
      },
    );
    req.on("error", (error) => rejectOuter(error));
    req.end();
  });
}
