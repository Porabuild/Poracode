import {
  fileChangePayloadSchema,
  messageItemPayloadSchema,
  type ScheduleRunResult,
  type ScheduleRunStatus,
} from "@/shared/contracts";
import type { PersistedRuntimeItem } from "../db/runtimeItems";

export function collectScheduleRunItems(items: readonly PersistedRuntimeItem[]): {
  summary: string | null;
  changedFiles: string[];
} {
  const freshItems = items.filter((item) => item.parentItemId === undefined);
  const summary =
    freshItems
      .filter((item) => item.type === "assistant_message")
      .map(readAssistantText)
      .filter((text): text is string => text !== null)
      .at(-1) ?? null;
  const changedFiles = [
    ...new Set(
      freshItems.flatMap((item) => {
        if (item.type !== "file_change") return [];
        const parsed = fileChangePayloadSchema.safeParse(item.payload);
        return parsed.success && parsed.data.status !== "error" ? [parsed.data.path] : [];
      }),
    ),
  ].slice(0, 100);
  return { summary, changedFiles };
}

function readAssistantText(item: PersistedRuntimeItem): string | null {
  const streamText = item.streams.assistant_text?.trim();
  if (streamText) return streamText.slice(0, 2_000);
  const parsed = messageItemPayloadSchema.safeParse(item.payload);
  if (!parsed.success) return null;
  const text = parsed.data.content
    .filter((block) => block.kind === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  return text ? text.slice(0, 2_000) : null;
}

export function buildScheduleRunResult(input: {
  status: Exclude<ScheduleRunStatus, "running">;
  summary: string | null;
  changedFiles: string[];
  completedAt: string;
  stopReason: string | null;
  completionEvaluation?: NonNullable<ScheduleRunResult["completionEvaluation"]>;
}): ScheduleRunResult {
  if (input.status === "succeeded") {
    const outcome =
      input.changedFiles.length > 0 ? "changed-files" : input.summary ? "unknown" : "no-findings";
    const unread = outcome !== "no-findings";
    return {
      outcome,
      summary: input.summary,
      severity: "info",
      unread,
      archivedAt: unread ? null : input.completedAt,
      changedFiles: input.changedFiles,
      stopReason: input.stopReason,
      ...(input.completionEvaluation ? { completionEvaluation: input.completionEvaluation } : {}),
    };
  }
  if (input.status === "cancelled" || input.status === "skipped") {
    return {
      outcome: "no-findings",
      summary: input.summary,
      severity: "info",
      unread: false,
      archivedAt: input.completedAt,
      changedFiles: input.changedFiles,
      stopReason: input.stopReason,
    };
  }
  return {
    outcome: "needs-attention",
    summary: input.summary,
    severity:
      input.status === "interrupted" || input.status === "waiting-for-approval"
        ? "warning"
        : "error",
    unread: true,
    archivedAt: null,
    changedFiles: input.changedFiles,
    stopReason: input.stopReason,
  };
}
