import type { PushTokenRef, StoredPushRegistration } from "./PushRegistrationStore";

/** A legacy identity must never fall through to another routed installation. */
export function samePushRegistrationIdentity(
  current: StoredPushRegistration,
  sent: StoredPushRegistration,
): boolean {
  return (
    current.deviceId === sent.deviceId &&
    current.platform === sent.platform &&
    current.routing?.clientConnectionId.toLowerCase() ===
      sent.routing?.clientConnectionId.toLowerCase() &&
    current.routing?.desktopId === sent.routing?.desktopId
  );
}

/** Provider rejection applies only to the exact credential on that request. */
export function matchesSentPushToken(
  current: StoredPushRegistration,
  sent: StoredPushRegistration,
  ref: PushTokenRef,
): boolean {
  if (!samePushRegistrationIdentity(current, sent)) return false;
  if (ref.kind === "web") {
    const before = sent.webPushSubscription;
    const after = current.webPushSubscription;
    return (
      before !== undefined &&
      after !== undefined &&
      before.endpoint === after.endpoint &&
      before.expirationTime === after.expirationTime &&
      before.keys.auth === after.keys.auth &&
      before.keys.p256dh === after.keys.p256dh
    );
  }
  const before =
    ref.kind === "activity"
      ? sent.activityTokens[ref.activityId]
      : ref.kind === "device"
        ? sent.deviceToken
        : sent.pushToStartToken;
  const after =
    ref.kind === "activity"
      ? current.activityTokens[ref.activityId]
      : ref.kind === "device"
        ? current.deviceToken
        : current.pushToStartToken;
  return before !== undefined && before === after;
}
