import { readBridge } from "@/renderer/bridge";
import { isBrowserClientRuntime } from "@/renderer/clientRuntime";

/** Dispatch synchronously so browser clients retain the click's user activation. */
export function openSystemBrowserUrl(url: string): Promise<void> {
  const bridge = readBridge();
  return isBrowserClientRuntime() ? bridge.openExternal(url) : bridge.openExternalNative(url);
}
