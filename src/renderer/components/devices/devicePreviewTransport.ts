import type { DeviceClientTransport } from "@expo/hub-client";
import type { DevicePreview } from "@/shared/devicePreview";
import type { DevicePreviewResource } from "@/shared/remote/clientDevicePreview";
import { RemoteClientError, type RemoteDesktopClient } from "@/shared/remote/client";
import { withThreadDeviceClient } from "./deviceClient";
import { openDeviceInputSocket, openDeviceVideoResponse } from "./devicePreviewSockets";

/** Each dispatch resolves the thread's current host again. No provider token,
 * Hub token, SDK Authorization option or untrusted advertised URL is used. */
export function createDevicePreviewTransport(
  threadId: string,
  hostThreadId: string,
  owner: RemoteDesktopClient,
  preview: DevicePreview,
  lifetime: AbortSignal,
): DeviceClientTransport {
  const base = new URL(owner.devicePreviewBaseUrl(hostThreadId, preview));
  function owned<T>(invoke: (client: RemoteDesktopClient, id: string) => Promise<T>): Promise<T> {
    lifetime.throwIfAborted();
    return withThreadDeviceClient(threadId, (client, id) => {
      if (client.endpoint !== owner.endpoint || id !== hostThreadId)
        throw new RemoteClientError(
          "The device-preview host changed.",
          410,
          "device_preview_expired",
        );
      lifetime.throwIfAborted();
      return invoke(client, id);
    });
  }
  function route(raw: string, websocket = false): { url: URL; path: string } {
    const url = new URL(raw);
    const expectedProtocol = websocket
      ? base.protocol === "https:"
        ? "wss:"
        : "ws:"
      : base.protocol;
    if (
      url.protocol !== expectedProtocol ||
      url.host !== base.host ||
      !url.pathname.startsWith(`${base.pathname}/`) ||
      url.username ||
      url.password ||
      url.hash
    )
      throw new RemoteClientError(
        "The device-preview endpoint is invalid.",
        400,
        "invalid_device_preview_resource",
      );
    const keys = [...url.searchParams.keys()];
    if (
      new Set(keys).size !== keys.length ||
      keys.some((key) => key !== "device" && !(websocket && key === "frame-meta")) ||
      (url.searchParams.has("device") &&
        url.searchParams.get("device") !== preview.clientDeviceId) ||
      (url.searchParams.has("frame-meta") && url.searchParams.get("frame-meta") !== "1")
    )
      throw new RemoteClientError(
        "The device-preview target is invalid.",
        400,
        "invalid_device_preview_resource",
      );
    return { url, path: url.pathname.slice(base.pathname.length) };
  }
  return {
    async fetch(input, init) {
      const request = input instanceof Request ? input : null;
      const signal = AbortSignal.any([
        lifetime,
        ...(init?.signal ? [init.signal] : request ? [request.signal] : []),
      ]);
      signal.throwIfAborted();
      if ((init?.method ?? request?.method ?? "GET").toUpperCase() !== "GET")
        return new Response(null, { status: 403 });
      const { path } = route(request ? request.url : String(input));
      const helper = `/helper/${encodeURIComponent(preview.clientDeviceId)}`;
      if (preview.platform === "ios" && path === `${helper}/stream.avcc`) {
        return owned(async (client, id) =>
          openDeviceVideoResponse(
            await client.devicePreviewSocketUrl(id, preview, "ios-video", signal),
            signal,
          ),
        );
      }
      const resource: DevicePreviewResource | null =
        path === "/api"
          ? preview.platform === "ios"
            ? "ios-api"
            : "android-api"
          : path === "/api/devices" && preview.platform === "android"
            ? "android-devices"
            : path === `${helper}/config` && preview.platform === "ios"
              ? "ios-config"
              : null;
      // Optional SDK settings/log/recording features are absent. Their reads
      // fail locally and never widen the host's enumerated preview facade.
      if (!resource) return new Response(null, { status: 404 });
      return owned((client, id) => client.devicePreviewMetadata(id, preview, resource, signal));
    },
    async createWebSocket(raw, operationSignal) {
      const signal = AbortSignal.any([lifetime, operationSignal]);
      signal.throwIfAborted();
      const { path } = route(raw, true);
      if (path !== (preview.platform === "ios" ? "/helper/ws" : "/ws"))
        throw new RemoteClientError(
          "This device-preview socket is unavailable.",
          403,
          "invalid_device_preview_channel",
        );
      if (preview.platform === "ios" && preview.access !== "control")
        throw new RemoteClientError(
          "Device input requires control consent.",
          403,
          "device_control_denied",
        );
      return owned(async (client, id) =>
        openDeviceInputSocket(
          await client.devicePreviewSocketUrl(id, preview, preview.platform, signal),
          signal,
          preview.access === "control",
        ),
      );
    },
  };
}
