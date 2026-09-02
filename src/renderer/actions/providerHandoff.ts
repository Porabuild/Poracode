import type {
  ExtractContextResult,
  ProviderHandoffContextStrategy,
  PromptSegment,
  Thread,
} from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { flattenSegments } from "@/renderer/components/composer/serializeMentions";

interface HandoffLaunchInput {
  prompt: string;
  segments: PromptSegment[] | undefined;
}

/**
 * First prompt of a fork that reads its source thread instead of receiving a
 * context file: a thread mention of the source, then the user's own prompt.
 * The supervisor turns the mention into its standard `read_thread`
 * instruction, and the chat pane paints it as the usual thread chip, so the
 * fork uses the same tool and the same UI as any other cross-thread reference.
 */
export function buildForkMentionLaunchInput(input: {
  sourceThread: Pick<Thread, "id" | "title">;
  prompt: string;
  segments: PromptSegment[] | undefined;
}): HandoffLaunchInput {
  const { sourceThread, prompt, segments } = input;
  const promptSegments = segments ?? [{ kind: "text" as const, content: prompt }];
  const launchSegments: PromptSegment[] = [
    { kind: "thread", threadId: sourceThread.id, title: sourceThread.title },
    { kind: "text", content: " " },
    ...promptSegments,
  ];
  return { prompt: flattenSegments(launchSegments), segments: launchSegments };
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
 * incoming provider reads the thread's stored transcript instead — its own on
 * an in-place switch, the source thread's via a mention on a fork. Says only
 * what the user meant by continuing — mentioning "transferred context" here
 * would describe a summary that was deliberately never produced.
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
  const handoffPrompt = handoffContextInstruction(extractedContext);
  try {
    const filePath = await readBridge().saveHandoffContext({
      threadId,
      content: extractedContext.summary,
    });
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
    const inlineHeader = `${handoffInlineLabel(extractedContext)}\n\n${extractedContext.summary}\n\n`;
    return {
      prompt: `${inlineHeader}${prompt}`,
      segments: [{ kind: "text", content: inlineHeader }, ...promptSegments],
    };
  }
}

/**
 * The bracketed label that heads an inlined handoff — used when the context
 * file cannot be written, and by the mobile switch, which has no composer and
 * inlines the same payload. A verbatim chat history says so; a provider
 * summary keeps the original "context" wording.
 */
export function handoffInlineLabel(
  context: Pick<ExtractContextResult, "sourceProvider" | "contentKind">,
): string {
  return context.contentKind === "transcript"
    ? `[Chat history from previous ${context.sourceProvider} session]`
    : `[Context from previous ${context.sourceProvider} session]`;
}

/**
 * The sentence that introduces the attached context file. A verbatim chat
 * history is introduced as such, with an instruction to read it in full: it
 * is the prior turns, not a summary, and the provider must not skim it or
 * treat it as background notes. A provider-produced summary keeps the
 * original wording.
 */
function handoffContextInstruction(extractedContext: ExtractContextResult): string {
  const source = extractedContext.sourceProvider;
  return extractedContext.contentKind === "transcript"
    ? `This task was handed off from a ${source} session. The attached file is the chat history of this conversation so far. Read it in full before answering, treat it as the prior turns of this conversation, and continue the user's task from where it left off.`
    : `This task was handed off from a ${source} session. Use the attached context file as prior conversation context.`;
}
