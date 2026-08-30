import type { PromptSegment } from "@/shared/contracts";

function threadMentionInstruction(mention: Extract<PromptSegment, { kind: "thread" }>): string {
  return `[thread mention] The user referenced another Poracode thread (thread_id: ${JSON.stringify(mention.threadId)}). Read its conversation with the poracode MCP tool read_thread using this thread_id (get_thread returns metadata). Fetch additional pages only if needed.`;
}

export function resolveThreadMentionSegments(segments: PromptSegment[]): PromptSegment[] {
  if (!segments.some((segment) => segment.kind === "thread")) return segments;
  return segments.map((segment) =>
    segment.kind === "thread"
      ? { kind: "text", content: threadMentionInstruction(segment) }
      : segment,
  );
}
