/**
 * Bridge between the shared chat pane and the mobile PWA shell. The PWA
 * registers a listener that presents a bottom action sheet
 * (`UserMessageActionsSheet` in `src/mobile`); `UserMessage` calls
 * `openUserMessageActions` when a bubble is long-pressed in a remote session.
 * On desktop nothing registers and the call is a no-op — desktop keeps its
 * hover-revealed copy/revert strip. A module-level slot rather than React
 * context because the sheet host lives in the mobile shell far above the
 * pane, and one host per window is all there ever is.
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
