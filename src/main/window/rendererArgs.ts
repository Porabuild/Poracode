import type { LightcodeChannel } from "@/shared/channel";
import type { LightcodeWindowKind } from "@/shared/ipc";

export interface RendererArgOptions {
  appVersion: string;
  isDev: boolean;
  channel: LightcodeChannel;
  posthogEnableDev: boolean;
  posthogEnabled: boolean;
  posthogHost: string;
  posthogKey: string;
  sentryEnabled: boolean;
}

/**
 * Startup `additionalArguments` passed to every renderer window. The preload
 * reads these synchronously to populate the bridge before any IPC, so the main
 * and quick-composer windows must stay in lockstep here.
 */
export function buildRendererArgs(
  windowKind: LightcodeWindowKind,
  options: RendererArgOptions,
): string[] {
  return [
    `--lc-window-kind=${windowKind}`,
    `--lc-app-version=${encodeURIComponent(options.appVersion)}`,
    `--lc-is-dev=${options.isDev ? "1" : "0"}`,
    `--lc-channel=${options.channel}`,
    `--lc-posthog-enable-dev=${options.posthogEnableDev ? "1" : "0"}`,
    `--lc-posthog-enabled=${options.posthogEnabled ? "1" : "0"}`,
    // PostHog project keys are browser/client keys, not secrets; the renderer must send them.
    `--lc-posthog-host=${encodeURIComponent(options.posthogHost)}`,
    `--lc-posthog-key=${encodeURIComponent(options.posthogKey)}`,
    `--lc-sentry-enabled=${options.sentryEnabled ? "1" : "0"}`,
  ];
}
