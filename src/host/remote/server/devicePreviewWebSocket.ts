import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { z } from "zod";
import {
  DEVICE_PREVIEW_MAX_BUFFER_BYTES,
  DEVICE_PREVIEW_MAX_INPUT_BYTES,
  DEVICE_PREVIEW_MAX_PACKET_BYTES,
  DEVICE_PREVIEW_MAX_QUEUED_PACKETS,
  DEVICE_PREVIEW_VERSION,
  devicePreviewCreditSchema,
  devicePreviewInputSchema,
  devicePreviewIosConfigSchema,
  devicePreviewSizeSchema,
} from "@/shared/devicePreview";
import {
  DevicePreviewInputState,
  filterDevicePreviewInput,
} from "@/host/devices/DevicePreviewProtocol";
import { DevicePreviewCredits } from "@/host/devices/DevicePreviewCredits";
import { DeviceWorkspaceError } from "@/host/devices/deviceProcess";
import { RemoteHttpError } from "../auth";
import type { RemoteServerContext } from "./context";
import { requirePathParam } from "./httpRouteHandlers.shared";
import { androidPreviewMetadata } from "./devicePreviewHttp";
import { outboundFrameBytes } from "./outboundBudget";
import { acceptDevicePreviewVideoSocket } from "./devicePreviewVideoSocket";

const servers = new WeakMap<RemoteServerContext, WebSocketServer>();
function previewServer(ctx: RemoteServerContext): WebSocketServer {
  let server = servers.get(ctx);
  if (!server) {
    server = new WebSocketServer({
      noServer: true,
      clientTracking: false,
      perMessageDeflate: false,
      maxPayload: DEVICE_PREVIEW_MAX_INPUT_BYTES,
    });
    servers.set(ctx, server);
    const owned = server;
    ctx.wss.once("close", () => owned.close());
  }
  return server;
}

function bytesOf(data: RawData): Buffer {
  return Buffer.isBuffer(data)
    ? data
    : Array.isArray(data)
      ? Buffer.concat(data)
      : Buffer.from(data);
}
function closed(ws: WebSocket | undefined): Promise<void> {
  if (!ws || ws.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise((resolve) => ws.once("close", resolve));
}

const androidSessionSchema = z.object({
  type: z.literal("video-session"),
  size: devicePreviewSizeSchema,
});
const socketPath =
  /^\/api\/threads\/(?<threadId>[^/]+)\/devices\/(?<sessionId>[^/]+)\/preview\/v1\/vendor\/(?<vendor>serve-emu|serve-sim)\/(?<channel>ws|helper\/ws|helper\/video-ws)$/u;

/** A separate terminated WS boundary. The general event socket's framing,
 * tickets, compression and capabilities do not authorize this media channel. */
export async function handleDevicePreviewUpgrade(
  ctx: RemoteServerContext,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  url: URL,
): Promise<boolean> {
  const match = socketPath.exec(url.pathname);
  if (!match?.groups) return false;
  try {
    ctx.security.enforceHostHeader(req);
    if (!ctx.security.allowsUpgradeOrigin(req))
      throw new RemoteHttpError("origin_not_allowed", "Remote origin is not allowed.", 403);
    const service = ctx.options.deviceWorkspace;
    if (!service || ctx.stopping)
      throw new RemoteHttpError(
        "device_preview_unavailable",
        "Device preview is unavailable.",
        503,
      );
    const binding = service.consumePreviewTicket(url.searchParams.get("ticket") ?? "");
    const threadId = requirePathParam(match.groups, "threadId");
    const sessionId = requirePathParam(match.groups, "sessionId");
    const ios = match.groups.vendor === "serve-sim";
    const video = match.groups.channel === "helper/video-ws";
    const channel = video ? "ios-video" : ios ? "ios" : "android";
    if (
      binding.threadId !== threadId ||
      binding.sessionId !== sessionId ||
      binding.generation !== service.generation ||
      binding.channel !== channel ||
      match.groups.channel !== (ios ? (video ? "helper/video-ws" : "helper/ws") : "ws") ||
      [...url.searchParams.keys()].some((key) => key !== "ticket" && key !== "device") ||
      url.searchParams.getAll("ticket").length !== 1 ||
      url.searchParams.getAll("device").length !== 1
    )
      throw new RemoteHttpError(
        "device_preview_mismatch",
        "The preview connection does not belong to this device.",
        403,
      );
    ctx.auth.authenticateSession(binding.principal, ["session:read"]);
    const work = ctx.principalAdmission.tryAdmitWork(binding.principal, "bulk");
    const controller = new AbortController();
    const cancel = () => controller.abort();
    socket.once("close", cancel);
    try {
      const preview = await service.previewConnection(
        threadId,
        binding.principal,
        sessionId,
        binding.previewId,
      );
      preview.assert(ios && !video);
      if (url.searchParams.get("device") !== preview.descriptor.clientDeviceId)
        throw new RemoteHttpError(
          "device_preview_mismatch",
          "The preview connection does not belong to this device.",
          403,
        );
      if (video) {
        await preview.verifyIdentity(controller.signal);
        controller.signal.throwIfAborted();
        await acceptDevicePreviewVideoSocket(
          ctx,
          previewServer(ctx),
          preview,
          binding.principal,
          req,
          socket,
          head,
        );
        return true;
      }
      const initial = ios ? null : await androidPreviewMetadata(preview, controller.signal);
      if (ios) await preview.verifyIdentity(controller.signal);
      controller.signal.throwIfAborted();
      preview.assert(ios);
      const socketLease = ctx.principalAdmission.tryAdmitSocket(binding.principal);
      let downstream: WebSocket | undefined;
      let upstream: WebSocket | undefined;
      let disown: (() => void) | undefined;
      let timer: ReturnType<typeof setInterval> | undefined;
      let idle: ReturnType<typeof setTimeout> | undefined;
      let handedOff = false;
      let stopping: Promise<void> | undefined;
      let pending = 0;
      let windowStart = Date.now();
      let windowCount = 0;
      let resetAt = 0;
      let geometry = initial ? JSON.stringify(initial.size) : null;
      let announcedVideoSession = false;
      const epoch = randomUUID();
      const input = new DevicePreviewInputState(preview.descriptor.platform);
      const mediaAbort = new AbortController();
      const credits = new DevicePreviewCredits(mediaAbort.signal);
      const media: { data: Buffer | string; binary: boolean; bytes: number }[] = [];
      let retainedBytes = 0;
      let retainedPackets = 0;
      let draining: Promise<void> | undefined;
      const stop = () => {
        stopping ??= (async () => {
          mediaAbort.abort();
          clearInterval(timer);
          clearTimeout(idle);
          media.length = 0;
          preview.signal.removeEventListener("abort", abort);
          // These finite releases address only presses admitted on this exact
          // upstream connection. They cannot be replayed onto a replacement.
          if (upstream?.readyState === WebSocket.OPEN) {
            const active = upstream;
            const releases = input.release();
            if (releases.length) {
              let timeout: ReturnType<typeof setTimeout> | undefined;
              await Promise.race([
                Promise.all(
                  releases.map(
                    (packet) =>
                      new Promise<void>((resolve) => {
                        try {
                          active.send(packet, { binary: Buffer.isBuffer(packet) }, () => resolve());
                        } catch {
                          resolve();
                        }
                      }),
                  ),
                ),
                new Promise<void>((resolve) => {
                  timeout = setTimeout(resolve, 500);
                  timeout.unref();
                }),
              ]).finally(() => clearTimeout(timeout));
            }
          }
          const joins = [closed(downstream), closed(upstream)];
          downstream?.terminate();
          upstream?.terminate();
          await Promise.all(joins);
          await draining?.catch(() => undefined);
          disown?.();
          socketLease.release();
        })();
        return stopping;
      };
      const abort = () => {
        void stop();
      };
      const send = async (data: Buffer | string, binary: boolean) => {
        preview.assert();
        if (!downstream || downstream.readyState !== WebSocket.OPEN || stopping) return;
        const count = typeof data === "string" ? Buffer.byteLength(data) : data.length;
        const framed = outboundFrameBytes(count);
        if (
          count > DEVICE_PREVIEW_MAX_PACKET_BYTES ||
          downstream.bufferedAmount + framed > DEVICE_PREVIEW_MAX_BUFFER_BYTES
        )
          throw new Error("preview congested");
        const reservation = ctx.principalAdmission.tryReserveOutboundBytes(
          downstream,
          binding.principal,
          framed,
        );
        if (!reservation) throw new Error("preview outbound budget exceeded");
        await new Promise<void>((resolve, reject) => {
          try {
            downstream!.send(data, { binary }, (error) => {
              reservation.release();
              if (error) reject(error);
              else resolve();
            });
          } catch (error) {
            reservation.release();
            reject(error);
          }
        });
      };
      const resetIdle = () => {
        clearTimeout(idle);
        idle = setTimeout(abort, 30_000);
        idle.unref();
      };
      const drain = () => {
        if (draining || stopping) return;
        draining = (async () => {
          while (media.length) {
            if (stopping) break;
            const packet = media.shift()!;
            await credits.take(packet.bytes);
            await send(packet.data, packet.binary);
            retainedBytes -= packet.bytes;
            retainedPackets--;
            resetIdle();
          }
          if (!stopping) upstream?.resume();
        })();
        void draining.catch(abort).finally(() => {
          draining = undefined;
          if (media.length && !stopping) drain();
        });
      };
      const queueMedia = (data: Buffer | string, binary: boolean) => {
        const bytes = typeof data === "string" ? Buffer.byteLength(data) : data.length;
        if (
          bytes < 1 ||
          bytes > DEVICE_PREVIEW_MAX_PACKET_BYTES ||
          retainedBytes + bytes > DEVICE_PREVIEW_MAX_BUFFER_BYTES ||
          retainedPackets >= DEVICE_PREVIEW_MAX_QUEUED_PACKETS
        )
          throw new Error("preview helper queue exceeds budget");
        retainedBytes += bytes;
        retainedPackets++;
        media.push({ data, binary, bytes });
        upstream?.pause();
        drain();
      };
      try {
        disown = preview.ownResource(ios ? "input" : "video", stop);
        preview.signal.addEventListener("abort", abort, { once: true });
        preview.assert(ios);
        previewServer(ctx).handleUpgrade(req, socket, head, (client) => {
          handedOff = true;
          downstream = client;
          client.pause();
          client.on("error", abort);
          client.once("close", abort);
          const path = ios ? "/vendor/serve-sim/helper/ws" : "/vendor/serve-emu/ws";
          const target = new URL(path, preview.hub.origin);
          target.protocol = "ws:";
          target.searchParams.set("device", preview.descriptor.clientDeviceId);
          if (!ios) target.searchParams.set("frame-meta", "1");
          // Never forward any client header/subprotocol/cookie to the helper.
          upstream = new WebSocket(target, {
            headers: { authorization: `Bearer ${preview.hub.token}` },
            maxPayload: DEVICE_PREVIEW_MAX_PACKET_BYTES,
            perMessageDeflate: false,
            handshakeTimeout: 30_000,
          });
          const helper = upstream;
          helper.on("error", abort);
          helper.once("close", abort);
          helper.once("open", () => {
            try {
              preview.assert(ios);
              if (stopping) return;
              void send(
                JSON.stringify({
                  type: "device-preview-geometry",
                  version: DEVICE_PREVIEW_VERSION,
                  epoch,
                }),
                false,
              ).then(() => client.resume(), abort);
            } catch {
              abort();
            }
          });
          helper.on("message", (data, binary) => {
            try {
              if (stopping) return;
              preview.assert();
              const bytes = bytesOf(data);
              if (ios) {
                if (!binary) throw new Error("unsupported helper packet");
                if (bytes.length === 1 && bytes[0] === 0x83) {
                  queueMedia(bytes, true);
                  return;
                }
                if (bytes[0] !== 0x82 || bytes.length > 16_384)
                  throw new Error("unsupported helper packet");
                const config = devicePreviewIosConfigSchema.parse(
                  JSON.parse(bytes.subarray(1).toString("utf8")),
                );
                const next = JSON.stringify({
                  width: config.width,
                  height: config.height,
                  orientation: config.orientation,
                });
                if (geometry !== null && geometry !== next) {
                  abort();
                  return;
                }
                geometry = next;
                queueMedia(
                  Buffer.concat([Buffer.from([0x82]), Buffer.from(JSON.stringify(config))]),
                  true,
                );
              } else if (binary) queueMedia(bytes, true);
              else {
                const config = androidSessionSchema.safeParse(JSON.parse(bytes.toString("utf8")));
                if (!config.success) return; // No helper errors/diagnostics reach the public stream.
                const next = JSON.stringify(config.data.size);
                if (announcedVideoSession || (geometry !== null && geometry !== next)) {
                  abort();
                  return;
                }
                announcedVideoSession = true;
                geometry = next;
                queueMedia(JSON.stringify(config.data), false);
              }
            } catch {
              abort();
            }
          });
          client.on("message", (data, binary) => {
            try {
              preview.assert();
              if (stopping || binary || helper.readyState !== WebSocket.OPEN)
                throw new Error("invalid preview input");
              const rawMessage: unknown = JSON.parse(bytesOf(data).toString("utf8"));
              if (
                typeof rawMessage === "object" &&
                rawMessage !== null &&
                "type" in rawMessage &&
                rawMessage.type === "device-preview-credit"
              ) {
                if (bytesOf(data).length > 512) throw new Error("invalid preview credit");
                credits.grant(devicePreviewCreditSchema.parse(rawMessage));
                return;
              }
              if (pending >= 4) throw new Error("preview input congested");
              const now = Date.now();
              if (now - windowStart >= 1000) {
                windowStart = now;
                windowCount = 0;
              }
              if (++windowCount > 120) throw new Error("preview input rate exceeded");
              const envelope = devicePreviewInputSchema.parse(rawMessage);
              if (envelope.epoch !== epoch) throw new Error("stale preview geometry");
              const raw = Buffer.from(envelope.data, envelope.binary ? "base64" : "utf8");
              if (envelope.binary && raw.toString("base64") !== envelope.data)
                throw new Error("invalid preview input encoding");
              const packet = filterDevicePreviewInput(
                preview.descriptor.platform,
                raw,
                envelope.binary,
                preview.descriptor.access === "control",
              );
              preview.assert(packet.control);
              if (!packet.control) {
                if (now - resetAt < 500) return;
                resetAt = now;
              } else {
                if (geometry === null) throw new Error("preview geometry unavailable");
              }
              const admitted = ctx.principalAdmission.tryAdmitWork(binding.principal, "bulk");
              pending++;
              try {
                if (helper.bufferedAmount + raw.length > DEVICE_PREVIEW_MAX_INPUT_BYTES * 4)
                  throw new Error("preview input congested");
                if (packet.control) input.accept(packet.data);
                helper.send(packet.data, { binary: Buffer.isBuffer(packet.data) }, (error) => {
                  pending--;
                  admitted.release();
                  if (error) abort();
                });
              } catch (error) {
                pending--;
                admitted.release();
                throw error;
              }
            } catch {
              abort();
            }
          });
          timer = setInterval(() => {
            try {
              if (ctx.stopping) throw new Error("host stopping");
              preview.assert(ios);
            } catch {
              abort();
            }
          }, 1000);
          timer.unref();
          resetIdle();
        });
      } finally {
        if (!handedOff) await stop();
      }
      return true;
    } finally {
      work.release();
      socket.removeListener("close", cancel);
    }
  } catch (error) {
    if (error instanceof DeviceWorkspaceError)
      throw new RemoteHttpError(error.code, error.message, error.status);
    throw error;
  }
}
