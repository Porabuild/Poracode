import { MessageChannelMain, type BrowserWindow } from "electron";
import type {
  AppDesktopActionNotStarted,
  AppDesktopActionReply,
} from "@/shared/contracts/appDesktopAction";
import {
  APP_MEMORY_SYNC_CLIENT_TIMEOUT_MS,
  appMemorySyncReplySchema,
  type AppMemorySyncRequest,
  type AppMemorySyncResult,
} from "@/shared/contracts/appMemorySync";
import { IPC_EVENT_CHANNELS } from "@/shared/ipc/channels";
import {
  appProviderLoginReplySchema,
  type AppProviderLoginRequest,
  type AppProviderLoginResult,
} from "@/shared/contracts/appProviderAuth";
import {
  APP_EXPERIMENT_CLIENT_TIMEOUT_MS,
  appExperimentReplySchema,
  type AppExperimentRequest,
  type AppExperimentResult,
} from "@/shared/contracts/appExperiment";

export function requestDesktopExperiment(
  window: BrowserWindow | null | undefined,
  request: AppExperimentRequest,
): Promise<AppExperimentResult | AppDesktopActionNotStarted> {
  return requestDesktopAction(window, request, {
    channel: IPC_EVENT_CHANNELS.appExperiment,
    parseReply: (value) => appExperimentReplySchema.safeParse(value),
    timeoutMs: APP_EXPERIMENT_CLIENT_TIMEOUT_MS,
    unavailable: "Experiment workflows require the desktop's main window.",
    disconnected: "The desktop experiment client disconnected.",
    timedOut: "The desktop stopped waiting for the experiment workflow. It may still be running.",
  });
}

export function requestDesktopMemorySync(
  window: BrowserWindow | null | undefined,
  request: AppMemorySyncRequest,
): Promise<AppMemorySyncResult | AppDesktopActionNotStarted> {
  return requestDesktopAction(window, request, {
    channel: IPC_EVENT_CHANNELS.appMemorySync,
    parseReply: (value) => appMemorySyncReplySchema.safeParse(value),
    timeoutMs: APP_MEMORY_SYNC_CLIENT_TIMEOUT_MS,
    unavailable: "Memory sync requires the desktop's main window.",
    disconnected: "The desktop memory sync client disconnected.",
    timedOut: "The desktop stopped waiting for memory sync. Sync may still be running.",
  });
}

/** Opens the app's private sign-in panel on the owning desktop. */
export function requestDesktopProviderLogin(
  window: BrowserWindow | null | undefined,
  request: AppProviderLoginRequest,
): Promise<AppProviderLoginResult | AppDesktopActionNotStarted> {
  return requestDesktopAction(window, request, {
    channel: IPC_EVENT_CHANNELS.appProviderLogin,
    parseReply: (value) => appProviderLoginReplySchema.safeParse(value),
    timeoutMs: 45_000,
    unavailable: "Provider terminal sign-in requires the desktop's main window.",
    disconnected: "The desktop sign-in client disconnected.",
    timedOut: "The desktop did not confirm whether the login terminal opened.",
  });
}

/** The renderer admits an action on its private port. */
export async function requestDesktopAction<Result>(
  window: BrowserWindow | null | undefined,
  request: unknown,
  options: {
    channel: string;
    parseReply(
      value: unknown,
    ): { success: true; data: AppDesktopActionReply<Result> } | { success: false };
    timeoutMs: number;
    unavailable: string;
    disconnected: string;
    timedOut: string;
  },
): Promise<Result | AppDesktopActionNotStarted> {
  if (!window || window.isDestroyed() || window.webContents.isLoadingMainFrame()) {
    return { type: "not-started", message: options.unavailable };
  }
  const contents = window.webContents;
  const { port1, port2 } = new MessageChannelMain();
  const result = Promise.withResolvers<Result | AppDesktopActionNotStarted>();
  let started = false;
  let settled = false;
  const fail = (message: string) => {
    settled = true;
    if (started) result.reject(new Error(message));
    else result.resolve({ type: "not-started", message });
  };
  const unavailable = () => fail(options.disconnected);
  const admission = setTimeout(unavailable, 3_000);
  const deadline = setTimeout(() => fail(options.timedOut), options.timeoutMs);
  admission.unref();
  deadline.unref();
  contents.once("destroyed", unavailable);
  port1.once("close", unavailable);
  port1.on("message", ({ data }) => {
    if (settled) return;
    const reply = options.parseReply(data);
    if (!reply.success) {
      unavailable();
      return;
    }
    switch (reply.data.type) {
      case "attached":
        clearTimeout(admission);
        break;
      case "accepted":
        if (started) return;
        clearTimeout(admission);
        started = true;
        try {
          port1.postMessage({ version: 1, type: "start" });
        } catch (error) {
          result.reject(error);
        }
        break;
      case "result":
        if (started) {
          settled = true;
          result.resolve(reply.data.result);
        } else unavailable();
        break;
      case "error":
        fail(reply.data.message);
        break;
    }
  });
  port1.start();
  try {
    contents.postMessage(options.channel, request, [port2]);
  } catch {
    port2.close();
    unavailable();
  }
  try {
    return await result.promise;
  } finally {
    clearTimeout(admission);
    clearTimeout(deadline);
    contents.removeListener("destroyed", unavailable);
    port1.close();
  }
}
