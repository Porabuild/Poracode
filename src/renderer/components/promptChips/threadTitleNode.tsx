import type { ReactNode } from "react";
import { InlinePromptPieces } from "./PromptChips";
import { hasChipPiece, inlinePiecesFromText } from "./promptInlinePieces";

/**
 * A thread title with its skill invocations shown as the chips the message
 * itself uses. A title is a plain string, so only the shapes a skill leaves in
 * text are recognised. Any other title is returned as the string itself, which
 * keeps it usable as an accessible name.
 */
export function threadTitleNode(title: string): ReactNode {
  // Chips need a `$skill` token or a leading `/command`; skip the parse otherwise.
  if (!title.includes("$") && !title.startsWith("/")) return title;
  const pieces = inlinePiecesFromText(title);
  return hasChipPiece(pieces) ? <InlinePromptPieces pieces={pieces} /> : title;
}
