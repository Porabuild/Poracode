import type {
  ExtractContextResult,
  ProviderHandoffContextStrategy,
  PromptSegment,
} from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";

interface HandoffLaunchInput {
  prompt: string;
  segments: PromptSegment[] | undefined;
}

/**
 * The context a handoff carries, resolved by the dialog and consumed by the
 * launch actions. Keeping the strategy alongside the payload is what lets the
 * launch tell "no summary because the new provider reads the transcript" apart
 * from "no summary because there was nothing to extract" — the two want
 * different prompts, and only the first may claim the transcript route on the
 * wire. See `resolveProviderHandoffStrategy` for which one applies.
 */
export type ProviderHandoffContext =
  | { strategy: "thread-transcript" }
  | { strategy: "context-file"; extracted: ExtractContextResult | null };

/**
 * Prompt used when the user hands off without typing one: tells the target
 * provider to pick up from the attached context. Shared by the desktop dialog
 * and the mobile switch so both handoffs read the same.
 */
export const DEFAULT_HANDOFF_PROMPT =
  "Continue from the transferred context and pick up where the previous provider left off.";

/**
 * Default prompt for a handoff that transfers no context file because the
 * incoming provider reads this thread's own transcript instead. Says only what
 * the user meant by switching — mentioning "transferred context" here would
 * describe a summary that was deliberately never produced.
 */
export const DEFAULT_THREAD_READ_HANDOFF_PROMPT = "Continue where the previous provider left off.";

/** The prompt a handoff sends when the user typed none, per context strategy. */
export function defaultHandoffPrompt(strategy: ProviderHandoffContextStrategy): string {
  return strategy === "thread-transcript"
    ? DEFAULT_THREAD_READ_HANDOFF_PROMPT
    : DEFAULT_HANDOFF_PROMPT;
}

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
