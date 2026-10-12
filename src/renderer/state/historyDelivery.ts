import { noteHistoryDeliveryGap } from "./historyResumeRegistry";
/** Frame-local delivery evidence. Never put transport metadata into canonical runtime rows. */
const omittedByEvent = new WeakMap<object, ReadonlySet<string>>();
export function rememberHistoryContentOmissions(event: object, threadIds: readonly string[]): void {
  if (threadIds.length > 0) omittedByEvent.set(event, new Set(threadIds));
  for (const threadId of threadIds) noteHistoryDeliveryGap(threadId);
}
export function historyContentOmissions(event: object): ReadonlySet<string> | undefined {
  return omittedByEvent.get(event);
}
