import type { SharedSettings } from "@/shared/settings";

type SleepPolicySettings = Pick<
  SharedSettings,
  "preventSleepWhileWorking" | "remoteAccessPreventSleep" | "remoteAccessEnabled"
>;

export function shouldPreventSystemSleep(
  settings: SleepPolicySettings,
  workingThreadCount: number,
): boolean {
  const threadRequiresAwake = settings.preventSleepWhileWorking && workingThreadCount > 0;
  const remoteAccessRequiresAwake =
    settings.remoteAccessPreventSleep && settings.remoteAccessEnabled;
  return threadRequiresAwake || remoteAccessRequiresAwake;
}
