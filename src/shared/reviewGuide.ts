import type { ForgeReviewGuideContent } from "./contracts/forge";
import { splitUnifiedDiff } from "./reviewDiff";

type GuideExcerpt = ForgeReviewGuideContent["stops"][number]["excerpts"][number];

/** Only return lines that actually occur on this side of this file's current diff. */
export function reviewGuideExcerpt(
  diff: string | ReadonlyMap<string, string>,
  excerpt: GuideExcerpt,
): string | undefined {
  if (excerpt.endLine < excerpt.startLine || excerpt.endLine - excerpt.startLine >= 200) return;
  const patch = (typeof diff === "string" ? splitUnifiedDiff(diff) : diff).get(excerpt.path);
  if (patch === undefined) return;
  const lines = new Map<number, string>();
  let left = 0;
  let right = 0;
  let inHunk = false;
  for (const line of patch.split("\n")) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      left = Number(hunk[1]);
      right = Number(hunk[2]);
      inHunk = true;
      continue;
    }
    if (!inHunk || ![" ", "+", "-"].includes(line[0] ?? "")) continue;
    if (excerpt.side === "LEFT" && line[0] !== "+") lines.set(left, line.slice(1));
    if (excerpt.side === "RIGHT" && line[0] !== "-") lines.set(right, line.slice(1));
    if (line[0] !== "+") left++;
    if (line[0] !== "-") right++;
  }
  const selected: string[] = [];
  for (let line = excerpt.startLine; line <= excerpt.endLine; line++) {
    const text = lines.get(line);
    if (text === undefined) return;
    selected.push(text);
  }
  return selected.join("\n");
}
