import type { BrowserWindow, RenderProcessGoneDetails } from "electron";
import type { PoracodeChannel } from "@/shared/channel";
import type { PoracodeWindowKind } from "@/shared/ipc";

interface AppNavigationGuardOptions {
  isDev: boolean;
  devServerUrl?: string;
  /** Log-only surface label (e.g. "quick composer") to distinguish messages. */
  label?: string;
}

/**
 * Lock a privileged renderer to the app's own origin: deny `window.open`, and
 * block any top-level navigation/redirect to an off-app URL. The renderer holds
 * the full `poracode` preload bridge (DB, file pickers, openExternal, supervisor
 * RPC); a navigation away from the app origin would let that page inherit it.
 * External links go through IPC/openExternal, so the renderer never legitimately
 * navigates itself away or opens new windows.
 */
export function installAppNavigationGuards(
  window: BrowserWindow,
  options: AppNavigationGuardOptions,
): void {
  const prefix = options.label ? `${options.label} ` : "";
  const isAllowedAppUrl = (target: string): boolean => {
    try {
      const url = new URL(target);
      if (options.isDev && options.devServerUrl) {
        return url.origin === new URL(options.devServerUrl).origin || url.protocol === "file:";
      }
      return url.protocol === "file:";
    } catch {
      return false;
    }
  };
  const blockOffAppNavigation = (event: Electron.Event, target: string): void => {
    if (!isAllowedAppUrl(target)) {
      console.warn(`[poracode] blocked ${prefix}navigation to off-app URL: ${target}`);
      event.preventDefault();
    }
  };
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", blockOffAppNavigation);
  window.webContents.on("will-redirect", blockOffAppNavigation);
}

interface RendererReloadGuardOptions {
  loadRenderer: () => void;
  onRendererProcessGone?: (details: RenderProcessGoneDetails) => void;
  /** Log-only surface label (e.g. "quick composer") to distinguish messages. */
  label?: string;
}

/**
 * Reload a crashed renderer, but give up after more than 3 crashes within 5s so
 * a reload loop can't peg the CPU.
 */
export function installRendererReloadGuard(
  window: BrowserWindow,
  options: RendererReloadGuardOptions,
): void {
  const prefix = options.label ? `${options.label} ` : "";
  let lastReloadAt = 0;
  let reloadCount = 0;
  window.webContents.on("render-process-gone", (_event, details) => {
    if (details.reason === "clean-exit" || window.isDestroyed()) return;
    console.error(
      `[poracode] ${prefix}renderer gone: reason=${details.reason} exitCode=${details.exitCode}`,
    );
    options.onRendererProcessGone?.(details);
    const now = Date.now();
    reloadCount = now - lastReloadAt < 5_000 ? reloadCount + 1 : 1;
    lastReloadAt = now;
    if (reloadCount > 3) {
      console.error(`[poracode] ${prefix}renderer gone too many times in a row, not reloading`);
      return;
    }
    options.loadRenderer();
  });
}

interface RendererArgumentsOptions {
  appVersion: string;
  isDev: boolean;
  windowKind: PoracodeWindowKind;
  channel: PoracodeChannel;
  posthogEnableDev: boolean;
  posthogEnabled: boolean;
  posthogHost: string;
  posthogKey: string;
  sentryEnabled: boolean;
}

/** Preload `additionalArguments` that seed the renderer's bootstrap config. */
export function buildRendererAdditionalArguments(options: RendererArgumentsOptions): string[] {
  return [
    `--lc-app-version=${encodeURIComponent(options.appVersion)}`,
    `--lc-is-dev=${options.isDev ? "1" : "0"}`,
    `--lc-window-kind=${options.windowKind}`,
    `--lc-channel=${options.channel}`,
    `--lc-posthog-enable-dev=${options.posthogEnableDev ? "1" : "0"}`,
    `--lc-posthog-enabled=${options.posthogEnabled ? "1" : "0"}`,
    // PostHog project keys are browser/client keys, not secrets; the renderer must send them.
    `--lc-posthog-host=${encodeURIComponent(options.posthogHost)}`,
    `--lc-posthog-key=${encodeURIComponent(options.posthogKey)}`,
    `--lc-sentry-enabled=${options.sentryEnabled ? "1" : "0"}`,
  ];
}
