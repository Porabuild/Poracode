import type { App } from "electron";
import type { SharedSettings } from "@/shared/settings";

export const WINDOWS_STARTUP_ARGUMENT = "--startup";

type StartupSettings = Pick<SharedSettings, "launchAtStartup" | "startMinimized">;

export function isWindowsStartupLaunch(
  argv: readonly string[],
  platform: NodeJS.Platform,
): boolean {
  return platform === "win32" && argv.includes(WINDOWS_STARTUP_ARGUMENT);
}

export function shouldStartMinimized(
  settings: StartupSettings,
  argv: readonly string[],
  platform: NodeJS.Platform,
): boolean {
  return (
    settings.launchAtStartup && settings.startMinimized && isWindowsStartupLaunch(argv, platform)
  );
}

export function syncWindowsStartupRegistration(
  electronApp: Pick<App, "setLoginItemSettings">,
  settings: StartupSettings,
  platform: NodeJS.Platform,
  isDev: boolean,
): void {
  if (platform !== "win32" || isDev) return;
  electronApp.setLoginItemSettings({
    openAtLogin: settings.launchAtStartup,
    args: [WINDOWS_STARTUP_ARGUMENT],
  });
}
