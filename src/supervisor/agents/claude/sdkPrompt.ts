import { readFile } from "node:fs/promises";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { PromptSegment } from "@/shared/contracts";
import { formatDiffCommentPrompt } from "@/shared/promptContent";
import { claudeSkillText, leadingSkillIndex } from "./skillPrompt";

function isImageAttachment(segment: PromptSegment): boolean {
  return (
    segment.kind === "attachment" &&
    (segment.mimeType?.startsWith("image/") === true ||
      /\.(png|jpe?g|gif|webp)$/i.test(segment.path))
  );
}

function isPdfAttachment(segment: PromptSegment): boolean {
  return (
    segment.kind === "attachment" &&
    (segment.mimeType === "application/pdf" || /\.pdf$/i.test(segment.path))
  );
}

function inferImageMime(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}

export async function buildSdkUserMessage(
  prompt: string,
  segments?: PromptSegment[],
  inlineInstructions?: string,
): Promise<SDKUserMessage> {
  if (!segments || segments.length === 0) {
    return {
      type: "user",
      session_id: "",
      parent_tool_use_id: null,
      message: {
        role: "user",
        content: inlineInstructions ? `${prompt}\n\n${inlineInstructions}` : prompt,
      },
    } as SDKUserMessage;
  }

  // The CLI runs a slash command only when it opens the last text block of the
  // message. With a leading skill, the text collects into one final block and
  // attachments go in front of it.
  const leadIndex = leadingSkillIndex(segments);
  const leadsWithSkill = leadIndex >= 0;
  const content: Array<Record<string, unknown>> = [];
  const textParts: string[] = [];
  const mentionsAfterCommand: string[] = [];
  const flushText = () => {
    if (textParts.length > 0) {
      content.push({ type: "text", text: textParts.join("") });
      textParts.length = 0;
    }
  };
  for (const [index, segment] of segments.entries()) {
    if (segment.kind === "text") {
      // Text before a leading skill is blank. Leading whitespace would stop
      // the CLI from reading the slash command.
      if (index < leadIndex) continue;
      textParts.push(segment.content);
      continue;
    }
    if (segment.kind === "diff_comment") {
      textParts.push(formatDiffCommentPrompt(segment));
      continue;
    }
    if (segment.kind === "attachment" && isImageAttachment(segment)) {
      if (!leadsWithSkill) flushText();
      const bytes = await readFile(segment.path);
      const mimeType = segment.mimeType ?? inferImageMime(segment.path);
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mimeType,
          data: bytes.toString("base64"),
        },
      });
      continue;
    }
    if (segment.kind === "attachment" && isPdfAttachment(segment)) {
      if (!leadsWithSkill) flushText();
      const bytes = await readFile(segment.path);
      content.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: bytes.toString("base64"),
        },
      });
      continue;
    }
    if (segment.kind === "skill") {
      // A skill is sent as text, never as an `@<SKILL.md path>` file mention.
      textParts.push(claudeSkillText(segment, index === leadIndex));
      continue;
    }
    if (segment.kind === "mcp") {
      // MCP mentions are a plain-text directive for the turn, not a file ref.
      textParts.push(`@${segment.name}`);
      continue;
    }
    if (!("path" in segment)) continue;
    // Attachments lead the segments, so their mentions would push a leading
    // slash command out of first place. Send them after the command instead.
    if (index < leadIndex) mentionsAfterCommand.push(`@${segment.path}`);
    else textParts.push(`@${segment.path}`);
  }
  if (mentionsAfterCommand.length > 0) textParts.push(`\n\n${mentionsAfterCommand.join(" ")}`);
  // Portable-skills fallback: sent in the provider payload only, never in the
  // painted user_message (see StartTurnOptions.inlineInstructions). It goes
  // before a leading slash command so the command stays in the last block.
  if (leadsWithSkill && inlineInstructions)
    content.push({ type: "text", text: inlineInstructions });
  flushText();
  if (content.length === 0 && prompt.length > 0) content.push({ type: "text", text: prompt });
  if (!leadsWithSkill && inlineInstructions)
    content.push({ type: "text", text: inlineInstructions });

  return {
    type: "user",
    session_id: "",
    parent_tool_use_id: null,
    message: { role: "user", content },
  } as unknown as SDKUserMessage;
}
