import { createContext, useContext } from "react";
import type { ProjectLocation } from "@/shared/contracts";

export type ChatPaneActions = {
  openProjectRelativePath: (path: string, lineNumber?: number) => void;
  /** Open the in-app file editor overlay and expand the project tree to the folder. */
  revealProjectFolderInTree: (path: string) => void;
  /** Reveal a file or folder in the OS file explorer (Finder/Explorer/Nautilus). */
  showProjectEntryInExplorer?: ((path: string) => void) | undefined;
  onContentHeightChange: () => void;
  isStickToBottom?: () => boolean;
  /** True while the user is mid wheel / scrollbar / pointer scroll-away. */
  hasRecentUserScrollIntent?: () => boolean;
  /** Mark the next scroll event matching this scrollTop as our own write. */
  noteProgrammaticScroll?: ((scrollTop: number) => void) | undefined;
  /**
   * True while the thread-open measurement storm is still settling. Shared
   * epoch owned by the scroll controls — rows remount constantly under
   * virtualization, so per-row mount clocks must not stand in for this.
   */
  isThreadOpenSettling?: () => boolean;
  registerVirtualScrollToBottom?: (handler: (() => void) | null) => void;
  projectLocation: ProjectLocation;
  /**
   * Top-level entry names for the chat's project, used to validate path-like
   * tokens before chipping them. Empty until the project tree responds.
   * Omitted for remote chats where the desktop client has no local tree cache.
   */
  projectRootNames?: ReadonlySet<string> | undefined;
  /**
   * Extra filesystem roots for relative markdown images (e.g. Grok session
   * dir so `images/1.jpg` from image_gen resolves under ~/.grok/sessions/…).
   */
  markdownImageRoots?: readonly string[] | undefined;
};

export const ChatPaneActionsContext = createContext<ChatPaneActions | null>(null);

export function useChatPaneActions(): ChatPaneActions | null {
  return useContext(ChatPaneActionsContext);
}
