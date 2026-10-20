import { z } from "zod";
import {
  DEVICE_PREVIEW_MAX_BUFFER_BYTES,
  DEVICE_PREVIEW_MAX_PACKET_BYTES,
  devicePreviewIosConfigSchema,
  devicePreviewQuerySchema,
  devicePreviewSizeSchema,
} from "@/shared/devicePreview";
import { readBoundedResponseBody } from "@/shared/http";
import { DevicePreviewAvccGuard } from "@/shared/devicePreviewAvcc";
import type { OwnedDevicePreview } from "@/host/devices/DevicePreviewSessions";
import { DeviceWorkspaceError } from "@/host/devices/deviceProcess";
import { RemoteHttpError } from "../auth";
import { requirePathParam, type HttpRouteCall } from "./httpRouteHandlers.shared";

function unavailable(): DeviceWorkspaceError {
  return new DeviceWorkspaceError(
    "device_preview_unavailable",
    "The device-preview helper is unavailable. Reopen the preview.",
    503,
  );
}

export async function boundDevicePreview(call: HttpRouteCall, platform: "ios" | "android") {
  const service = call.ctx.options.deviceWorkspace;
  if (!service)
    throw new RemoteHttpError(
      "device_workspace_unavailable",
      "This host does not provide a device workspace.",
      501,
    );
  const query = devicePreviewQuerySchema.parse(Object.fromEntries(call.url.searchParams));
  if ([...call.url.searchParams.keys()].length !== Object.keys(query).length)
    throw new RemoteHttpError("invalid_preview_query", "The device-preview query is invalid.", 400);
  const preview = await service.previewConnection(
    requirePathParam(call.params, "threadId"),
    call.session!.sessionId,
    requirePathParam(call.params, "sessionId"),
    query.previewId,
  );
  const deviceId = preview.descriptor.clientDeviceId;
  if (
    preview.descriptor.platform !== platform ||
    (query.device !== undefined && query.device !== deviceId) ||
    (call.params.deviceId !== undefined && requirePathParam(call.params, "deviceId") !== deviceId)
  )
    throw new RemoteHttpError(
      "device_preview_mismatch",
      "The preview does not belong to this device.",
      403,
    );
  return preview;
}

async function hubResponse(
  preview: OwnedDevicePreview,
  path: string,
  signal: AbortSignal,
): Promise<Response> {
  preview.assert();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${preview.hub.origin}${path}`, {
      headers: { authorization: `Bearer ${preview.hub.token}` },
      signal: AbortSignal.any([preview.signal, signal, controller.signal]),
      redirect: "error",
    });
    preview.assert();
    if (!response.ok) {
      await response.body?.cancel();
      throw unavailable();
    }
    return response;
  } catch (error) {
    preview.assert();
    signal.throwIfAborted();
    if (error instanceof DeviceWorkspaceError) throw error;
    throw unavailable();
  } finally {
    clearTimeout(timer);
  }
}

async function hubJson(
  preview: OwnedDevicePreview,
  path: string,
  signal: AbortSignal,
): Promise<unknown> {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
  const response = await hubResponse(preview, path, deadline);
  try {
    const bytes = await readBoundedResponseBody(response, 128 * 1024);
    preview.assert();
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    preview.assert();
    deadline.throwIfAborted();
    throw unavailable();
  }
}

export async function androidPreviewMetadata(preview: OwnedDevicePreview, signal: AbortSignal) {
  await preview.verifyIdentity(signal);
  const value = await hubJson(
    preview,
    `/vendor/serve-emu/api?device=${encodeURIComponent(preview.descriptor.clientDeviceId)}`,
    signal,
  );
  const result = z.object({ size: devicePreviewSizeSchema }).safeParse(value);
  if (!result.success) throw unavailable();
  return { size: result.data.size, stream: { transport: "websocket" as const } };
}

export async function iosPreviewConfig(preview: OwnedDevicePreview, signal: AbortSignal) {
  await preview.verifyIdentity(signal);
  const value = await hubJson(
    preview,
    `/vendor/serve-sim/helper/${encodeURIComponent(preview.descriptor.clientDeviceId)}/config`,
    signal,
  );
  const result = devicePreviewIosConfigSchema.safeParse(value);
  if (!result.success) throw unavailable();
  return result.data;
}

export async function openIosPreviewVideo(
  preview: OwnedDevicePreview,
  signal: AbortSignal,
): Promise<Response> {
  await preview.verifyIdentity(signal);
  return hubResponse(
    preview,
    `/vendor/serve-sim/helper/${encodeURIComponent(preview.descriptor.clientDeviceId)}/stream.avcc`,
    signal,
  );
}

export async function streamIosPreview(call: HttpRouteCall): Promise<void> {
  call.res.setHeader("Cache-Control", "no-store");
  call.res.setHeader("X-Content-Type-Options", "nosniff");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  call.res.once("close", cancel);
  const finished = Promise.withResolvers<void>();
  let disown: (() => void) | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let removeRevoke: (() => void) | undefined;
  try {
    const preview = await boundDevicePreview(call, "ios");
    await preview.verifyIdentity(controller.signal);
    const stop = async () => {
      controller.abort();
      call.res.destroy();
      await finished.promise;
    };
    disown = preview.ownResource("video", stop);
    // Cancellation and authorization apply while the helper is idle as well
    // as before every byte sent. An idle client cannot retain a revoked view.
    const revoke = () => {
      controller.abort();
      call.res.destroy();
    };
    preview.signal.addEventListener("abort", revoke, { once: true });
    removeRevoke = () => preview.signal.removeEventListener("abort", revoke);
    timer = setInterval(() => {
      try {
        preview.assert();
      } catch {
        revoke();
      }
    }, 1000);
    timer.unref();
    const path = `/vendor/serve-sim/helper/${encodeURIComponent(preview.descriptor.clientDeviceId)}/stream.avcc`;
    const response = await hubResponse(preview, path, controller.signal);
    if (!response.body) throw unavailable();
    reader = response.body.getReader();
    call.res.writeHead(200, { "Content-Type": "application/octet-stream" });
    const resetIdle = () => {
      clearTimeout(idle);
      idle = setTimeout(revoke, 30_000);
      idle.unref();
    };
    resetIdle();
    const envelopes = new DevicePreviewAvccGuard();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) {
          envelopes.finish();
          break;
        }
        controller.signal.throwIfAborted();
        preview.assert();
        if (
          chunk.value.byteLength > DEVICE_PREVIEW_MAX_PACKET_BYTES ||
          call.res.writableLength + chunk.value.byteLength > DEVICE_PREVIEW_MAX_BUFFER_BYTES
        )
          throw unavailable();
        envelopes.push(chunk.value);
        resetIdle();
        if (!call.res.write(chunk.value)) {
          await new Promise<void>((resolve, reject) => {
            const drain = () => {
              cleanup();
              resolve();
            };
            const closed = () => {
              cleanup();
              reject(unavailable());
            };
            const cleanup = () => {
              call.res.removeListener("drain", drain);
              call.res.removeListener("close", closed);
            };
            call.res.once("drain", drain);
            call.res.once("close", closed);
            if (call.res.destroyed) closed();
          });
        }
      }
      call.res.end();
    } finally {
      removeRevoke();
    }
  } catch (error) {
    if (call.res.headersSent || controller.signal.aborted) {
      call.res.destroy();
      return;
    }
    if (error instanceof DeviceWorkspaceError)
      throw new RemoteHttpError(error.code, error.message, error.status);
    throw error;
  } finally {
    controller.abort();
    clearInterval(timer);
    clearTimeout(idle);
    removeRevoke?.();
    await reader?.cancel().catch(() => undefined);
    reader?.releaseLock();
    call.res.removeListener("close", cancel);
    disown?.();
    finished.resolve();
  }
}
