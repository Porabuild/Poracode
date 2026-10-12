import { readBridge } from "@/renderer/bridge";
import { runRendererAction } from "@/renderer/state/rendererActionStore";

/** Move the in-app browser out into its own OS window. Fire-and-forget. */
export function extractBrowserToWindow(): void {
  void runRendererAction("browser:window", () => readBridge().browserExtractToWindow()).catch(
    () => {},
  );
}

/** Bring the extracted browser window back into the right panel. Fire-and-forget. */
export function injectBrowserToMain(): void {
  void runRendererAction("browser:window", () => readBridge().browserInjectToMain()).catch(
    () => {},
  );
}
