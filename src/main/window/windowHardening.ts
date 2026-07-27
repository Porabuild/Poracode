import type { BrowserWindow, RenderProcessGoneDetails } from "electron";
import type { PoracodeChannel } from "@/shared/channel";
import type { PoracodeWindowKind } from "@/shared/ipc";
import type { RendererProcessGoneIntent } from "@/main/diagnostics/processGone";

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
  onRendererProcessGone?: (
    details: RenderProcessGoneDetails,
    intent: RendererProcessGoneIntent | undefined,
  ) => void;
  /** Log-only surface label (e.g. "quick composer") to distinguish messages. */
  label?: string;
}

type RendererTerminationState = {
  intent?: RendererProcessGoneIntent;
  reloadCleanup?: () => void;
  reloadToken?: object;
};

const rendererTerminationStates = new WeakMap<BrowserWindow, RendererTerminationState>();

function terminationStateFor(window: BrowserWindow): RendererTerminationState {
  const existing = rendererTerminationStates.get(window);
  if (existing) return existing;
  const state: RendererTerminationState = {};
  rendererTerminationStates.set(window, state);
  return state;
}

function consumeRendererTerminationIntent(
  window: BrowserWindow,
): RendererProcessGoneIntent | undefined {
  const state = rendererTerminationStates.get(window);
  if (!state) return undefined;
  const intent = state.intent;
  state.reloadCleanup?.();
  delete state.intent;
  delete state.reloadCleanup;
  delete state.reloadToken;
  return intent;
}

export function noteRendererWindowClose(window: BrowserWindow, event: Electron.Event): void {
  const state = terminationStateFor(window);
  if (event.defaultPrevented) {
    if (state.intent === "window-close") delete state.intent;
    return;
  }
  state.reloadCleanup?.();
  delete state.reloadCleanup;
  delete state.reloadToken;
  state.intent = "window-close";
}

export function requestTrackedRendererReload(window: BrowserWindow): boolean {
  if (window.isDestroyed()) return false;
  const state = rendererTerminationStates.get(window);
  if (!state) return false;
  state.reloadCleanup?.();
  const reloadToken = {};
  state.intent = "reload";
  state.reloadToken = reloadToken;

  const removeReloadListeners = () => {
    window.webContents.removeListener("did-finish-load", clearReloadIntent);
    window.webContents.removeListener("did-fail-load", clearReloadIntent);
  };
  const clearReloadIntent = () => {
    removeReloadListeners();
    if (state.reloadToken !== reloadToken) return;
    delete state.intent;
    delete state.reloadCleanup;
    delete state.reloadToken;
  };
  state.reloadCleanup = removeReloadListeners;
  window.webContents.once("did-finish-load", clearReloadIntent);
  window.webContents.once("did-fail-load", clearReloadIntent);
  try {
    window.webContents.reload();
    return true;
  } catch {
    clearReloadIntent();
    return false;
  }
}

/**
 * Reload a crashed renderer, but give up after more than 3 crashes within 5s so
 * a reload loop can't peg the CPU.
 */
export function installRendererReloadGuard(
  window: BrowserWindow,
  options: RendererReloadGuardOptions,
): void {
  terminationStateFor(window);
  const prefix = options.label ? `${options.label} ` : "";
  let lastReloadAt = 0;
  let reloadCount = 0;
  window.webContents.on("render-process-gone", (_event, details) => {
    const intent = consumeRendererTerminationIntent(window);
    if (details.reason === "clean-exit" || window.isDestroyed()) return;
    console.error(
      `[poracode] ${prefix}renderer gone: reason=${details.reason} exitCode=${details.exitCode}`,
    );
    options.onRendererProcessGone?.(details, intent);
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
