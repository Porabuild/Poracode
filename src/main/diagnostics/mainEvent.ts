import { sanitizeSentryEvent, type SentryEventLike } from "@/shared/diagnostics/sentryPrivacy";
import { classifyNativeCrashEvent } from "./nativeCrash";

const TRANSIENT_NETWORK_CHANGED_ERROR = "net::ERR_NETWORK_CHANGED";
// STATUS_DLL_INIT_FAILED_LOGOFF and DBG_TERMINATE_PROCESS describe OS/debugger teardown.
const EXPECTED_WINDOWS_PROCESS_EXIT =
  /^(?:(?:Backend host|Supervisor) exited with code (?:3221226091|1073807364)\.?|Windows job object helper failed: helper exited with code (?:3221226091|1073807364) before assignment\.)$/u;

function isTransientNetworkChangedEvent(event: SentryEventLike): boolean {
  if (event.message === TRANSIENT_NETWORK_CHANGED_ERROR) return true;
  return (
    event.exception?.values?.some(
      (exception) => exception.value === TRANSIENT_NETWORK_CHANGED_ERROR,
    ) ?? false
  );
}

export function prepareMainSentryEvent<T extends SentryEventLike>(
  event: T,
  platform: NodeJS.Platform,
): T | null {
  if (
    isTransientNetworkChangedEvent(event) ||
    (platform === "win32" &&
      event.tags?.["poracode.process"] === "main" &&
      event.exception?.values?.some(
        (exception) =>
          exception.type === "Error" &&
          typeof exception.value === "string" &&
          EXPECTED_WINDOWS_PROCESS_EXIT.test(exception.value),
      ))
  ) {
    return null;
  }

  const treatment = classifyNativeCrashEvent(event, platform);
  if (treatment.drop) return null;
  const classified = treatment.fingerprint
    ? ({ ...event, fingerprint: treatment.fingerprint } as T)
    : event;
  return sanitizeSentryEvent(classified);
}
