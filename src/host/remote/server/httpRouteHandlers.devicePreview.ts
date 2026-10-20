import {
  devicePreviewRenewSchema,
  devicePreviewStartSchema,
  devicePreviewTicketRequestSchema,
} from "@/shared/devicePreview";
import { deviceRequest } from "./httpRouteHandlers.devices";
import {
  requirePathParam,
  type HttpRouteCall,
  type HttpRouteHandlerTable,
} from "./httpRouteHandlers.shared";
import { readJsonBody } from "./requestBody";
import {
  androidPreviewMetadata,
  boundDevicePreview,
  iosPreviewConfig,
  streamIosPreview,
} from "./devicePreviewHttp";

type PreviewRouteId =
  | "device-preview-open"
  | "device-preview-renew"
  | "device-preview-close"
  | "device-preview-websocket-ticket"
  | "device-preview-android-api"
  | "device-preview-android-devices"
  | "device-preview-ios-api"
  | "device-preview-ios-config"
  | "device-preview-ios-video";

function owner(call: HttpRouteCall) {
  return [
    requirePathParam(call.params, "threadId"),
    call.session!.sessionId,
    requirePathParam(call.params, "sessionId"),
  ] as const;
}

export const DEVICE_PREVIEW_ROUTE_HANDLERS: Pick<HttpRouteHandlerTable, PreviewRouteId> = {
  "device-preview-open": (call) =>
    deviceRequest(call, async (signal) => {
      const body = devicePreviewStartSchema.parse(await readJsonBody(call.req));
      const preview = await call.ctx.options.deviceWorkspace!.openPreview(
        ...owner(call),
        body,
        signal,
      );
      return preview.current();
    }),
  "device-preview-renew": (call) =>
    deviceRequest(call, async () => {
      const body = devicePreviewRenewSchema.parse(await readJsonBody(call.req));
      const preview = await call.ctx.options.deviceWorkspace!.previewConnection(
        ...owner(call),
        body.previewId,
      );
      call.ctx.options.deviceWorkspace!.renew(...owner(call));
      return preview.current();
    }),
  "device-preview-websocket-ticket": (call) =>
    deviceRequest(call, async () => {
      const body = devicePreviewTicketRequestSchema.parse(await readJsonBody(call.req));
      return call.ctx.options.deviceWorkspace!.previewTicket(...owner(call), body);
    }),
  "device-preview-close": (call) =>
    deviceRequest(call, async () => {
      const body = devicePreviewRenewSchema.parse(await readJsonBody(call.req));
      await call.ctx.options.deviceWorkspace!.closePreview(...owner(call), body.previewId);
      return { ok: true };
    }),
  "device-preview-android-api": (call) =>
    deviceRequest(call, async (signal) =>
      androidPreviewMetadata(await boundDevicePreview(call, "android"), signal),
    ),
  "device-preview-android-devices": (call) =>
    deviceRequest(call, async () => {
      const preview = await boundDevicePreview(call, "android");
      const serial = preview.descriptor.clientDeviceId;
      return { devices: [{ serial }], defaultSerial: serial };
    }),
  "device-preview-ios-api": (call) =>
    deviceRequest(call, async () => {
      const preview = await boundDevicePreview(call, "ios");
      return {
        device: preview.descriptor.clientDeviceId,
        url: ".",
        proxyHelpers: true,
        inputAdmission: true,
        streamSettings: { transport: "http", codec: "h264" },
      };
    }),
  "device-preview-ios-config": (call) =>
    deviceRequest(call, async (signal) =>
      iosPreviewConfig(await boundDevicePreview(call, "ios"), signal),
    ),
  "device-preview-ios-video": streamIosPreview,
};
