import type { PromptSegment } from "@/shared/contracts";

const THREAD_MENTION_PREFIX = "[thread mention] ";

function threadMentionInstruction(mention: Extract<PromptSegment, { kind: "thread" }>): string {
  return `${THREAD_MENTION_PREFIX}The user referenced another Poracode thread (thread_id: ${JSON.stringify(mention.threadId)}). Read its conversation with the poracode MCP tool read_thread using this thread_id (get_thread returns metadata). Fetch additional pages only if needed.`;
}

/** True for the text segment `resolveThreadMentionSegments` made from a mention. */
export function isResolvedThreadMentionSegment(segment: PromptSegment): boolean {
  return segment.kind === "text" && segment.content.startsWith(THREAD_MENTION_PREFIX);
}

export function resolveThreadMentionSegments(segments: PromptSegment[]): PromptSegment[] {
  if (!segments.some((segment) => segment.kind === "thread")) return segments;
  return segments.map((segment) =>
    segment.kind === "thread"
      ? { kind: "text", content: threadMentionInstruction(segment) }
      : segment,
  );
}

/**
 * Handoff context for a thread that changed provider in place. The thread keeps
 * its id and its whole transcript across the switch, so the incoming provider
 * can read the prior conversation itself instead of being handed a summary that
 * cost a one-shot run against the provider being left behind — the one that is
 * often out of quota, which is why the user is switching at all.
 *
 * Delivered as `inlineInstructions`, so it reaches the agent without being
 * painted into the user's own message.
 */
export function buildProviderHandoffInstruction(threadId: string, fromAgentKind: string): string {
  return `[provider handoff] This thread was being handled by ${fromAgentKind} and has just been handed off to you. It is the same conversation and it keeps its full transcript (thread_id: ${JSON.stringify(threadId)}). Before answering, read the prior conversation with the poracode MCP tool read_thread using this thread_id, paging back with the returned nextCursor until you have the context you need. Treat that transcript as the prior turns of this conversation, then continue the user's task from where it left off.`;
}
