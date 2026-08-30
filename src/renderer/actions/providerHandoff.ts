import type { ExtractContextResult, PromptSegment } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";

interface HandoffLaunchInput {
  prompt: string;
  segments: PromptSegment[] | undefined;
}

/**
 * Prompt used when the user hands off without typing one: tells the target
 * provider to pick up from the attached context. Shared by the desktop dialog
 * and the mobile switch so both handoffs read the same.
 */
export const DEFAULT_HANDOFF_PROMPT =
  "Continue from the transferred context and pick up where the previous provider left off.";

/**
 * Fold an extracted context summary into the prompt the target provider will
 * receive. The summary is written to the thread's own directory and attached as
 * a file so a long transcript does not bloat the prompt itself; if that write
 * fails the summary is inlined instead, because arriving with no context at all
 * defeats the handoff.
 *
 * `threadId` is the thread the NEW session runs under — the same thread for an
 * in-place switch, the newly created one for a fork.
 */
export async function buildHandoffLaunchInput(input: {
  threadId: string;
  prompt: string;
  segments: PromptSegment[] | undefined;
  extractedContext: ExtractContextResult | null;
}): Promise<HandoffLaunchInput> {
  const { threadId, prompt, segments, extractedContext } = input;
  if (!extractedContext) return { prompt, segments };

  const promptSegments = segments ?? [{ kind: "text" as const, content: prompt }];
  try {
    const filePath = await readBridge().saveHandoffContext({
      threadId,
      content: extractedContext.summary,
    });
    const handoffPrompt = `This task was handed off from a ${extractedContext.sourceProvider} session. Use the attached context file as prior conversation context.`;
    return {
      prompt: `${handoffPrompt}\n\n${prompt}`,
      segments: [
        { kind: "text", content: `${handoffPrompt}\n\n` },
        { kind: "attachment", path: filePath, mimeType: "text/markdown" },
        { kind: "text", content: "\n\n" },
        ...promptSegments,
      ],
    };
  } catch {
    const inlineHeader = `[Context from previous ${extractedContext.sourceProvider} session]\n\n${extractedContext.summary}\n\n`;
    return {
      prompt: `${inlineHeader}${prompt}`,
      segments: [{ kind: "text", content: inlineHeader }, ...promptSegments],
    };
  }
}
