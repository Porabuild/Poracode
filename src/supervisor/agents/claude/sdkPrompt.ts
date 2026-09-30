import { readFile } from "node:fs/promises";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { PromptSegment } from "@/shared/contracts";
import { formatDiffCommentPrompt } from "@/shared/promptContent";
import { claudeSkillText, leadingSkill } from "./skillPrompt";

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

type SkillSegment = Extract<PromptSegment, { kind: "skill" }>;
type ContentBlock = Record<string, unknown>;

/** Image or PDF attachments become their own content block. */
async function mediaBlock(segment: PromptSegment): Promise<ContentBlock | undefined> {
  if (segment.kind !== "attachment") return undefined;
  if (isImageAttachment(segment)) {
    const bytes = await readFile(segment.path);
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: segment.mimeType ?? inferImageMime(segment.path),
        data: bytes.toString("base64"),
      },
    };
  }
  if (isPdfAttachment(segment)) {
    const bytes = await readFile(segment.path);
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") },
    };
  }
  return undefined;
}

function segmentText(segment: PromptSegment, lead: SkillSegment | undefined): string {
  switch (segment.kind) {
    case "text":
      return segment.content;
    case "diff_comment":
      return formatDiffCommentPrompt(segment);
    case "skill":
      // A skill is sent as text, never as an `@<SKILL.md path>` file mention.
      return claudeSkillText(segment, lead);
    case "mcp":
      // MCP mentions are a plain-text directive for the turn, not a file ref.
      return `@${segment.name}`;
    case "file":
    case "attachment":
      return `@${segment.path}`;
    case "thread":
      return "";
  }
}

/**
 * The CLI runs a slash command only when it opens the last text block of the
 * message. So attachments go in front as blocks, blank text before the command
 * is dropped, and mentions of attachments that came first go after it.
 */
async function slashCommandContent(
  segments: readonly PromptSegment[],
  lead: SkillSegment,
): Promise<ContentBlock[]> {
  const blocks: ContentBlock[] = [];
  const text: string[] = [];
  const mentions: string[] = [];
  let started = false;
  for (const segment of segments) {
    if (segment === lead) started = true;
    const block = await mediaBlock(segment);
    if (block) blocks.push(block);
    else if (started) text.push(segmentText(segment, lead));
    else if (segment.kind === "attachment") mentions.push(`@${segment.path}`);
  }
  if (mentions.length > 0) text.push(`\n\n${mentions.join(" ")}`);
  blocks.push({ type: "text", text: text.join("") });
  return blocks;
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

  // Inlined instructions carry the SKILL.md of a skill the CLI cannot find
  // itself. `/name` would fail with "Unknown command", so that skill stays a
  // request to the model.
  const lead = inlineInstructions ? undefined : leadingSkill(segments);
  const content: ContentBlock[] = [];
  if (lead) {
    content.push(...(await slashCommandContent(segments, lead)));
  } else {
    const textParts: string[] = [];
    const flushText = () => {
      if (textParts.length > 0) {
        content.push({ type: "text", text: textParts.join("") });
        textParts.length = 0;
      }
    };
    for (const segment of segments) {
      const block = await mediaBlock(segment);
      if (block) {
        flushText();
        content.push(block);
      } else {
        textParts.push(segmentText(segment, undefined));
      }
    }
    flushText();
  }
  if (content.length === 0 && prompt.length > 0) content.push({ type: "text", text: prompt });
  // Portable-skills fallback: appended to the provider payload only, never to
  // the painted user_message (see StartTurnOptions.inlineInstructions).
  if (inlineInstructions) content.push({ type: "text", text: inlineInstructions });

  return {
    type: "user",
    session_id: "",
    parent_tool_use_id: null,
    message: { role: "user", content },
  } as unknown as SDKUserMessage;
}
