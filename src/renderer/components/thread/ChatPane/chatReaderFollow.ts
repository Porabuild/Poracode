import { createContext } from "react";

/** Same-pane presentation intent; never pauses canonical intake or owns source text. */
export interface ChatReaderFollowSignal {
  isFollowing(): boolean;
  subscribe(listener: (following: boolean) => void): () => void;
  pause(): void;
  resume(): void;
}

/** Only confirmed reader/follow transitions notify the currently mounted bodies. */
export function createChatReaderFollowSignal(): ChatReaderFollowSignal {
  let following = true;
  const listeners = new Set<(following: boolean) => void>();
  const setFollowing = (next: boolean) => {
    if (following === next) return;
    following = next;
    for (const listener of listeners) listener(next);
  };
  return {
    isFollowing: () => following,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    pause: () => setFollowing(false),
    resume: () => setFollowing(true),
  };
}

/** Standalone bodies without a pane keep the existing latest-page behavior. */
export const ChatReaderFollowContext = createContext<ChatReaderFollowSignal | null>(null);
