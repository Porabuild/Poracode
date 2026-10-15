import type { ProjectLocation } from "@/shared/contracts";
import { agentSettingsEnvironment } from "../base/settingEnvironment";
import { claudeCapabilities } from "./detection";

/** Apply the same declared provider settings to SDK children as to terminal launches. */
export function claudeSdkSettingsEnv(
  location: ProjectLocation,
  values: Record<string, boolean | string> | undefined,
): Record<string, string> {
  const platform =
    location.kind === "wsl" ? "linux" : location.kind === "windows" ? "win32" : process.platform;
  return agentSettingsEnvironment(claudeCapabilities.settingDefs ?? [], values, platform);
}
