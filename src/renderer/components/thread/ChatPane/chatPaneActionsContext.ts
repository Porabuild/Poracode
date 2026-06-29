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
  registerVirtualScrollToBottom?: (handler: (() => void) | null) => void;
  projectLocation: ProjectLocation;
  /**
   * Top-level entry names for the chat's project, used to validate path-like
   * tokens before chipping them. Empty until the project tree responds.
   */
  projectRootNames: ReadonlySet<string>;
};

export const ChatPaneActionsContext = createContext<ChatPaneActions | null>(null);

export function useChatPaneActions(): ChatPaneActions | null {
  return useContext(ChatPaneActionsContext);
}
