import { randomUUID } from "node:crypto";
import { jsonRequest } from "./qualification-http.mjs";

// Version 1 is the oldest reliable terminal-watch contract. The descriptor
// must advertise it before the qualification client opts in; old hosts keep
// the legacy watch path.
export const TERMINAL_WATCH_VERSION = 1;

export function terminalTurnInput(platform = process.platform) {
  const command = `node -e "console.log('pty-'+(128+64)+'-turn')"`;
  return `${command}${platform === "win32" ? "\r" : "\n"}`;
}

export function supportsReliableTerminalWatch(descriptor) {
  const capability = descriptor?.capabilities?.terminalCursorSync;
  if (capability === undefined) return false;
  if (
    !Array.isArray(capability?.versions) ||
    !capability.versions.includes(TERMINAL_WATCH_VERSION)
  ) {
    throw new Error("terminal cursor sync version 1 is not available");
  }
  return true;
}

function startPtyWatch({ wsUrl, shellId, reliable }) {
  const ws = new WebSocket(wsUrl);
  const watchId = randomUUID();
  let buffer = "";
  let watchReady = false;
  let settled = false;
  let terminalError;
  let waiter;
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const readyTimer = setTimeout(() => fail(new Error("timed out waiting for PTY watch")), 20_000);

  function fail(error) {
    terminalError ??= error;
    if (!settled) {
      settled = true;
      clearTimeout(readyTimer);
      rejectReady(error);
    }
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
      waiter = undefined;
    }
  }

  function markReady() {
    if (settled) return;
    watchReady = true;
    settled = true;
    clearTimeout(readyTimer);
    resolveReady();
  }

  ws.addEventListener("open", () => {
    try {
      ws.send(
        JSON.stringify({
          type: "terminal-watch",
          id: shellId,
          ...(reliable ? { cursorSync: { version: TERMINAL_WATCH_VERSION, watchId } } : {}),
        }),
      );
      if (!reliable) markReady();
    } catch {
      fail(new Error("failed to send PTY watch"));
    }
  });
  ws.addEventListener("message", (event) => {
    let frame;
    try {
      frame = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (frame?.id !== shellId) return;
    if (
      reliable &&
      frame.type === "terminal-watch-result" &&
      frame.cursorSync?.watchId === watchId
    ) {
      if (
        frame.cursorSync?.version !== TERMINAL_WATCH_VERSION ||
        frame.cursorSync?.result?.status !== "ready"
      ) {
        fail(new Error("reliable PTY watch was not accepted"));
      } else {
        markReady();
      }
      return;
    }
    if (!watchReady || frame.type !== "terminal-output" || typeof frame.data !== "string") return;
    if (reliable && frame.cursorSync?.watchId !== watchId) return;
    buffer += frame.data;
    if (waiter && buffer.includes(waiter.needle)) {
      clearTimeout(waiter.timer);
      waiter.resolve();
      waiter = undefined;
    }
  });
  ws.addEventListener("error", () => fail(new Error("PTY watch connection failed")));
  ws.addEventListener("close", () => fail(new Error("PTY watch connection closed")));

  return {
    ready,
    waitFor(needle, timeoutMs) {
      if (terminalError) return Promise.reject(terminalError);
      if (buffer.includes(needle)) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiter = undefined;
          reject(new Error(`timed out waiting for PTY echo ${needle}`));
        }, timeoutMs);
        waiter = { needle, timer, resolve, reject };
      });
    },
    close() {
      fail(new Error("PTY watch closed"));
      ws.close();
    },
  };
}

/** Send a turn only after a reliable watch has installed its event interest. */
export async function runOneThreadTurn({
  httpBase,
  token,
  protocolVersion,
  shellId,
  ticket,
  descriptor,
}) {
  const watch = startPtyWatch({
    wsUrl: `ws://127.0.0.1:${new URL(httpBase).port}/ws?ticket=${encodeURIComponent(ticket)}`,
    shellId,
    reliable: supportsReliableTerminalWatch(descriptor),
  });
  try {
    await watch.ready;
    await Promise.all([
      watch.waitFor("pty-192-turn", 20_000),
      (async () => {
        const written = await jsonRequest(
          fetch,
          `${httpBase}/api/threads/${shellId}/terminal/write`,
          {
            method: "POST",
            token,
            protocolVersion,
            body: { data: terminalTurnInput() },
          },
        );
        if (written.status !== 200) {
          throw new Error(`terminal/write ${written.status}: ${JSON.stringify(written.body)}`);
        }
      })(),
    ]);
  } finally {
    watch.close();
  }
}
