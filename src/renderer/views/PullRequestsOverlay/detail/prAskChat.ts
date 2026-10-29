import { createContext, useContext } from "react";

/**
 * The side chat beside the detail pane. The overlay shell owns its lifetime
 * (the panel and its project thread); the tabs only open it and send prompts.
 */
export interface PrAskChat {
  open: boolean;
  setOpen: (open: boolean) => void;
  /**
   * Opens the chat and sends `prompt` as the next message. `context` is quoted
   * material (a diff hunk, a comment) the agent should treat as data.
   */
  ask: (prompt: string, context?: string) => void;
  /**
   * `ask` that reports the outcome: resolves `true` once the message was taken
   * over (delivered, or kept for an explicit Retry after a failed first launch)
   * and `false` when it was refused or could not be sent, with the reason shown
   * to the user. A caller that owns the text (the composer) keeps it on `false`.
   */
  send: (prompt: string, context?: string) => Promise<boolean>;
  /** False when the host cannot start a chat thread for this review. */
  available: boolean;
}

export const PrAskChatContext = createContext<PrAskChat | null>(null);

export function usePrAskChat(): PrAskChat {
  const chat = useContext(PrAskChatContext);
  if (!chat) throw new Error("usePrAskChat must be used inside the pull-request overlay");
  return chat;
}
