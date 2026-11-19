import type { BrowserWindow } from "electron";
import { IPC_EVENT_CHANNELS } from "@/shared/ipc";
import {
  APP_THREAD_TRANSFER_CLIENT_TIMEOUT_MS,
  appThreadTransferReplySchema,
  type AppThreadTransferNotStarted,
  type AppThreadTransferRequest,
  type AppThreadTransferResult,
} from "@/shared/contracts/appThreadTransfer";
import { requestDesktopAction } from "./desktopActionBroker";

export function requestDesktopThreadTransfer(
  window: BrowserWindow | null | undefined,
  request: AppThreadTransferRequest,
): Promise<AppThreadTransferResult | AppThreadTransferNotStarted> {
  return requestDesktopAction(window, request, {
    channel: IPC_EVENT_CHANNELS.appThreadTransfer,
    parseReply: (value) => appThreadTransferReplySchema.safeParse(value),
    timeoutMs: APP_THREAD_TRANSFER_CLIENT_TIMEOUT_MS,
    unavailable: "The source desktop's main window must be connected.",
    disconnected: "The desktop transfer client disconnected.",
    timedOut: "The desktop stopped waiting for the transfer outcome.",
  });
}
