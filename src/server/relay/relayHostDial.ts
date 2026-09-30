import { decodeRelayBinaryFrame, encodeRelayBinaryFrame } from "@/shared/remote/relayBinaryFrame";
import { RELAY_WS_PAYLOAD_TOO_LARGE_REASON } from "@/shared/remote/relayLimits";
import {
  PORACODE_RELAY_PROTOCOL_VERSION,
  relayServerFrameSchema,
  safeJsonParse,
  type RelayWsOpenFrame,
} from "@/shared/remote/relayProtocol";
import { ForwardOriginPolicy } from "@/host/remote/portForward/forwardOrigin";
import { relayDialOriginHeaders } from "./relayDialOrigin";
import type { RelaySocket } from "./relayHost";
import {
  WEB_SOCKET_OPEN,
  forwardHeaders,
  isDroppableStreamFrame,
  toBinaryBytes,
  type RelayHostRuntime,
} from "./relayHostTypes";
import {
  abortAllPendingRequests,
  cancelPendingRequest,
  closeAllChannels,
  closeSocket,
  send,
  sendOnForced,
  sendRaw,
} from "./relayHostSend";
import { handleRelayHostRequest } from "./relayHostRequest";

function handleWsOpen(
  rt: RelayHostRuntime,
  frame: RelayWsOpenFrame,
  sourceControl: RelaySocket,
): void {
  const isEventStream = !frame.forward && frame.path.split("?")[0] === "/ws";
  // Dial the local server with the same stable per-visitor identity the
  // tunneled HTTP requests carry (cookies unchanged), so the server sees one
  // consistent client across a visitor's HTTP and WebSocket hops.
  let local: RelaySocket;
  try {
    const localHeaders = relayDialOriginHeaders("ws", frame.clientId, {
      ...(frame.cookie ? { cookie: frame.cookie } : {}),
      ...forwardHeaders(rt, frame.forward),
      ...(frame.forward ? { origin: frame.forward.origin } : {}),
    });
    local = rt.makeLocalWs(`${rt.localWsBase}${frame.path}`, localHeaders);
  } catch (error) {
    rt.options.reportError?.(error);
    if (rt.control === sourceControl) {
      sendOnForced(rt, sourceControl, {
        t: "ws-close",
        id: frame.id,
        reason: "local socket error",
      });
    }
    return;
  }
  let localOpen = local.readyState === undefined || local.readyState === WEB_SOCKET_OPEN;
  let queuedBytes = 0;
  const queuedData: Array<string | Uint8Array> = [];
  const closeRelayChannel = (reason = "local socket error"): void => {
    if (rt.wsChannels.delete(frame.id)) {
      closeSocket(local);
      if (rt.control === sourceControl) {
        sendOnForced(rt, sourceControl, { t: "ws-close", id: frame.id, reason });
      }
    }
  };
  const sendToLocal = (data: string | Uint8Array): void => {
    if (!localOpen) {
      queuedBytes += Buffer.byteLength(data);
      if (queuedBytes > rt.maxWebSocketOutboundBufferBytes) {
        closeRelayChannel();
        return;
      }
      queuedData.push(data);
      return;
    }
    if (!sendRaw(rt, local, data)) {
      closeRelayChannel();
    }
  };
  const flushQueuedData = (): void => {
    if (!rt.wsChannels.has(frame.id)) return;
    const pending = queuedData.splice(0);
    queuedBytes = 0;
    for (const data of pending) {
      if (!rt.wsChannels.has(frame.id)) return;
      sendToLocal(data);
    }
  };
  rt.wsChannels.set(frame.id, { socket: local, control: sourceControl, sendToLocal });
  local.onopen = () => {
    localOpen = true;
    flushQueuedData();
  };
  local.onmessage = (event) => {
    if (rt.control !== sourceControl) return;
    const data = event.data;
    if (typeof data === "string") {
      // Text keeps the JSON ws-data frame. The droppable-stream soft cap
      // applies only here: it inspects known textual event shapes, and a
      // binary frame is opaque application payload that must never be
      // dropped for congestion.
      if (
        isEventStream &&
        (sourceControl.bufferedAmount ?? 0) > rt.droppableStreamSoftBufferBytes &&
        isDroppableStreamFrame(data)
      ) {
        return;
      }
      // Measure the exact framed bytes before sending: JSON escaping can
      // expand a raw message past the control budget, and sendRaw treats
      // that as a control-socket failure. Oversize closes only this channel.
      const framed = JSON.stringify({ t: "ws-data", id: frame.id, data });
      if (Buffer.byteLength(framed) > rt.controlFrameLimit) {
        closeRelayChannel(RELAY_WS_PAYLOAD_TOO_LARGE_REASON);
        return;
      }
      if (!sendRaw(rt, sourceControl, framed)) {
        if (rt.wsChannels.delete(frame.id)) {
          closeSocket(local);
          sendOnForced(rt, sourceControl, {
            t: "ws-close",
            id: frame.id,
            reason: "relay link congestion",
          });
        }
      }
      return;
    }
    const bytes = toBinaryBytes(data);
    if (!bytes) return;
    // Reserve the largest supported envelope even when this channel's id is
    // shorter. Reject beyond that binary payload budget on this channel only.
    if (bytes.byteLength > rt.binaryMessageLimit) {
      closeRelayChannel(RELAY_WS_PAYLOAD_TOO_LARGE_REASON);
      return;
    }
    // The envelope re-frames this channel's id; ws-open validated it against
    // the codec's id rule (relayChannelIdSchema), so the encode cannot throw.
    if (!sendRaw(rt, sourceControl, encodeRelayBinaryFrame(frame.id, bytes))) {
      if (rt.wsChannels.delete(frame.id)) {
        closeSocket(local);
        sendOnForced(rt, sourceControl, {
          t: "ws-close",
          id: frame.id,
          reason: "relay link congestion",
        });
      }
    }
  };
  local.onclose = () => {
    if (rt.wsChannels.delete(frame.id) && rt.control === sourceControl) {
      sendOnForced(rt, sourceControl, { t: "ws-close", id: frame.id });
    }
  };
  local.onerror = () => {
    closeRelayChannel();
  };
}

/** Deliver one ws-data payload to its channel. Only the CURRENT control
 * socket may feed a channel: a replaced control's late frames (or a decoded
 * envelope from one) must be inert. Unknown ids drop. */
function routeWsData(
  rt: RelayHostRuntime,
  id: string,
  data: string | Uint8Array,
  sourceControl: RelaySocket,
): void {
  const channel = rt.wsChannels.get(id);
  if (channel && channel.control === sourceControl) {
    channel.sendToLocal(data);
  }
}

function handleFrame(rt: RelayHostRuntime, raw: unknown, sourceControl: RelaySocket): void {
  if (rt.control !== sourceControl) return;
  if (raw instanceof ArrayBuffer || ArrayBuffer.isView(raw)) {
    // Protocol 3: a binary control message is one ws-data payload framed by
    // relayBinaryFrame. Malformed or unknown-channel envelopes drop like any
    // unknown frame.
    const bytes = toBinaryBytes(raw);
    const decoded = bytes === null ? null : decodeRelayBinaryFrame(bytes);
    if (decoded) routeWsData(rt, decoded.id, decoded.data, sourceControl);
    return;
  }
  const parsed = relayServerFrameSchema.safeParse(
    typeof raw === "string" ? safeJsonParse(raw) : raw,
  );
  if (!parsed.success) return;
  const frame = parsed.data;
  switch (frame.t) {
    case "registered": {
      try {
        if (frame.serverId !== rt.options.serverId)
          throw new Error("Relay registered a different host.");
        if (
          frame.forwardOrigin &&
          (!rt.options.forwardDispatchKey || frame.forwardOrigin.ownerId !== rt.expectedOwner)
        ) {
          throw new Error("Relay forward origin ownership mismatch.");
        }
        rt.httpStreamingEnabled = frame.httpStreaming === true;
        rt.forwardOrigin = frame.forwardOrigin
          ? {
              ownerId: frame.forwardOrigin.ownerId,
              policy: new ForwardOriginPolicy(frame.forwardOrigin.baseUrl),
            }
          : undefined;
      } catch (error) {
        rt.forwardOrigin = undefined;
        closeAllChannels(rt);
        closeSocket(sourceControl);
        rt.options.onForwardOrigin?.(null);
        throw error;
      }
      rt.options.onForwardOrigin?.(
        rt.forwardOrigin
          ? { ownerId: rt.forwardOrigin.ownerId, baseUrl: rt.forwardOrigin.policy.baseUrl }
          : null,
      );
      rt.options.onRegistered?.(frame.publicUrl);
      return;
    }
    case "req":
      void handleRelayHostRequest(rt, frame, sourceControl);
      return;
    case "req-cancel":
      cancelPendingRequest(rt, frame.id);
      return;
    case "ws-open":
      handleWsOpen(rt, frame, sourceControl);
      return;
    case "ws-data": {
      routeWsData(rt, frame.id, frame.data, sourceControl);
      return;
    }
    case "ws-close": {
      const channel = rt.wsChannels.get(frame.id);
      if (channel && rt.wsChannels.delete(frame.id)) {
        closeSocket(channel.socket);
      }
      return;
    }
  }
}

function scheduleReconnect(rt: RelayHostRuntime): void {
  if (rt.disposed) return;
  if (rt.reconnectTimer) clearTimeout(rt.reconnectTimer);
  rt.reconnectTimer = setTimeout(() => {
    rt.reconnectTimer = null;
    connectRelayHost(rt);
  }, rt.reconnectMs);
  rt.reconnectMs = Math.min(rt.reconnectMs * 2, rt.maxReconnect);
}

export function connectRelayHost(rt: RelayHostRuntime): void {
  if (rt.disposed) return;
  let socket: RelaySocket;
  try {
    socket = rt.makeControl(rt.options.relayUrl);
  } catch (error) {
    rt.options.reportError?.(error);
    scheduleReconnect(rt);
    return;
  }
  rt.control = socket;
  socket.onopen = () => {
    rt.reconnectMs = rt.minReconnect;
    send(rt, {
      t: "register",
      protocolVersion: PORACODE_RELAY_PROTOCOL_VERSION,
      serverId: rt.options.serverId,
      secret: rt.options.secret,
      ...(rt.options.forwardOriginSecret && rt.options.forwardDispatchKey
        ? { originSecret: rt.options.forwardOriginSecret }
        : {}),
      ...(rt.options.label ? { label: rt.options.label } : {}),
    });
  };
  socket.onmessage = (event) => {
    try {
      handleFrame(rt, event.data, socket);
    } catch (error) {
      rt.options.reportError?.(error);
    }
  };
  socket.onerror = (error) => rt.options.reportError?.(error);
  socket.onclose = () => {
    if (rt.control !== socket) return;
    rt.control = null;
    rt.forwardOrigin = undefined;
    rt.options.onForwardOrigin?.(null);
    closeAllChannels(rt);
    abortAllPendingRequests(rt);
    scheduleReconnect(rt);
  };
}

export function disposeRelayHost(rt: RelayHostRuntime): void {
  rt.disposed = true;
  if (rt.reconnectTimer) clearTimeout(rt.reconnectTimer);
  abortAllPendingRequests(rt);
  closeAllChannels(rt);
  rt.forwardOrigin = undefined;
  rt.options.onForwardOrigin?.(null);
  try {
    rt.control?.close();
  } catch {
    // ignore
  }
  rt.control = null;
}
