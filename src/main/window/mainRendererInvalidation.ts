import type { WebContents } from "electron";

export function installMainRendererInvalidation(
  contents: Pick<WebContents, "on">,
  options: { isCurrent(): boolean; invalidate(): void },
): void {
  const invalidateCurrent = () => {
    if (options.isCurrent()) options.invalidate();
  };
  // The loading indicator also starts for subframes. Those loads do not remount
  // the app, so its existing subscriptions and readiness remain valid.
  contents.on("did-start-navigation", (details) => {
    if (details.isMainFrame && !details.isSameDocument) invalidateCurrent();
  });
  contents.on("render-process-gone", invalidateCurrent);
  contents.on("destroyed", invalidateCurrent);
}
