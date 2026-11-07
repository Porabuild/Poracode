import { createContext, useContext } from "react";
import type { PrAskChat } from "../detail/prAskChat";

export interface PrAskChatFailure {
  message: string;
  /** The host may already have started the session; the retry is explicit, never automatic. */
  uncertain: boolean;
}

/**
 * What the chat panel needs beyond `PrAskChat`: the thread behind the open review,
 * whether a message is on its way, the failure to retry, and the unsent question.
 */
export interface PrAskChatSession extends PrAskChat {
  /** The review's chat thread once its first message was sent. */
  threadId: string | undefined;
  /** The first message or a follow-up is being delivered. */
  starting: boolean;
  /** The agent is still answering, so a follow-up has to wait. */
  busy: boolean;
  error: PrAskChatFailure | undefined;
  /** The question typed but not yet sent; kept per review while the chat is closed. */
  draft: string;
  setDraft: (value: string) => void;
  retry: () => void;
  /** Opens the chat as an ordinary thread in the main app and leaves the overlay. */
  openAsThread: () => void;
}

export const PrAskSessionContext = createContext<PrAskChatSession | null>(null);

/** The session behind `usePrAskChat()`; `null` outside the overlay shell (isolated tab tests). */
export function usePrAskSession(): PrAskChatSession | null {
  return useContext(PrAskSessionContext);
}
