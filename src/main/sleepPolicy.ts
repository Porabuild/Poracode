import type { SharedSettings } from "@/shared/settings";

type SleepPolicySettings = Pick<SharedSettings, "preventSleep" | "remoteAccessEnabled">;

export function shouldPreventSystemSleep(
  settings: SleepPolicySettings,
  workingThreadCount: number,
): boolean {
  switch (settings.preventSleep) {
    case "always":
      return true;
    case "while-remote-access":
      return settings.remoteAccessEnabled || workingThreadCount > 0;
    case "while-working":
      return workingThreadCount > 0;
  }
}
