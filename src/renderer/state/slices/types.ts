import type { PromptSegment } from "@/shared/contracts";
import type { PaneLayout } from "@/shared/paneLayout";
import type { Attachment } from "@/renderer/components/composer/useAttachments";

export interface DraftContent {
  segments: PromptSegment[];
  attachments: Attachment[];
}

/** Canonical "draft is worth keeping/showing" test — keep all save/indicator sites on this. */
export function isDraftContentNonEmpty(content: DraftContent): boolean {
  return content.segments.length > 0 || content.attachments.length > 0;
}

export interface PendingDraftWorktreeSelection {
  branch: string;
  baseBranch: string;
  isWorktree: true;
  worktreePath: string;
}

export interface SavedGroupLayout {
  panes: string[];
  paneLayout?: PaneLayout;
}
