import type { ReactNode } from "react";
import type { ChangelogHighlight } from "@/shared/changelogHighlights";
import type { NewsPlaylistEntry } from "./newsPlaylist";

/** Size of every news line icon; each source adds its own color. */
export const NEWS_ICON_CLASS = "size-3.5 shrink-0";

export interface NewsAction {
  label: string;
  onPress: () => void;
  /** Promotions and other calls to action render as an outlined button. */
  emphasis?: boolean;
  /** Leading icon inside the action (for example the GitHub star). */
  leadingIcon?: ReactNode;
  /** Opens an external site. */
  external?: boolean;
}

export interface NewsItem extends NewsPlaylistEntry {
  icon: ReactNode;
  content: ReactNode;
  action?: NewsAction;
  /** Present on changelog items: the action expands this point in place. */
  highlight?: ChangelogHighlight;
  /** Called once per visit when the item first becomes the visible one. */
  onShown?: () => void;
  /** The close button: hides this item (scope depends on the kind). */
  onDismiss: () => void;
}
