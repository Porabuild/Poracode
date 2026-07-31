import { sanitizeSentryEvent, type SentryEventLike } from "@/shared/diagnostics/sentryPrivacy";
import { classifyNativeCrashEvent } from "./nativeCrash";

const TRANSIENT_NETWORK_CHANGED_ERROR = "net::ERR_NETWORK_CHANGED";

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
  if (isTransientNetworkChangedEvent(event)) {
    return null;
  }

  const treatment = classifyNativeCrashEvent(event, platform);
  if (treatment.drop) return null;
  const classified = treatment.fingerprint
    ? ({ ...event, fingerprint: treatment.fingerprint } as T)
    : event;
  return sanitizeSentryEvent(classified);
}
