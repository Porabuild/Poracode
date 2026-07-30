import { readFile } from "node:fs/promises";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { PromptSegment } from "@/shared/contracts";
import { formatDiffCommentPrompt } from "@/shared/promptContent";

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

  const content: Array<Record<string, unknown>> = [];
  const textParts: string[] = [];
  const flushText = () => {
    if (textParts.length > 0) {
      content.push({ type: "text", text: textParts.join("") });
      textParts.length = 0;
    }
  };
  for (const segment of segments) {
    if (segment.kind === "text") {
      textParts.push(segment.content);
      continue;
    }
    if (segment.kind === "diff_comment") {
      textParts.push(formatDiffCommentPrompt(segment));
      continue;
    }
    if (segment.kind === "attachment" && isImageAttachment(segment)) {
      flushText();
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
      flushText();
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
    textParts.push(`@${segment.path}`);
  }
  flushText();
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
