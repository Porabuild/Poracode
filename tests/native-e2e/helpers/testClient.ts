import { randomBytes } from "node:crypto";
import { createConnection } from "node:net";
import { WebSocket } from "ws";
import { HARNESS_AUTHORIZATION_SCHEME } from "../harness/constants.ts";
import { startMockHarness, type StartedMockHarness } from "../harness/startMockHarness.ts";
import { pairingTokenFromUrl } from "../harness/wireLab.ts";

export function randomCapability(): string {
  return randomBytes(32).toString("base64url");
}

export async function startLab(options?: {
  readonly basePath?: string;
  readonly replayLimit?: number;
  readonly secretsDir?: string;
  readonly journalPath?: string;
  readonly port?: number;
}): Promise<StartedMockHarness & { readonly capability: string }> {
  const capability = randomCapability();
  const started = await startMockHarness({
    capability,
    lab: {
      port: options?.port ?? 0,
      ...(options?.basePath ? { basePath: options.basePath } : {}),
      ...(options?.replayLimit !== undefined ? { replayLimit: options.replayLimit } : {}),
      ...(options?.secretsDir ? { secretsDir: options.secretsDir } : {}),
      ...(options?.journalPath ? { journalPath: options.journalPath } : {}),
    },
    control: { port: 0, capability },
  });
  return Object.assign(started, { capability });
}

export async function exchangeToken(
  httpBaseUrl: string,
  credential: string,
  scopes?: readonly string[],
): Promise<{ accessToken: string; scopes: string[]; status: number; body: unknown }> {
  const response = await fetch(new URL("oauth/token", httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      ...(scopes ? { scopes } : {}),
      client: { label: "native-e2e-test", deviceType: "mobile" },
    }),
  });
  const body = await readJson(response);
  return {
    status: response.status,
    body,
    accessToken:
      typeof (body as { accessToken?: unknown }).accessToken === "string"
        ? (body as { accessToken: string }).accessToken
        : "",
    scopes: Array.isArray((body as { scopes?: unknown }).scopes)
      ? (body as { scopes: string[] }).scopes
      : [],
  };
}

export async function issueTicket(
  httpBaseUrl: string,
  accessToken: string,
): Promise<{ ticket: string; status: number; body: unknown }> {
  const response = await fetch(new URL("api/auth/websocket-ticket", httpBaseUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const body = await readJson(response);
  return {
    status: response.status,
    body,
    ticket:
      typeof (body as { ticket?: unknown }).ticket === "string"
        ? (body as { ticket: string }).ticket
        : "",
  };
}

export async function pairAndAuth(
  harness: StartedMockHarness,
  scopes?: readonly string[],
): Promise<{ credential: string; accessToken: string }> {
  const pairing = harness.lab.issuePairingUrl();
  const credential = pairingTokenFromUrl(pairing.pairingUrl);
  const token = await exchangeToken(harness.httpBaseUrl, credential, scopes);
  if (token.status !== 200) {
    throw new Error(`token exchange failed: ${JSON.stringify(token.body)}`);
  }
  return { credential, accessToken: token.accessToken };
}

export interface BufferedSocket {
  readonly ws: WebSocket;
  next(timeoutMs?: number): Promise<unknown>;
}

const bufferedSockets = new WeakMap<WebSocket, BufferedSocket>();

export function openSocket(
  wsBaseUrl: string,
  ticket: string,
  query?: { lastSeenSeq?: number; threadItemInterests?: readonly string[] },
): WebSocket {
  return openBufferedSocket(wsBaseUrl, ticket, query).ws;
}

export function openBufferedSocket(
  wsBaseUrl: string,
  ticket: string,
  query?: { lastSeenSeq?: number; threadItemInterests?: readonly string[] },
): BufferedSocket {
  const url = new URL("ws", wsBaseUrl);
  url.searchParams.set("ticket", ticket);
  if (query?.lastSeenSeq !== undefined) {
    url.searchParams.set("lastSeenSeq", String(query.lastSeenSeq));
  }
  if (query?.threadItemInterests) {
    url.searchParams.set("threadItemInterests", JSON.stringify(query.threadItemInterests));
  }
  const ws = new WebSocket(url);
  const queued: unknown[] = [];
  const waiters: Array<(value: unknown) => void> = [];
  const socket: BufferedSocket = {
    ws,
    next(timeoutMs = 3_000) {
      if (queued.length > 0) return Promise.resolve(queued.shift());
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Timed out waiting for websocket message")),
          timeoutMs,
        );
        waiters.push((value) => {
          clearTimeout(timer);
          resolve(value);
        });
      });
    },
  };
  ws.on("message", (data) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.toString()) as unknown;
    } catch {
      parsed = data.toString();
    }
    const waiter = waiters.shift();
    if (waiter) waiter(parsed);
    else queued.push(parsed);
  });
  bufferedSockets.set(ws, socket);
  return socket;
}

export function readWsMessage(ws: WebSocket, timeoutMs = 3_000): Promise<unknown> {
  const buffered = bufferedSockets.get(ws);
  if (buffered) return buffered.next(timeoutMs);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timed out waiting for websocket message")),
      timeoutMs,
    );
    const onMessage = (data: WebSocket.RawData) => {
      clearTimeout(timer);
      ws.off("message", onMessage);
      try {
        resolve(JSON.parse(data.toString()) as unknown);
      } catch {
        resolve(data.toString());
      }
    };
    ws.on("message", onMessage);
  });
}

export async function openReadySocket(
  harness: StartedMockHarness,
  accessToken: string,
  query?: { lastSeenSeq?: number; threadItemInterests?: readonly string[] },
): Promise<{ ws: WebSocket; ready: unknown; next: () => Promise<unknown> }> {
  const ticket = await issueTicket(harness.httpBaseUrl, accessToken);
  if (ticket.status !== 200) throw new Error(`ticket failed: ${JSON.stringify(ticket.body)}`);
  const socket = openBufferedSocket(harness.wsBaseUrl, ticket.ticket, query);
  await new Promise<void>((resolve, reject) => {
    socket.ws.once("open", () => resolve());
    socket.ws.once("error", reject);
  });
  const ready = await socket.next();
  return { ws: socket.ws, ready, next: () => socket.next() };
}

export async function controlRequest(
  harness: StartedMockHarness & { capability?: string },
  path: string,
  init?: {
    readonly method?: string;
    readonly headers?: Record<string, string>;
    readonly body?: string;
  },
): Promise<Response> {
  const capability = harness.capability;
  if (!capability) throw new Error("controlRequest requires a capability.");
  return fetch(new URL(path, harness.controlUrl), {
    ...(init?.method ? { method: init.method } : {}),
    ...(init?.body ? { body: init.body } : {}),
    headers: {
      authorization: `${HARNESS_AUTHORIZATION_SCHEME} ${capability}`,
      ...(init?.headers ?? {}),
    },
  });
}

export function postChunked(
  host: string,
  port: number,
  path: string,
  body: string,
): Promise<{ status: number; raw: string }> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    let raw = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      raw += chunk;
    });
    socket.on("error", reject);
    socket.on("end", () => {
      const status = Number(/^HTTP\/1\.\d\s+(\d+)/.exec(raw)?.[1] ?? 0);
      resolve({ status, raw });
    });
    socket.write(
      `POST ${path} HTTP/1.1\r\nHost: ${host}:${port}\r\nTransfer-Encoding: chunked\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n`,
    );
    const hex = body.length.toString(16);
    socket.write(`${hex}\r\n${body}\r\n0\r\n\r\n`);
  });
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}
