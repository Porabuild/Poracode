/**
 * Draft line notes on a proposed plan and the single follow-up message that
 * submits them. Notes are local drafts anchored to the 1-based source lines of
 * the exact plan text the user reviewed; nothing here persists or re-anchors.
 * The submitted message quotes the reviewed lines, so the transcript keeps the
 * feedback attached to that snapshot even after the plan is revised.
 */

export type PlanLineRange = { startLine: number; endLine: number };

export type PlanLineNote = PlanLineRange & { id: string; text: string };

/** Longest quoted range; the rest of a long range is summarized, not dropped silently. */
const MAX_QUOTED_LINES = 8;

export function splitPlanLines(plan: string): string[] {
  return plan.replace(/\r\n?/g, "\n").split("\n");
}

export function normalizePlanRange(a: number, b: number): PlanLineRange {
  return { startLine: Math.min(a, b), endLine: Math.max(a, b) };
}

/** Plan order; the review list and the submitted message share it. */
export function sortPlanNotes(notes: readonly PlanLineNote[]): PlanLineNote[] {
  return [...notes].sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);
}

export function formatPlanFeedbackMessage(
  plan: string,
  notes: readonly PlanLineNote[],
  overall = "",
): string {
  const lines = splitPlanLines(plan);
  const sections = sortPlanNotes(notes).map((note) => {
    const label =
      note.startLine === note.endLine
        ? `Line ${note.startLine}`
        : `Lines ${note.startLine}-${note.endLine}`;
    const quoted = lines.slice(note.startLine - 1, note.endLine);
    const shown = quoted.slice(0, MAX_QUOTED_LINES);
    const hidden = quoted.length - shown.length;
    if (hidden > 0) shown.push(`… (${hidden} more lines)`);
    // A fenced block keeps the plan's own Markdown (lists, headings) verbatim
    // in the transcript instead of rendering it as part of the message.
    const body = shown.join("\n");
    const longestTicks = Math.max(0, ...(body.match(/`+/g) ?? []).map((m) => m.length));
    const fence = "`".repeat(Math.max(3, longestTicks + 1));
    return `${label}:\n${fence}\n${body}\n${fence}\nFeedback: ${note.text.trim()}`;
  });
  const general = overall.trim();
  return [
    sections.length > 0
      ? "Please revise the plan you proposed. My line feedback is anchored to line numbers of that exact plan text, quoted below."
      : "Please revise the plan you proposed.",
    ...(general ? [`Overall feedback:\n${general}`] : []),
    ...sections,
    "Respond with a complete revised plan.",
  ].join("\n\n");
}
