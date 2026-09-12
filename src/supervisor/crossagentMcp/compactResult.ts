import { z } from "zod";

export const MAX_COMPACT_RESULT_CHARS = 16_000;
const MAX_ITEMS = 64;
const nonemptyText = z
  .string()
  .max(2_000)
  .refine((value) => value.trim().length > 0);

// Version 1 is a new worker-to-supervisor contract. Legacy prose is not a success result.
const compactResultSchema = z.strictObject({
  version: z.literal(1),
  outcome: z.enum(["completed", "blocked"]),
  summary: z
    .string()
    .max(4_000)
    .refine((value) => value.trim().length > 0),
  changes: z.array(nonemptyText).max(MAX_ITEMS),
  checks: z
    .array(
      z.strictObject({
        command: nonemptyText,
        result: z.enum(["passed", "failed", "not_run"]),
        details: nonemptyText.optional(),
      }),
    )
    .max(MAX_ITEMS),
  findings: z
    .array(
      z.strictObject({
        severity: z.enum(["important", "nit"]),
        message: nonemptyText,
        reference: nonemptyText.optional(),
      }),
    )
    .max(MAX_ITEMS),
  risks: z.array(nonemptyText).max(MAX_ITEMS),
  evidence: z.array(nonemptyText).max(MAX_ITEMS),
});

export type CompactResult = z.infer<typeof compactResultSchema>;

export function compactResultPrompt(prompt: string): string {
  return `${prompt}

Author your own compact result from the work you actually performed; the parent will not summarize it with another model. End your final message with exactly one fenced crossagents-result JSON object and no text after the closing fence:
\`\`\`crossagents-result
{"version":1,"outcome":"completed","summary":"What was accomplished or blocked","changes":[],"checks":[{"command":"actual command or check","result":"passed","details":"optional evidence"}],"findings":[{"severity":"nit","message":"actual finding","reference":"optional file:line or URL"}],"risks":[],"evidence":[]}
\`\`\`
Use outcome completed or blocked; check result passed, failed, or not_run; finding severity important or nit. The example entries are placeholders: replace them with real results, or use empty arrays. All eight top-level fields are required; add no other fields. Only check details and finding reference are optional. Never claim a check passed unless it ran successfully. A listed not_run check blocks automatic continuation; omit checks that do not apply.
Aim for at most 500 words, but retain every critical finding and its reference even when that exceeds the word target. Keep full evidence in files or the transcript and include precise references in evidence. Never silently omit important findings, failed checks, risks, or references to fit. The complete fenced envelope must fit ${MAX_COMPACT_RESULT_CHARS} characters; each array permits at most ${MAX_ITEMS} entries, summary at most 4000 characters, and each other string at most 2000 nonblank characters. Invalid or oversized results fail explicitly; they are never treated as success.`;
}

/** JSON.parse overwrites duplicate keys, which could otherwise erase failed checks or findings. */
function hasDuplicateKeys(json: string): boolean {
  const objects: Array<Set<string> | null> = [];
  for (const token of json.matchAll(/"(?:[^"\\]|\\.)*"|[{}[\]]/g)) {
    const value = token[0];
    if (value === "{") objects.push(new Set());
    else if (value === "[") objects.push(null);
    else if (value === "}" || value === "]") objects.pop();
    else {
      let next = token.index + value.length;
      while (/\s/.test(json[next] ?? "") && next < json.length) next++;
      if (json[next] !== ":") continue;
      const keys = objects.at(-1);
      const key = JSON.parse(value) as string;
      if (keys?.has(key)) return true;
      keys?.add(key);
    }
  }
  return false;
}

export function parseCompactResult(output: string): { result: CompactResult } | { error: string } {
  // Only inspect a bounded tail; an earlier sample or partial result must never win.
  const offset = Math.max(0, output.length - MAX_COMPACT_RESULT_CHARS - 1);
  const tail = output.slice(offset);
  const openings = [...tail.matchAll(/^```crossagents-result[ \t]*\r?\n/gm)];
  const opening = openings.at(-1);
  if (!opening || (opening.index === 0 && offset > 0 && output[offset - 1] !== "\n")) {
    return {
      error: `Missing final crossagents-result envelope or envelope exceeds ${MAX_COMPACT_RESULT_CHARS} characters.`,
    };
  }
  const envelope = tail.slice(opening.index);
  if (envelope.length > MAX_COMPACT_RESULT_CHARS) {
    return { error: `Compact result envelope exceeds ${MAX_COMPACT_RESULT_CHARS} characters.` };
  }
  const match = /^```crossagents-result[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*(?:\r?\n[ \t]*)*$/.exec(
    envelope,
  );
  if (!match)
    return { error: "Malformed final crossagents-result envelope; it must end the output." };
  const json = match[1]!;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return { error: "Malformed compact result JSON." };
  }
  if (hasDuplicateKeys(json))
    return { error: "Compact result JSON contains duplicate object keys." };
  const parsed = compactResultSchema.safeParse(value);
  if (!parsed.success) {
    return {
      error: `Invalid compact result: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "result"}: ${issue.message}`).join("; ")}`,
    };
  }
  return { result: parsed.data };
}

export function compactResultCanContinue(result: CompactResult): boolean {
  // The contract cannot prove a listed unrun check is optional, so keep it for parent review.
  return (
    result.outcome === "completed" &&
    !result.findings.some((finding) => finding.severity === "important") &&
    result.checks.every((check) => check.result === "passed")
  );
}
