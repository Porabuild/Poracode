import { create } from "zustand";
import type { AgentSlashCommand, CanonicalContentBlock } from "@/shared/contracts";
import {
  fileNameFromPath,
  isImagePath,
  mimeForPath,
  skillSegmentFromSlashCommand,
} from "@/shared/promptContent";
import type { DraftContent } from "@/renderer/state/slices/types";

// Keep a reverted prompt until its thread editor is mounted and ready.
export const useRevertedPromptStore = create<{
  byThread: Record<string, CanonicalContentBlock[]>;
  restore(threadId: string, content: CanonicalContentBlock[]): void;
  consume(threadId: string): void;
}>((set) => ({
  byThread: {},
  restore: (threadId, content) =>
    set((state) => ({
      byThread: { ...state.byThread, [threadId]: content },
    })),
  consume: (threadId) =>
    set((state) => {
      const { [threadId]: _consumed, ...byThread } = state.byThread;
      return { byThread };
    }),
}));

export function revertedPromptToDraft(
  content: readonly CanonicalContentBlock[],
  commands: readonly AgentSlashCommand[],
): DraftContent {
  const draft: DraftContent = { segments: [], attachments: [] };
  for (const block of content) {
    switch (block.kind) {
      case "text":
        if (block.text) draft.segments.push({ kind: "text", content: block.text });
        break;
      case "thread":
      case "diff_comment":
        draft.segments.push({ ...block });
        break;
      case "mcp":
        draft.segments.push({ kind: "mcp", id: block.name, name: block.name });
        break;
      case "skill": {
        const command = commands.find(
          (candidate) =>
            candidate.skillName === block.name && candidate.pluginId === block.pluginId,
        );
        // Quote unavailable skills so submit cannot bind another plugin's /name.
        draft.segments.push(
          skillSegmentFromSlashCommand(command) ?? {
            kind: "text",
            content: `\`${block.invocation}\``,
          },
        );
        break;
      }
      case "file":
      case "image": {
        if (!block.path) break;
        if (
          block.source === "mention" ||
          (block.kind === "file" && block.source !== "attachment")
        ) {
          draft.segments.push({ kind: "file", path: block.path });
        } else {
          const name = block.name ?? fileNameFromPath(block.path);
          const mimeType = block.mimeType ?? mimeForPath(block.path);
          draft.attachments.push({
            id: crypto.randomUUID(),
            path: block.path,
            name,
            isImage: isImagePath(block.path, mimeType),
            ...(mimeType ? { mimeType } : {}),
          });
        }
        break;
      }
    }
  }
  return draft;
}
