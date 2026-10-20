import type { ZodType } from "zod";
import {
  DEVICE_PREVIEW_VERSION,
  devicePreviewAndroidApiSchema,
  devicePreviewAndroidDevicesSchema,
  devicePreviewIosApiSchema,
  devicePreviewIosConfigSchema,
  devicePreviewPath,
  devicePreviewSchema,
  devicePreviewStartSchema,
  devicePreviewTicketSchema,
  type DevicePreview,
  type DevicePreviewChannel,
  type DevicePreviewStart,
} from "../devicePreview";
import type { RemoteEnvironmentDescriptor } from "./protocol/core";
import { RemoteClientAuth } from "./clientAuth";
import { RemoteClientError } from "./clientErrors";
import { parseResponse } from "./clientParse";
import { endpointUrl } from "./clientTypes";

export type DevicePreviewResource = "android-api" | "android-devices" | "ios-api" | "ios-config";

export function supportsDeviceLivePreview(descriptor: RemoteEnvironmentDescriptor): boolean {
  const capability = descriptor.capabilities?.deviceWorkspace?.livePreview;
  return Boolean(
    descriptor.capabilities?.deviceWorkspace?.versions.includes(1) &&
    capability?.versions.includes(DEVICE_PREVIEW_VERSION) &&
    capability.modes.includes("h264"),
  );
}

export abstract class RemoteClientDevicePreviewApi extends RemoteClientAuth {
  async openDevicePreview(
    threadId: string,
    sessionId: string,
    request: DevicePreviewStart,
    signal: AbortSignal,
  ): Promise<DevicePreview> {
    const body = devicePreviewStartSchema.parse(request);
    return parseResponse(
      devicePreviewSchema,
      await this.requestJson(devicePreviewPath(threadId, sessionId), {
        method: "POST",
        body,
        signal,
      }),
      "device preview",
    );
  }

  async renewDevicePreview(
    threadId: string,
    preview: DevicePreview,
    signal: AbortSignal,
  ): Promise<DevicePreview> {
    const result = parseResponse(
      devicePreviewSchema,
      await this.requestJson(`${devicePreviewPath(threadId, preview.sessionId)}/renew`, {
        method: "POST",
        body: { version: DEVICE_PREVIEW_VERSION, previewId: preview.id },
        signal,
      }),
      "device preview renewal",
    );
    if (
      result.id !== preview.id ||
      result.generation !== preview.generation ||
      result.sessionId !== preview.sessionId ||
      result.platform !== preview.platform ||
      result.clientDeviceId !== preview.clientDeviceId ||
      result.access !== preview.access
    )
      throw new RemoteClientError(
        "The device-preview owner changed.",
        410,
        "device_preview_expired",
      );
    return result;
  }

  async closeDevicePreview(threadId: string, preview: DevicePreview): Promise<void> {
    await this.requestJson(`${devicePreviewPath(threadId, preview.sessionId)}/close`, {
      method: "POST",
      body: { version: DEVICE_PREVIEW_VERSION, previewId: preview.id },
    });
  }

  devicePreviewBaseUrl(threadId: string, preview: DevicePreview): string {
    return endpointUrl(
      this.endpoint,
      `${devicePreviewPath(threadId, preview.sessionId)}/vendor/${preview.platform === "android" ? "serve-emu" : "serve-sim"}`,
    )
      .toString()
      .replace(/\/$/u, "");
  }

  async devicePreviewMetadata(
    threadId: string,
    preview: DevicePreview,
    resource: DevicePreviewResource,
    signal: AbortSignal,
  ): Promise<Response> {
    const ios = preview.platform === "ios";
    if ((ios && !resource.startsWith("ios-")) || (!ios && !resource.startsWith("android-")))
      throw new RemoteClientError(
        "The device-preview resource does not belong to this platform.",
        400,
        "invalid_device_preview_resource",
      );
    const path =
      resource === "ios-config"
        ? `/helper/${encodeURIComponent(preview.clientDeviceId)}/config`
        : resource === "android-devices"
          ? "/api/devices"
          : "/api";
    const url = new URL(`${this.devicePreviewBaseUrl(threadId, preview)}${path}`);
    url.searchParams.set("previewId", preview.id);
    url.searchParams.set("device", preview.clientDeviceId);
    // requestJson owns pinning, bounded response reads, cancellation and both
    // independent environment credentials. No SDK token/header is accepted.
    const relative = `${devicePreviewPath(threadId, preview.sessionId)}/vendor/${ios ? "serve-sim" : "serve-emu"}${path}${url.search}`;
    const raw = await this.requestJson(relative, { signal });
    const schema: ZodType =
      resource === "ios-api"
        ? devicePreviewIosApiSchema
        : resource === "ios-config"
          ? devicePreviewIosConfigSchema
          : resource === "android-devices"
            ? devicePreviewAndroidDevicesSchema
            : devicePreviewAndroidApiSchema;
    const result = parseResponse(schema, raw, "device preview metadata");
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  async devicePreviewSocketUrl(
    threadId: string,
    preview: DevicePreview,
    channel: DevicePreviewChannel,
    signal: AbortSignal,
  ): Promise<string> {
    signal.throwIfAborted();
    if ((channel === "android" ? "android" : "ios") !== preview.platform)
      throw new RemoteClientError(
        "The device-preview channel does not belong to this platform.",
        400,
        "invalid_device_preview_channel",
      );
    const ticket = parseResponse(
      devicePreviewTicketSchema,
      await this.requestJson(`${devicePreviewPath(threadId, preview.sessionId)}/websocket-ticket`, {
        method: "POST",
        body: { version: DEVICE_PREVIEW_VERSION, previewId: preview.id, channel },
        signal,
      }),
      "device preview connection ticket",
    );
    signal.throwIfAborted();
    if (ticket.expiresAt <= Date.now())
      throw new RemoteClientError(
        "The device-preview connection ticket expired.",
        401,
        "invalid_device_preview_ticket",
      );
    const suffix =
      channel === "ios-video" ? "/helper/video-ws" : channel === "ios" ? "/helper/ws" : "/ws";
    const url = new URL(`${this.devicePreviewBaseUrl(threadId, preview)}${suffix}`);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("ticket", ticket.ticket);
    url.searchParams.set("device", preview.clientDeviceId);
    return url.toString();
  }
}
