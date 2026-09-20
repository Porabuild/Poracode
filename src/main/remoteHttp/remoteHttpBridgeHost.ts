import {
  REMOTE_HTTP_BRIDGE_VERSION,
  isRemoteHttpBridgeParentMessage,
} from "@/shared/remote/httpBridgeProtocol";
import {
  RemoteHttpBridgeService,
  type RemoteHttpBridgeLogEvent,
  type RemoteHttpBridgeWorkerPort,
} from "./remoteHttpBridgeService";

/**
 * Utility-process entry for the off-main remote HTTP bridge (V4 F8). Wires the
 * Electron `process.parentPort` control channel and per-request `MessagePortMain`
 * channels into `RemoteHttpBridgeService`, and forwards settle notifications
 * and stats replies back to main. This file is the only Electron-aware half of
 * the bridge engine.
 */

const parentPort = process.parentPort;
const debugLogging = process.env.PORACODE_REMOTE_HTTP_BRIDGE_DEBUG === "1";

const service = new RemoteHttpBridgeService({
  onSettled: (message) => {
    parentPort.postMessage(message);
  },
  ...(debugLogging
    ? {
        log: (event: RemoteHttpBridgeLogEvent) => {
          console.log(`[poracode] remote-http-bridge ${JSON.stringify(event)}`);
        },
      }
    : {}),
});

function adaptPort(port: Electron.MessagePortMain): RemoteHttpBridgeWorkerPort {
  return {
    postMessage: (message) => port.postMessage(message),
    start: () => port.start(),
    close: () => port.close(),
    onMessage: (listener) => {
      port.on("message", (event) => listener(event.data));
    },
    onClose: (listener) => {
      port.on("close", listener);
    },
  };
}

parentPort.on("message", (event) => {
  const message: unknown = event.data;
  if (!isRemoteHttpBridgeParentMessage(message)) return;
  switch (message.kind) {
    case "open": {
      const port = event.ports[0];
      if (!port) return;
      service.open(message, adaptPort(port));
      return;
    }
    case "abort-window":
      service.abortWindow(message.senderId);
      return;
    case "abort-all":
      service.abortAll();
      return;
    case "cancel":
      service.cancel(message.requestId, message.generation);
      return;
    case "stats-query":
      parentPort.postMessage({
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "stats-reply",
        generation: message.generation,
        queryId: message.queryId,
        stats: service.stats(),
      });
      return;
  }
});

// No global `unhandledRejection` suppression: the service settles every
// request through its own catch paths, so a rejection that escapes is an
// engine bug. Node's default behavior terminates this utility, main observes
// the exit and fences the generation, and every renderer port closes so the
// active requests fail loudly instead of hanging without diagnostics.
