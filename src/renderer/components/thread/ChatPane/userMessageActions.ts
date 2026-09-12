/**
 * Bridge from a compact chat row to the canonical app-level message action
 * sheet. A module-level slot avoids threading presentation state through the
 * virtualized transcript; one host is mounted per main renderer window.
 */
export interface UserMessageActionsRequest {
  /** Full prompt text — feeds the sheet's copy action and preview line. */
  text: string;
  /**
   * Opens the shared revert-confirm dialog owned by `MessageList`; null when
   * no checkpoint precedes the message.
   */
  requestRevert: (() => void) | null;
}

type UserMessageActionsListener = (request: UserMessageActionsRequest) => void;

let activeListener: UserMessageActionsListener | null = null;

export function setUserMessageActionsListener(listener: UserMessageActionsListener | null): void {
  activeListener = listener;
}

export function openUserMessageActions(request: UserMessageActionsRequest): void {
  activeListener?.(request);
}
