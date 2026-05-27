import type { PromptSegment } from "@/shared/contracts";
import type { PaneLayout } from "@/shared/paneLayout";
import type { Attachment } from "@/renderer/components/composer/useAttachments";

export interface DraftContent {
  segments: PromptSegment[];
  attachments: Attachment[];
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
