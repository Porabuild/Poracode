import { app, ipcMain } from "electron";
import { IPC_WINDOW_CHANNELS } from "@/shared/ipc/channels";
import {
  remoteHttpBridgeCancelRequestSchema,
  remoteHttpBridgeOpenRequestSchema,
} from "@/shared/remote/httpBridgeValidation";
import type { RemoteHttpBridgeSupervisor } from "./RemoteHttpBridgeSupervisor";

export interface RegisterRemoteHttpBridgeIpcOptions {
  readonly supervisor: RemoteHttpBridgeSupervisor;
}

/**
 * Wire the main-native remote HTTP bridge channels. These are window-scoped
 * native channels (like the F7 ownership grant), not typed procedures: only
 * `WebContents.postMessage` can transfer a `MessagePortMain`, and the open
 * call must address the invoking window. Main authenticates identity from the
 * IPC event, never from renderer-supplied ownership metadata.
 */
export function registerRemoteHttpBridgeIpc(options: RegisterRemoteHttpBridgeIpcOptions): void {
  const { supervisor } = options;
  ipcMain.handle(IPC_WINDOW_CHANNELS.remoteHttpBridgeOpen, (event, payload: unknown) => {
    const frame = event.senderFrame;
    const mainFrame = event.sender.mainFrame;
    if (frame && mainFrame && frame.routingId !== mainFrame.routingId) {
      throw new Error("The remote HTTP bridge is only available to the main frame.");
    }
    const request = remoteHttpBridgeOpenRequestSchema.parse(payload);
    return supervisor.open(event.sender, request);
  });
  ipcMain.handle(IPC_WINDOW_CHANNELS.remoteHttpBridgeCancel, (event, payload: unknown) => {
    const { requestId } = remoteHttpBridgeCancelRequestSchema.parse(payload);
    supervisor.cancel(event.sender.id, requestId);
  });
  app.on("web-contents-created", (_event, contents) => {
    supervisor.watchWebContents(contents);
  });
  app.on("before-quit", () => {
    supervisor.shutdown();
  });
}
