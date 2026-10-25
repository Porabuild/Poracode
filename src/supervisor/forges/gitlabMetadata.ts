import type {
  PrAuthor,
  PrLabel,
  PrReaction,
  PrReviewer,
  PrTimelineEvent,
} from "@/shared/contracts";
import { labelFrom, lifecycleEvents, num, object, str, type ApiObject } from "./types";

// GitLab payload mapping for review metadata: labels, reviewers, award emoji,
// resource events, and the unified diff text built from GitLab's JSON file diffs.

export function gitlabAuthor(raw: unknown): PrAuthor {
  const r = object(raw);
  return {
    login: str(r.username) || str(r.name),
    ...(str(r.avatar_url) ? { avatarUrl: str(r.avatar_url) } : {}),
  };
}

/** Labels arrive as names, or as `{name, color, description}` with `with_labels_details`. */
export function gitlabLabel(raw: unknown): PrLabel | undefined {
  if (typeof raw === "string") return raw ? { name: raw } : undefined;
  return labelFrom(raw);
}
export function gitlabLabels(value: unknown): PrLabel[] {
  return Array.isArray(value)
    ? value.map(gitlabLabel).filter((label): label is PrLabel => Boolean(label))
    : [];
}

/** `id` is the numeric user id that `reviewer_ids` takes. */
export function gitlabReviewer(raw: unknown): PrReviewer | undefined {
  const r = object(raw);
  if (!num(r.id) || !str(r.username)) return undefined;
  return {
    id: String(r.id),
    login: str(r.username),
    ...(str(r.name) ? { name: str(r.name) } : {}),
    ...(str(r.avatar_url) ? { avatarUrl: str(r.avatar_url) } : {}),
  };
}
export function gitlabReviewers(value: unknown): PrReviewer[] {
  return Array.isArray(value)
    ? value.map(gitlabReviewer).filter((reviewer): reviewer is PrReviewer => Boolean(reviewer))
    : [];
}

/** Shared reaction names to GitLab award emoji names. */
export const GITLAB_AWARDS = new Map([
  ["+1", "thumbsup"],
  ["-1", "thumbsdown"],
  ["laugh", "laughing"],
  ["hooray", "tada"],
  ["confused", "confused"],
  ["heart", "heart"],
  ["rocket", "rocket"],
  ["eyes", "eyes"],
]);

export function gitlabReactions(awards: ApiObject[], viewer: string | undefined): PrReaction[] {
  const result: PrReaction[] = [];
  for (const [content, name] of GITLAB_AWARDS) {
    const matching = awards.filter((award) => str(award.name) === name);
    if (!matching.length) continue;
    result.push({
      content,
      count: matching.length,
      viewerReacted: Boolean(viewer) && matching.some((a) => gitlabAuthor(a.user).login === viewer),
    });
  }
  return result;
}

const STATE_KINDS = new Set(["closed", "reopened", "merged"]);
// System notes that repeat commits, approvals, or state events already reported elsewhere.
const DUPLICATE_NOTES = [
  /^added \d+ (?:new )?commits?\b/i,
  /^changed this line in /i,
  /^(?:approved|unapproved) this merge request$/i,
  /^(?:closed|reopened|merged)$/i,
];
const DRAFT_NOTE = /^marked (?:this merge request )?as (?:a )?\*\*(?:draft|work in progress)\*\*$/i;
const READY_NOTE =
  /^(?:marked this merge request as \*\*ready\*\*|unmarked as a \*\*work in progress\*\*)$/i;

export function gitlabTimeline(input: {
  createdAt: string;
  author: PrAuthor;
  mergedAt: string | null;
  mergedBy: PrAuthor | null;
  closedAt: string | null;
  stateEvents: ApiObject[];
  labelEvents: ApiObject[];
  notes: ApiObject[];
}): PrTimelineEvent[] {
  const events: PrTimelineEvent[] = [];
  const actor = (raw: unknown) => {
    const user = gitlabAuthor(raw);
    return user.login ? { actor: user } : {};
  };
  for (const e of input.stateEvents) {
    if (!STATE_KINDS.has(str(e.state))) continue;
    events.push({
      id: `state:${String(e.id)}`,
      kind: str(e.state),
      createdAt: str(e.created_at),
      ...actor(e.user),
    });
  }
  for (const e of input.labelEvents) {
    const label = gitlabLabel(e.label);
    const action = str(e.action);
    if (!label || (action !== "add" && action !== "remove")) continue;
    events.push({
      id: `label:${String(e.id)}`,
      kind: action === "add" ? "labeled" : "unlabeled",
      createdAt: str(e.created_at),
      ...actor(e.user),
      label,
    });
  }
  for (const note of input.notes) {
    const text = str(note.body).trim();
    if (note.system !== true || !text || DUPLICATE_NOTES.some((pattern) => pattern.test(text)))
      continue;
    const kind = DRAFT_NOTE.test(text) ? "draft" : READY_NOTE.test(text) ? "ready" : "system";
    events.push({
      id: `note:${String(note.id)}`,
      kind,
      createdAt: str(note.created_at),
      ...actor(note.author),
      ...(kind === "system" ? { text } : {}),
    });
  }
  // GitLab has no "opened" event; merged/closed come from timestamps only when the
  // state-event feed predates them.
  const derived = lifecycleEvents(input).filter(
    (e) => e.kind === "opened" || !events.some((event) => event.kind === e.kind),
  );
  const time = (e: PrTimelineEvent) => Date.parse(e.createdAt) || 0;
  return [...derived, ...events].sort((a, b) => time(a) - time(b));
}

/**
 * GitLab's diff position for a line on one side. A context line needs both line
 * numbers; a line outside every hunk is offset by the hunks before it. Without
 * hunks (a collapsed diff) only the commented side is known.
 */
export function gitlabLinePosition(
  diff: string,
  side: "LEFT" | "RIGHT",
  line: number,
): { old_line?: number; new_line?: number } {
  let oldLine = 0,
    newLine = 0,
    inHunk = false;
  for (const text of diff.split("\n")) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (hunk) {
      if (line < Number(side === "RIGHT" ? hunk[2] : hunk[1])) break;
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (text.startsWith("+")) {
      if (side === "RIGHT" && newLine === line) return { new_line: line };
      newLine++;
    } else if (text.startsWith("-")) {
      if (side === "LEFT" && oldLine === line) return { old_line: line };
      oldLine++;
    } else if (text.startsWith(" ")) {
      if ((side === "RIGHT" ? newLine : oldLine) === line)
        return { old_line: oldLine, new_line: newLine };
      oldLine++;
      newLine++;
    }
  }
  // Lines before the first hunk are unchanged, so the offset starts at zero.
  const other = side === "RIGHT" ? line - (newLine - oldLine) : line + (newLine - oldLine);
  if (!diff.trim() || other < 1) return side === "RIGHT" ? { new_line: line } : { old_line: line };
  return side === "RIGHT"
    ? { old_line: other, new_line: line }
    : { old_line: line, new_line: other };
}

/** Git's C quoting for paths with quotes, backslashes, control or non-ASCII characters. */
function gitPath(path: string): string {
  const plain = /^[ -~]*$/.test(path) && !path.includes('"') && !path.includes("\\");
  if (plain) return path;
  const escapes: Record<number, string> = { 9: "\\t", 10: "\\n", 13: "\\r", 34: '\\"', 92: "\\\\" };
  let result = "";
  for (const byte of new TextEncoder().encode(path))
    result +=
      escapes[byte] ??
      (byte < 0x20 || byte >= 0x7f
        ? `\\${byte.toString(8).padStart(3, "0")}`
        : String.fromCharCode(byte));
  return `"${result}"`;
}
/** `---`/`+++` header path; Git appends a tab when an unquoted path contains a space. */
function headerPath(path: string): string {
  const value = gitPath(path);
  return !value.startsWith('"') && value.includes(" ") ? `${value}\t` : value;
}

/** Git-format patch text from GitLab's per-file JSON diffs (hunks without headers). */
export function gitlabUnifiedDiff(files: ApiObject[]): string {
  return files
    .map((file) => {
      const oldPath = str(file.old_path) || str(file.new_path);
      const newPath = str(file.new_path) || oldPath;
      const added = file.new_file === true,
        deleted = file.deleted_file === true;
      const aMode = str(file.a_mode),
        bMode = str(file.b_mode);
      const lines = [`diff --git ${gitPath(`a/${oldPath}`)} ${gitPath(`b/${newPath}`)}`];
      if (added) lines.push(`new file mode ${bMode || "100644"}`);
      else if (deleted) lines.push(`deleted file mode ${aMode || "100644"}`);
      else if (aMode && bMode && aMode !== bMode)
        lines.push(`old mode ${aMode}`, `new mode ${bMode}`);
      if (file.renamed_file === true)
        lines.push(`rename from ${gitPath(oldPath)}`, `rename to ${gitPath(newPath)}`);
      const body = str(file.diff);
      if (body && !body.startsWith("Binary files "))
        lines.push(
          `--- ${added ? "/dev/null" : headerPath(`a/${oldPath}`)}`,
          `+++ ${deleted ? "/dev/null" : headerPath(`b/${newPath}`)}`,
        );
      const text = `${lines.join("\n")}\n${body}`;
      return text.endsWith("\n") ? text : `${text}\n`;
    })
    .join("");
}
