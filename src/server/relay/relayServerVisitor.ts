import { randomUUID } from "node:crypto";
import { WebSocket, type RawData } from "ws";
import { encodeRelayBinaryFrame } from "@/shared/remote/relayBinaryFrame";
import type { RelayForwardContext } from "@/shared/remote/relayProtocol";
import {
  RELAY_MAX_CHANNELS_PER_CLIENT,
  asBytes,
  type RegisteredHost,
  type RelayServerRuntime,
} from "./relayServerTypes";
import {
  forwardChannelFrame,
  rejectOversizeVisitor,
  sendFrameForced,
  sendToHost,
  trackWebSocket,
} from "./relayServerSockets";

export function handleVisitorWs(
  rt: RelayServerRuntime,
  visitor: WebSocket,
  host: RegisteredHost,
  serverId: string,
  path: string,
  cookie: string | undefined,
  clientId: string,
  forward: RelayForwardContext | undefined,
): void {
  trackWebSocket(rt, visitor);
  // P1-8: bound concurrent channels per owner — one visitor cannot hold
  // unbounded local sockets on the host through the shared relay.
  let channelsForClient = 0;
  for (const channel of rt.visitors.values()) {
    if (channel.clientId === clientId) channelsForClient += 1;
  }
  if (channelsForClient >= RELAY_MAX_CHANNELS_PER_CLIENT) {
    visitor.close(1013, "relay admission limit");
    return;
  }
  const id = randomUUID();
  rt.visitors.set(id, { serverId, socket: visitor, clientId });
  if (
    !sendToHost(rt, host, {
      t: "ws-open",
      id,
      path,
      clientId,
      ...(forward ? { forward } : {}),
      ...(cookie ? { cookie } : {}),
    })
  ) {
    rt.visitors.delete(id);
    visitor.close(1012, "server offline");
    return;
  }
  visitor.on("message", (data: RawData, isBinary: boolean) => {
    // Text ws messages ride the JSON frame; binary ones ride the protocol-3
    // envelope so the payload reaches the host byte-identical (String(data)
    // would UTF-8-coerce invalid sequences). The channel id is this relay's
    // own randomUUID, so the envelope encode cannot throw.
    //
    // Admission is bounded by what one control frame can carry: oversize is
    // a per-channel 1009 rejection, never a send that terminates the
    // shared control connection and every other channel with it.
    if (isBinary) {
      const bytes = asBytes(data);
      if (bytes.byteLength > rt.binaryMessageLimit) {
        rejectOversizeVisitor(rt, host, id, visitor);
        return;
      }
      if (!forwardChannelFrame(rt, host, serverId, id, encodeRelayBinaryFrame(id, bytes))) {
        // The frame was refused under congestion: the channel was evicted
        // (channel-only) to protect the shared control socket, or the host
        // is gone and dropHostTraffic already cleaned every channel up.
        visitor.close(1013, "relay link congestion");
      }
      return;
    }
    // Measure the exact framed bytes the host will receive (the same
    // JSON.stringify `sendFrame` performs): JSON escaping can expand a raw
    // message past the control budget even when the raw size is legal.
    const framed = JSON.stringify({ t: "ws-data", id, data: String(data) });
    if (Buffer.byteLength(framed) > rt.controlFrameLimit) {
      rejectOversizeVisitor(rt, host, id, visitor);
      return;
    }
    if (!forwardChannelFrame(rt, host, serverId, id, framed)) {
      visitor.close(1013, "relay link congestion");
    }
  });
  visitor.on("close", () => {
    if (rt.visitors.delete(id)) sendFrameForced(rt, host, { t: "ws-close", id });
  });
  visitor.on("error", () => {
    if (rt.visitors.delete(id)) {
      sendFrameForced(rt, host, { t: "ws-close", id });
      visitor.terminate();
    }
  });
}
