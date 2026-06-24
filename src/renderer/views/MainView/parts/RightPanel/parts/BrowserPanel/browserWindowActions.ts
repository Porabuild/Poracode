import { readBridge } from "@/renderer/bridge";

/** Move the in-app browser out into its own OS window. Fire-and-forget. */
export function extractBrowserToWindow(): void {
  readBridge()
    .browserExtractToWindow()
    .catch(() => {});
}

/** Bring the extracted browser window back into the right panel. Fire-and-forget. */
export function injectBrowserToMain(): void {
  readBridge()
    .browserInjectToMain()
    .catch(() => {});
}
