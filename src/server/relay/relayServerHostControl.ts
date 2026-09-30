import { WebSocket, type RawData } from "ws";
import { decodeRelayBinaryFrame } from "@/shared/remote/relayBinaryFrame";
import { RELAY_WS_PAYLOAD_TOO_LARGE_REASON } from "@/shared/remote/relayLimits";
import { deriveForwardOwner } from "@/host/remote/portForward/forwardOrigin";
import { relayHostFrameSchema, safeJsonParse } from "@/shared/remote/relayProtocol";
import {
  DEFAULT_HOST_REGISTRATION_TIMEOUT_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_SECRET_BINDING_TTL_MS,
  RELAY_STREAM_MAX_BUFFERED_BYTES,
  asBytes,
  publicUrlFor,
  secretsMatch,
  type PendingRequest,
  type RegisteredHost,
  type RelayServerRuntime,
} from "./relayServerTypes";
import { sendFrame, sendFrameForced, sendRaw, trackWebSocket } from "./relayServerSockets";

export function handleHostControl(rt: RelayServerRuntime, control: WebSocket): void {
  trackWebSocket(rt, control);
  let serverId: string | null = null;
  const registrationTimer = setTimeout(() => {
    if (!serverId && control.readyState === WebSocket.OPEN) {
      control.close(1008, "host must register first");
    }
  }, rt.options.hostRegistrationTimeoutMs ?? DEFAULT_HOST_REGISTRATION_TIMEOUT_MS);
  registrationTimer.unref?.();
  control.on("message", (data: RawData, isBinary: boolean) => {
    // Registration belongs to this connection, not merely to the server id.
    // A replaced control's queued callbacks must not feed new visitors or
    // reclaim the host after its registration has been superseded.
    if (serverId !== null && rt.hosts.get(serverId)?.control !== control) return;
    if (isBinary) {
      // Protocol 3: a binary control message carries one ws-data payload for
      // a visitor channel, framed by relayBinaryFrame. Text ws-data keeps
      // its JSON frame below; an undecodable envelope drops like any unknown
      // frame. Before registration the socket is closed exactly like one
      // that sent any other non-register frame first.
      if (!serverId) {
        clearTimeout(registrationTimer);
        control.close(1008, "host must register first");
        return;
      }
      const decoded = decodeRelayBinaryFrame(asBytes(data));
      if (!decoded) return;

      const visitor = rt.visitors.get(decoded.id);
      if (visitor && visitor.serverId === serverId && !sendRaw(rt, visitor.socket, decoded.data)) {
        // P1-6: the visitor socket is gone mid-forward — tell the host so
        // its channel entry and local socket do not leak as zombies.
        rt.visitors.delete(decoded.id);
        const registeredHost = rt.hosts.get(serverId);
        if (registeredHost?.control === control) {
          sendFrameForced(rt, registeredHost, { t: "ws-close", id: decoded.id });
        }
      }
      return;
    }
    const parsed = relayHostFrameSchema.safeParse(safeJsonParse(String(data)));
    if (!parsed.success) return;
    const frame = parsed.data;
    if (frame.t === "register") {
      clearTimeout(registrationTimer);
      if (serverId && frame.serverId !== serverId) {
        control.close(1008, "host control already registered");
        return;
      }
      // Validate against the DURABLE binding — even with no live host — so an
      // attacker cannot claim an offline server's id with a different secret.
      if (!claimSecretBinding(rt, frame.serverId, frame.secret)) {
        control.close(1008, "serverId already registered");
        return;
      }
      const forwardOwnerId =
        rt.forwardPolicy && frame.originSecret
          ? deriveForwardOwner(frame.originSecret, frame.serverId)
          : undefined;
      const ownerHost = forwardOwnerId ? rt.forwardOwners.get(forwardOwnerId) : undefined;
      if (ownerHost && ownerHost !== frame.serverId) {
        control.close(1008, "forward origin already registered");
        return;
      }
      // Replace any prior live registration for this id (reconnect). The
      // durable binding above already confirmed the secret matches.
      const existing = liveHost(rt, frame.serverId);
      if (
        existing &&
        (existing.control !== control || existing.forwardOwnerId !== forwardOwnerId)
      ) {
        dropHostTraffic(rt, frame.serverId, "Host reconnected.");
        if (existing.control !== control) existing.control.close();
      }
      serverId = frame.serverId;
      removeHost(rt, frame.serverId);
      rt.hosts.set(frame.serverId, {
        control,
        channelBytes: new Map(),
        forcedControlBytes: 0,
        ...(forwardOwnerId ? { forwardOwnerId } : {}),
      });
      if (forwardOwnerId) rt.forwardOwners.set(forwardOwnerId, frame.serverId);
      const registered = sendFrame(rt, control, {
        t: "registered",
        serverId: frame.serverId,
        publicUrl: publicUrlFor(rt, frame.serverId),
        // Additive v3 capability: this relay understands the streaming
        // response frames (res-open/res-chunk/res-end). Older hosts strip
        // the field and keep the buffered `res` path.
        httpStreaming: true,
        ...(forwardOwnerId && rt.forwardPolicy
          ? {
              forwardOrigin: { baseUrl: rt.forwardPolicy.baseUrl, ownerId: forwardOwnerId },
            }
          : {}),
      });
      if (!registered) {
        // Registration is the one reliable control frame that cannot be
        // retried on this socket: without the acknowledgement the host
        // cannot know it is live, while retaining it here would create a
        // registered-but-unusable control entry. Tear down this attempt so
        // the host reconnects and retries registration cleanly.
        removeHost(rt, frame.serverId);
        control.close(1013, "relay link congestion");
      }
      return;
    }
    if (!serverId) {
      clearTimeout(registrationTimer);
      control.close(1008, "host must register first");
      return;
    }
    const registeredHost = rt.hosts.get(serverId);
    if (!registeredHost || registeredHost.control !== control) return;
    if (frame.t === "res") {
      const pending = rt.pending.get(frame.id);
      if (pending && pending.serverId === serverId && rt.pending.delete(frame.id)) {
        pending.resolve({
          status: frame.status,
          headers: frame.headers,
          body: Buffer.from(frame.body, "base64"),
          ...(frame.setCookies ? { setCookies: frame.setCookies } : {}),
        });
      }
      return;
    }
    if (frame.t === "req-error") {
      const pending = rt.pending.get(frame.id);
      if (pending && pending.serverId === serverId && rt.pending.delete(frame.id)) {
        pending.reject(new Error(frame.message));
      }
      return;
    }
    if (frame.t === "res-open") {
      const pending = rt.pending.get(frame.id);
      if (pending && pending.serverId === serverId && pending.stream && !pending.stream.opened) {
        // Strip hop-by-hop headers the relay shouldn't echo verbatim; the
        // body now arrives as res-chunk slices, so the origin's framing
        // (content-length/transfer-encoding) is stale by construction.
        const { "content-length": _cl, "transfer-encoding": _te, ...rest } = frame.headers;
        const responseHeaders: Record<string, string | string[]> = { ...rest };
        if (frame.setCookies && frame.setCookies.length > 0) {
          responseHeaders["set-cookie"] = [...frame.setCookies];
        }
        try {
          pending.stream.res.writeHead(frame.status, responseHeaders);
        } catch {
          // A hostile/buggy host sent a frame Node rejects: fail THIS
          // exchange (a 502 is still honest — nothing was written) and
          // never let a bad frame take down the shared relay process.
          rt.pending.delete(frame.id);
          clearTimeout(pending.timer);
          pending.reject(new Error("relay error"));
          return;
        }
        pending.stream.opened = true;
        // Mid-stream visitor death: the request path's listener was detached
        // when this response became streaming-owned, so watch here — cancel
        // host work instead of leaving it running to its own deadline.
        pending.stream.res.on("close", () => {
          const current = rt.pending.get(frame.id);
          if (current !== pending || current.stream?.opened !== true) return;
          if (current.stream.res.writableEnded) return;
          rt.pending.delete(frame.id);
          clearTimeout(current.timer);
          sendFrameForced(rt, registeredHost, { t: "req-cancel", id: frame.id });
        });
        // Resolves the request promise as streamed (which clears the
        // whole-request deadline), then arms the idle deadline.
        pending.resolve({ streamed: true });
        rearmStreamingIdle(rt, frame.id, pending);
      }
      return;
    }
    if (frame.t === "res-chunk") {
      const pending = rt.pending.get(frame.id);
      if (pending && pending.serverId === serverId && pending.stream?.opened) {
        rearmStreamingIdle(rt, frame.id, pending);
        const stream = pending.stream.res;
        if (stream.destroyed) return;
        stream.write(Buffer.from(frame.body, "base64"));
        if (stream.writableLength > RELAY_STREAM_MAX_BUFFERED_BYTES) {
          // Slow-consumer isolation: the visitor stopped reading; destroy
          // this response and stop the host's upstream work instead of
          // buffering without bound.
          rt.pending.delete(frame.id);
          clearTimeout(pending.timer);
          stream.destroy();
          sendFrameForced(rt, registeredHost, { t: "req-cancel", id: frame.id });
        }
      }
      return;
    }
    if (frame.t === "res-end") {
      const pending = rt.pending.get(frame.id);
      if (pending && pending.serverId === serverId && rt.pending.delete(frame.id)) {
        clearTimeout(pending.timer);
        if (pending.stream?.opened) {
          // A mid-stream error arrives after headers went out — no status
          // code can honestly describe the failure, so the connection is
          // reset rather than answered.
          if (frame.error) pending.stream.res.destroy();
          else pending.stream.res.end();
        } else {
          // Protocol violation (an end without an open): settle the
          // exchange like a request error instead of leaving the visitor
          // hanging with every other unwind path disarmed.
          pending.reject(new Error("relay error"));
        }
      }
      return;
    }
    if (frame.t === "ws-data") {
      const visitor = rt.visitors.get(frame.id);
      if (visitor && visitor.serverId === serverId && !sendRaw(rt, visitor.socket, frame.data)) {
        // P1-6: same zombie-channel cleanup as the binary branch above.
        rt.visitors.delete(frame.id);
        sendFrameForced(rt, registeredHost, { t: "ws-close", id: frame.id });
      }
      return;
    }
    if (frame.t === "ws-close") {
      const visitor = rt.visitors.get(frame.id);
      if (visitor && visitor.serverId === serverId && rt.visitors.delete(frame.id)) {
        // A host-side oversize rejection travels as the reserved reason;
        // surface it to the visitor as the RFC 6455 "message too big" close.
        // Any other reason (or none) keeps the plain close.
        if (frame.reason === RELAY_WS_PAYLOAD_TOO_LARGE_REASON) {
          visitor.socket.close(1009, frame.reason);
        } else {
          visitor.socket.close();
        }
      }
      return;
    }
  });
  control.on("close", () => {
    clearTimeout(registrationTimer);
    if (serverId && rt.hosts.get(serverId)?.control === control) {
      removeHost(rt, serverId);
      dropHostTraffic(rt, serverId, "Host disconnected.");
      // Start the reclamation clock; the secret binding itself persists so the
      // id cannot be re-claimed with a different secret until the TTL lapses.
      touchSecretBinding(rt, serverId);
    }
  });
}

/**
 * Validate `secret` against the durable serverId binding and (re)claim the id.
 * Returns false if the id is bound to a DIFFERENT secret and still within its
 * reclamation TTL. A never-bound id, a matching secret, or an expired binding
 * all succeed and (re)bind the id to `secret`.
 */
function claimSecretBinding(rt: RelayServerRuntime, serverId: string, secret: string): boolean {
  const now = rt.now();
  const existing = rt.secretBindings.get(serverId);
  if (existing && !secretsMatch(existing.secret, secret)) {
    const ttlMs = rt.options.secretBindingTtlMs ?? DEFAULT_SECRET_BINDING_TTL_MS;
    const live = rt.hosts.get(serverId)?.control.readyState === WebSocket.OPEN;
    // A live host with the wrong secret, or an idle-but-unexpired binding,
    // blocks reclamation. ttlMs <= 0 means "never reclaim".
    if (live || ttlMs <= 0 || now - existing.lastSeenAt < ttlMs) return false;
  }
  rt.secretBindings.set(serverId, { secret, lastSeenAt: now });
  return true;
}

/** Refresh a binding's reclamation clock (called when its host goes offline). */
function touchSecretBinding(rt: RelayServerRuntime, serverId: string): void {
  const existing = rt.secretBindings.get(serverId);
  if (existing) existing.lastSeenAt = rt.now();
}

export function dropHostTraffic(rt: RelayServerRuntime, serverId: string, reason: string): void {
  for (const [id, pending] of rt.pending) {
    if (pending.serverId === serverId && rt.pending.delete(id)) {
      clearTimeout(pending.timer);
      if (pending.stream?.opened) pending.stream.res.destroy();
      pending.reject(new Error(reason));
    }
  }
  for (const [id, visitor] of rt.visitors) {
    if (visitor.serverId === serverId && rt.visitors.delete(id)) {
      visitor.socket.close(1012, reason);
    }
  }
}

/**
 * Streaming idle deadline: once `res-open` arrived, the whole-request
 * deadline becomes an inactivity budget — every `res-chunk` re-arms it, so
 * a slow-but-progressing response is never retired mid-stream while a
 * stalled one still unwinds within the same timeout.
 */
function rearmStreamingIdle(rt: RelayServerRuntime, id: string, pending: PendingRequest): void {
  clearTimeout(pending.timer);
  pending.timer = setTimeout(() => {
    if (rt.pending.get(id) !== pending) return;
    rt.pending.delete(id);
    if (pending.stream?.opened) pending.stream.res.destroy();
    pending.reject(new Error("Relay request timed out."));
    const host = rt.hosts.get(pending.serverId);
    if (host) sendFrameForced(rt, host, { t: "req-cancel", id });
  }, rt.options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
}

export function liveHost(rt: RelayServerRuntime, serverId: string): RegisteredHost | undefined {
  const existing = rt.hosts.get(serverId);
  if (!existing) return undefined;
  if (existing.control.readyState === WebSocket.OPEN) return existing;
  removeHost(rt, serverId);
  dropHostTraffic(rt, serverId, "Host disconnected.");
  return undefined;
}

function removeHost(rt: RelayServerRuntime, serverId: string): void {
  const host = rt.hosts.get(serverId);
  if (host?.forwardOwnerId) rt.forwardOwners.delete(host.forwardOwnerId);
  rt.hosts.delete(serverId);
}
