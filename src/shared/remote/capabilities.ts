import type { RemoteDesktopClient } from "./client";

export type RemotePortsClient = Pick<
  RemoteDesktopClient,
  "listPorts" | "startPortForward" | "stopPortForward" | "enterPortForward"
>;

export type RemotePushClient = Pick<
  RemoteDesktopClient,
  "registerPush" | "unregisterPush" | "webPushConfig"
>;

export type RemoteSettingsClient = Pick<RemoteDesktopClient, "settings" | "updateSettings">;
