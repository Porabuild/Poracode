import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, type WebSocketServer } from "ws";
import {
  DEVICE_PREVIEW_MAX_BUFFER_BYTES,
  DEVICE_PREVIEW_MAX_PACKET_BYTES,
  devicePreviewCreditSchema,
} from "@/shared/devicePreview";
import type { OwnedDevicePreview } from "@/host/devices/DevicePreviewSessions";
import { DevicePreviewCredits } from "@/host/devices/DevicePreviewCredits";
import { DevicePreviewAvccGuard } from "@/shared/devicePreviewAvcc";
import type { RemoteServerContext } from "./context";
import { openIosPreviewVideo } from "./devicePreviewHttp";
import { outboundFrameBytes } from "./outboundBudget";

/** AVCC bytes stay upstream's wire format. Credit bounds data awaiting a
 * browser reader as well as data retained by the host's ws send queue. */
export async function acceptDevicePreviewVideoSocket(
  ctx: RemoteServerContext,
  server: WebSocketServer,
  preview: OwnedDevicePreview,
  principal: string,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): Promise<void> {
  const lease = ctx.principalAdmission.tryAdmitSocket(principal);
  const controller = new AbortController();
  const finished = Promise.withResolvers<void>();
  let client: WebSocket | undefined;
  let disown: (() => void) | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let stopping: Promise<void> | undefined;
  let started = false;
  let cancelling: Promise<void> | undefined;
  const cancelReader = () => {
    if (!reader) return Promise.resolve();
    return (cancelling ??= reader.cancel().catch(() => undefined));
  };
  const credits = new DevicePreviewCredits(controller.signal);
  const stop = () => {
    stopping ??= (async () => {
      controller.abort();
      clearInterval(timer);
      clearTimeout(idle);
      preview.signal.removeEventListener("abort", abort);
      const close =
        !client || client.readyState === WebSocket.CLOSED
          ? Promise.resolve()
          : new Promise<void>((resolve) => client!.once("close", resolve));
      client?.terminate();
      await Promise.all([close, cancelReader(), finished.promise]);
      disown?.();
      lease.release();
    })();
    return stopping;
  };
  const abort = () => {
    void stop();
  };
  const resetIdle = () => {
    clearTimeout(idle);
    idle = setTimeout(abort, 30_000);
    idle.unref();
  };
  const pump = async () => {
    const envelopes = new DevicePreviewAvccGuard();
    try {
      const response = await openIosPreviewVideo(preview, controller.signal);
      if (controller.signal.aborted) {
        await response.body?.cancel();
        controller.signal.throwIfAborted();
      }
      if (!response.body) throw new Error("missing preview body");
      reader = response.body.getReader();
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) {
          envelopes.finish();
          break;
        }
        if (!chunk.value.byteLength) continue;
        if (chunk.value.byteLength > DEVICE_PREVIEW_MAX_PACKET_BYTES)
          throw new Error("preview packet exceeds budget");
        envelopes.push(chunk.value);
        await credits.take(chunk.value.byteLength);
        controller.signal.throwIfAborted();
        preview.assert();
        if (!client || client.readyState !== WebSocket.OPEN || ctx.stopping)
          throw new Error("preview closed");
        const framed = outboundFrameBytes(chunk.value.byteLength);
        if (client.bufferedAmount + framed > DEVICE_PREVIEW_MAX_BUFFER_BYTES)
          throw new Error("preview congested");
        const reservation = ctx.principalAdmission.tryReserveOutboundBytes(
          client,
          principal,
          framed,
        );
        if (!reservation) throw new Error("preview outbound budget exceeded");
        resetIdle();
        await new Promise<void>((resolve, reject) => {
          try {
            client!.send(chunk.value, { binary: true }, (error) => {
              reservation.release();
              if (error) reject(error);
              else resolve();
            });
          } catch (error) {
            reservation.release();
            reject(error);
          }
        });
      }
    } catch {
      // Close/error is the only public diagnostic. No helper response, path,
      // token or unbounded stderr is copied onto the client connection.
    } finally {
      controller.abort();
      await cancelReader();
      reader?.releaseLock();
      finished.resolve();
      abort();
    }
  };
  try {
    disown = preview.ownResource("video", stop);
    preview.signal.addEventListener("abort", abort, { once: true });
    preview.assert();
    server.handleUpgrade(req, socket, head, (ws) => {
      started = true;
      client = ws;
      ws.on("error", abort);
      ws.once("close", abort);
      ws.on("message", (data, binary) => {
        try {
          preview.assert();
          if (binary) throw new Error("video channel refuses input");
          const bytes = Array.isArray(data)
            ? Buffer.concat(data)
            : Buffer.isBuffer(data)
              ? data
              : Buffer.from(data);
          if (bytes.length > 512) throw new Error("invalid preview credit");
          credits.grant(devicePreviewCreditSchema.parse(JSON.parse(bytes.toString("utf8"))));
        } catch {
          abort();
        }
      });
      timer = setInterval(() => {
        try {
          if (ctx.stopping) throw new Error("host stopped");
          preview.assert();
        } catch {
          abort();
        }
      }, 1000);
      timer.unref();
      resetIdle();
      void pump();
    });
  } finally {
    if (!started) {
      finished.resolve();
      await stop();
    }
  }
}
