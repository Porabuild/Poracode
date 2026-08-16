import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, type WebSocketServer } from "ws";
import { sleep } from "./faultEngine.ts";
import { filterEventForItemInterests } from "./interestFilter.ts";
import { LabHttpError } from "./labAuth.ts";
import { stripBasePath } from "./httpIo.ts";
import type { LabConnection, LabRuntime } from "./labRuntime.ts";
import { BROWSER_SERVER_FIXTURES, parseClientMessage } from "./wsFixtures.ts";

export async function handleLabUpgrade(
  runtime: LabRuntime,
  wss: WebSocketServer,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): Promise<void> {
  try {
    const url = new URL(req.url ?? "/", runtime.httpBaseUrl);
    const pathname = stripBasePath(url.pathname, runtime.basePath);
    if (pathname !== runtime.manifest.wireFormat.webSocketPath) {
      socket.destroy();
      return;
    }
    const ticket = url.searchParams.get("ticket") ?? "";
    const session = runtime.auth.consumeWebSocketTicket(ticket);
    const lastSeenSeq = parseLastSeenSeq(url.searchParams);
    const initialInterests = parseThreadItemInterests(url.searchParams);
    wss.handleUpgrade(req, socket, head, (ws) => {
      runtime.observationLedger.recordOperation("ws:connect", {
        path: pathname,
        lastSeenSeq,
      });
      handleLabConnection(runtime, ws, session, lastSeenSeq, initialInterests);
    });
  } catch (error) {
    if (error instanceof LabHttpError) {
      try {
        socket.write(
          `HTTP/1.1 ${error.status} ${error.status === 401 ? "Unauthorized" : "Forbidden"}\r\nConnection: close\r\n\r\n`,
        );
      } finally {
        socket.destroy();
      }
      return;
    }
    socket.destroy();
  }
}

export function handleLabConnection(
  runtime: LabRuntime,
  ws: WebSocket,
  session: LabConnection["session"],
  lastSeenSeq: number | null,
  initialInterests: ReadonlySet<string> | null,
): void {
  const identity = runtime.allocateConnectionIdentity(session.sessionId);
  const connection: LabConnection = {
    ws,
    socketId: identity.socketId,
    sessionId: identity.sessionId,
    session,
    interests:
      initialInterests && session.scopes.includes("session:read") ? initialInterests : null,
    terminalWatches: new Set(),
    browserWatching: false,
    gitStateInterests: [],
  };
  runtime.connections.add(connection);
  ws.on("close", () => {
    runtime.connections.delete(connection);
  });
  ws.on("error", () => {
    ws.terminate();
  });
  ws.on("message", (data) => {
    handleClientMessage(runtime, connection, data.toString());
  });

  if (runtime.faults.has("socket-pre-ready-close")) {
    ws.close();
    return;
  }

  const sendReadyAndReplay = () => {
    runtime.send(ws, { type: "ready", seq: runtime.ring.seq });
    if (runtime.faults.has("malformed-envelope")) {
      ws.send("{not-json");
      runtime.ledger.observeWebSocketServer("malformed");
    }
    if (runtime.faults.has("unknown-envelope")) {
      ws.send(JSON.stringify({ type: "lab-unknown-envelope", payload: {} }));
      runtime.ledger.observeWebSocketServer("lab-unknown-envelope");
    }
    const decision = runtime.ring.decide(lastSeenSeq);
    if (decision.kind === "resync") {
      runtime.send(ws, {
        type: "resync-required",
        seq: decision.seq,
        reason: decision.reason,
      });
    } else if (decision.kind === "replay") {
      for (const entry of decision.entries) {
        const scoped = filterEventForItemInterests(entry.event, connection.interests);
        runtime.send(ws, { type: "event", seq: entry.seq, event: scoped });
      }
    }
    if (runtime.faults.has("close-1008")) {
      ws.close(1008, "Remote access session expired");
    }
  };

  if (runtime.faults.has("interest-race") && connection.interests) {
    const deferred = connection.interests;
    connection.interests = null;
    sendReadyAndReplay();
    connection.interests = deferred;
    return;
  }

  if (runtime.faults.has("reconnect-race")) {
    const delayMs = runtime.faults.get("reconnect-race")?.delayMs ?? 25;
    void sleep(delayMs).then(sendReadyAndReplay);
    return;
  }

  sendReadyAndReplay();
}

export function handleClientMessage(
  runtime: LabRuntime,
  connection: LabConnection,
  raw: string,
): void {
  let parsed;
  try {
    parsed = parseClientMessage(raw);
  } catch {
    return;
  }
  runtime.ledger.observeWebSocketClient(parsed.type, { frameType: parsed.type, source: "mock" });
  runtime.observationLedger.recordOperation(`ws-client:${parsed.type}`);
  if (parsed.type === "ping") {
    runtime.send(connection.ws, {
      type: "pong",
      ...(typeof parsed.id === "string" ? { id: parsed.id } : {}),
      ...(typeof parsed.sentAt === "number" ? { sentAt: parsed.sentAt } : {}),
      receivedAt: parsed.sentAt === undefined ? 1_786_543_200_042 : parsed.sentAt + 42,
    });
    return;
  }
  if (parsed.type === "browser-watch") {
    if (!connection.session.scopes.includes("session:read")) return;
    connection.browserWatching = true;
    for (const message of BROWSER_SERVER_FIXTURES) runtime.send(connection.ws, message);
    return;
  }
  if (parsed.type === "browser-unwatch") {
    connection.browserWatching = false;
    return;
  }
  if (parsed.type === "browser-input") return;
  if (parsed.type === "git-state-interests") {
    if (connection.session.scopes.includes("session:read")) {
      connection.gitStateInterests = parsed.interests;
      runtime.observationLedger.recordGitStateInterests(
        connection.socketId,
        connection.sessionId,
        parsed.interests,
      );
    }
    return;
  }
  if (
    parsed.type === "thread-item-interests" &&
    connection.session.scopes.includes("session:read")
  ) {
    connection.interests = new Set(parsed.threadIds);
    return;
  }
  if (parsed.type === "terminal-watch") {
    const id = parsed.id;
    if (connection.session.scopes.includes("terminal:read")) {
      connection.terminalWatches.add(id);
      const cursorSync = parsed.cursorSync;
      if (cursorSync) {
        runtime.send(connection.ws, {
          type: "terminal-watch-result",
          id,
          cursorSync: {
            version: 1,
            watchId: cursorSync.watchId,
            result: {
              status: "ready",
              generation: "instance-fixture-aaa",
              fromCursor: 0,
              toCursor: 11,
              data: "hello world",
              processState: "running",
              terminalSize: { cols: 120, rows: 30 },
            },
          },
        });
      }
    }
    return;
  }
  if (parsed.type === "terminal-unwatch") {
    connection.terminalWatches.delete(parsed.id);
  }
}

export function broadcastTerminalOutput(runtime: LabRuntime, id: string, data: string): void {
  for (const connection of runtime.connections) {
    if (!connection.terminalWatches.has(id)) continue;
    runtime.send(connection.ws, {
      type: "terminal-output",
      id,
      data,
      cursorSync: {
        version: 1,
        watchId: "watch-fixture-001",
        generation: "instance-fixture-aaa",
        fromCursor: 0,
        toCursor: data.length,
      },
    });
  }
}

export function broadcastServer(runtime: LabRuntime, message: Record<string, unknown>): void {
  for (const connection of runtime.connections) {
    runtime.send(connection.ws, message);
  }
}

export function broadcastRaw(runtime: LabRuntime, data: string): void {
  for (const connection of runtime.connections) {
    if (connection.ws.readyState === WebSocket.OPEN) connection.ws.send(data);
  }
}

export function parseLastSeenSeq(searchParams: URLSearchParams): number | null {
  const raw = searchParams.get("lastSeenSeq");
  if (raw === null) return null;
  const seq = Number(raw);
  return Number.isSafeInteger(seq) && seq >= 0 ? seq : null;
}

export function parseThreadItemInterests(
  searchParams: URLSearchParams,
): ReadonlySet<string> | null {
  const raw = searchParams.get("threadItemInterests");
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return new Set(parsed.filter((value): value is string => typeof value === "string"));
  } catch {
    return null;
  }
}
