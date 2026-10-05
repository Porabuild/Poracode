import type { CanonicalContentBlock } from "@/shared/contracts";
import {
  fileNameFromPath,
  formatDiffCommentPrompt,
  threadMentionLabel,
} from "@/shared/promptContent";
import { stripSelectorPayloads } from "./SelectorBadge";

/**
 * Flattens a user message's content into the text the user sent, with skills,
 * MCP servers, thread mentions and mentioned files as their inline tokens.
 * Attachments contribute nothing.
 */
export function buildUserPromptText(content: CanonicalContentBlock[]): string {
  return content
    .map((block) => {
      if (block.kind === "text") return block.text;
      if (block.kind === "skill")
        return block.pluginName ? `@${block.pluginName}` : block.invocation;
      if (block.kind === "diff_comment") return formatDiffCommentPrompt(block);
      if (block.kind === "mcp") return `@${block.name}`;
      if (block.kind === "thread") return `@${threadMentionLabel(block)}`;
      if (block.kind === "file" && block.source !== "attachment") return block.path;
      return "";
    })
    .join("");
}

/**
 * One-line summary of a user message for compact display. Browser selector
 * payloads are dropped and whitespace runs collapse to single spaces. A message
 * without text falls back to its first attachment's name; null when neither
 * exists.
 */
export function buildUserPromptPreview(content: CanonicalContentBlock[]): string | null {
  const text = stripSelectorPayloads(buildUserPromptText(content)).replace(/\s+/g, " ").trim();
  if (text.length > 0) return text;
  for (const block of content) {
    if (block.kind !== "image" && block.kind !== "file") continue;
    if (block.source !== "attachment") continue;
    const name = block.name ?? (block.path ? fileNameFromPath(block.path) : "");
    if (name.length > 0) return name;
  }
  return null;
}
