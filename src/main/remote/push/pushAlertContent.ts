import type { ThreadStatus } from "@/shared/contracts";
import {
  GENERIC_ALERT_TITLE,
  IOS_ALERT_BODY_LOC_KEYS,
  IOS_ALERT_TITLE_LOC_KEY,
  type IOSLocalizedAlertContent,
} from "./payloads";

/**
 * How the Android tray notification for a thread-state transition should be
 * sent. Body strings are user-visible on the phone but originate here in the
 * desktop main process, so they stay plain English — push-body localization is
 * a separate concern from the Apple localization-key contract below.
 */
export interface AndroidStatusSpec {
  readonly body: string;
  readonly priority: number;
  /** Immediate (attention/finished/error) vs debounced (working). */
  readonly immediate: boolean;
  readonly silent?: boolean;
}

/** Maps a thread status to its Android status notification, or null (no push
 * for idle/inactive/launching). */
export function androidStatusFor(status: ThreadStatus): AndroidStatusSpec | null {
  switch (status) {
    case "working":
      // First activation of a thread: a quiet "Running" card, coalesced.
      return { body: "Running", priority: 5, immediate: false, silent: true };
    case "needs_approval":
    case "needs_reply":
      return { body: "Needs your input", priority: 10, immediate: true };
    case "finished":
      return { body: "Finished", priority: 10, immediate: true };
    case "error":
      return { body: "Ended with an error", priority: 10, immediate: true };
    default:
      return null;
  }
}

/** Fixed user-visible body for Android and web thread-state transitions. */
export function alertBody(status: ThreadStatus): string {
  switch (status) {
    case "finished":
      return "Finished";
    case "error":
      return "Ended with an error";
    case "needs_approval":
      return "Needs your approval";
    case "needs_reply":
      return "Needs your input";
    default:
      return "Updated";
  }
}

/** Redaction-aware alert title: the thread title when content may be shown,
 * otherwise the generic title. */
export function pushAlertTitle(threadTitle: string, redactContent: boolean): string {
  return redactContent ? GENERIC_ALERT_TITLE : threadTitle || GENERIC_ALERT_TITLE;
}

/** Content-free Apple localization dictionary for an iOS APNs alert. */
export function iosAlertContent(status: ThreadStatus): IOSLocalizedAlertContent {
  let bodyKey: IOSLocalizedAlertContent["loc-key"];
  switch (status) {
    case "finished":
      bodyKey = IOS_ALERT_BODY_LOC_KEYS.finished;
      break;
    case "error":
      bodyKey = IOS_ALERT_BODY_LOC_KEYS.error;
      break;
    case "needs_approval":
      bodyKey = IOS_ALERT_BODY_LOC_KEYS.needsApproval;
      break;
    case "needs_reply":
      bodyKey = IOS_ALERT_BODY_LOC_KEYS.needsInput;
      break;
    default:
      bodyKey = IOS_ALERT_BODY_LOC_KEYS.updated;
  }
  return { "title-loc-key": IOS_ALERT_TITLE_LOC_KEY, "loc-key": bodyKey };
}

/** Web push alert content; browser surfaces may show the thread title. */
export function webAlertContent(
  threadTitle: string,
  status: ThreadStatus,
  redactContent: boolean,
): { readonly title: string; readonly body: string } {
  return { title: pushAlertTitle(threadTitle, redactContent), body: alertBody(status) };
}
