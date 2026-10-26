import type { CanonicalContentBlock } from "@/shared/contracts";
import { formatDiffCommentPrompt } from "@/shared/promptContent";
import {
  buildUserPromptText,
  collapsePromptText,
} from "@/renderer/components/thread/ChatPane/parts/items/userPromptText";

/** What one chip in a prompt stands for; the chip's icon and label derive from it. */
export type PromptChipSpec =
  | { kind: "command"; command: string; skillName?: string }
  | { kind: "skill"; name: string; pluginId?: string; pluginName?: string }
  | { kind: "diff_comment"; block: Extract<CanonicalContentBlock, { kind: "diff_comment" }> }
  | { kind: "mcp"; name: string }
  | { kind: "thread"; threadId: string; title: string }
  | { kind: "file"; path: string };

export type PromptInlinePiece =
  | { kind: "text"; key: string; text: string }
  | { kind: "chip"; key: string; chip: PromptChipSpec };

const LEADING_SLASH_COMMAND_RE = /^\/([A-Za-z][A-Za-z0-9_.:-]*)(\s+|$)/;
const ACP_SKILL_PREFIX_RE = /^skill:/iu;
// A `$skill` invocation. Lowercase-first keeps `$PATH` and `$5` as plain text.
const DOLLAR_SKILL_RE = /(?<![\w$])\$([a-z][a-z0-9_.:-]*)/gu;
const TRAILING_NAME_PUNCTUATION_RE = /[.:-]+$/u;

export function extractLeadingSlashCommand(text: string): {
  slashCommand: string | null;
  body: string;
} {
  const match = text.match(LEADING_SLASH_COMMAND_RE);
  if (!match) return { slashCommand: null, body: text };
  return { slashCommand: match[1]!, body: text.slice(match[0].length) };
}

/** The skill named by an ACP `/skill:<name>` command, when it is one. */
function parseAcpSkillCommand(slashCommand: string | null): string | undefined {
  if (!slashCommand || !ACP_SKILL_PREFIX_RE.test(slashCommand)) return undefined;
  const name = slashCommand.slice(slashCommand.indexOf(":") + 1);
  return name.length > 0 ? name : undefined;
}

function commandChip(slashCommand: string): PromptChipSpec {
  const skillName = parseAcpSkillCommand(slashCommand);
  return skillName
    ? { kind: "command", command: skillName, skillName }
    : { kind: "command", command: slashCommand };
}

function isInlineBlock(block: CanonicalContentBlock): boolean {
  return (
    block.kind === "skill" ||
    block.kind === "diff_comment" ||
    block.kind === "mcp" ||
    block.kind === "thread" ||
    (block.kind === "file" && block.source !== "attachment")
  );
}

function firstInlineContentBlock(
  content: CanonicalContentBlock[],
): CanonicalContentBlock | undefined {
  return content.find((block) =>
    block.kind === "text" ? block.text.length > 0 : isInlineBlock(block),
  );
}

/**
 * Splits a user message into text and chips: skills, diff comments, MCP servers,
 * thread mentions and mentioned files become chips, as does a leading
 * `/command` typed as plain text. Attachments contribute nothing. A leading
 * command whose token came from a skill block stays that skill's chip.
 */
export function inlinePiecesFromContent(content: CanonicalContentBlock[]): PromptInlinePiece[] {
  const pieces: PromptInlinePiece[] = [];
  const rawText = buildUserPromptText(content);
  const { slashCommand, body } = extractLeadingSlashCommand(rawText);
  const leadingSlashFromSkill = firstInlineContentBlock(content)?.kind === "skill";
  let remainingSkip = 0;
  if (slashCommand && !leadingSlashFromSkill) {
    pieces.push({ kind: "chip", key: "command", chip: commandChip(slashCommand) });
    remainingSkip = rawText.length - body.length;
  }

  content.forEach((block, index) => {
    if (block.kind === "text") {
      if (remainingSkip >= block.text.length) {
        remainingSkip -= block.text.length;
        return;
      }
      const text = remainingSkip > 0 ? block.text.slice(remainingSkip) : block.text;
      remainingSkip = 0;
      if (text.length > 0) pieces.push({ kind: "text", key: `text-${index}`, text });
      return;
    }

    if (block.kind === "skill") {
      if (remainingSkip >= block.invocation.length) {
        remainingSkip -= block.invocation.length;
        return;
      }
      remainingSkip = 0;
      pieces.push({
        kind: "chip",
        key: `skill-${index}-${block.name}`,
        chip: {
          kind: "skill",
          name: block.name,
          ...(block.pluginId ? { pluginId: block.pluginId } : {}),
          ...(block.pluginName ? { pluginName: block.pluginName } : {}),
        },
      });
      return;
    }

    if (block.kind === "diff_comment") {
      const promptText = formatDiffCommentPrompt(block);
      if (remainingSkip >= promptText.length) {
        remainingSkip -= promptText.length;
        return;
      }
      remainingSkip = 0;
      pieces.push({
        kind: "chip",
        key: `diff-comment-${index}-${block.path}-${block.lineNumber}`,
        chip: { kind: "diff_comment", block },
      });
      return;
    }

    if (block.kind === "mcp") {
      // An @-mention is never part of a leading /slash-command prefix, so —
      // unlike the skill/file branches — an mcp block can never fall inside the
      // skipped region and needs no remainingSkip handling.
      pieces.push({
        kind: "chip",
        key: `mcp-${index}-${block.name}`,
        chip: { kind: "mcp", name: block.name },
      });
      return;
    }

    if (block.kind === "thread") {
      // A thread mention is never part of a leading /slash-command prefix, so
      // it can render directly from the original canonical block.
      pieces.push({
        kind: "chip",
        key: `thread-${index}-${block.threadId}`,
        chip: { kind: "thread", threadId: block.threadId, title: block.title },
      });
      return;
    }

    if (block.kind === "file") {
      if (block.source === "attachment") return;
      if (remainingSkip >= block.path.length) {
        remainingSkip -= block.path.length;
        return;
      }
      remainingSkip = 0;
      pieces.push({
        kind: "chip",
        key: `file-${index}-${block.path}`,
        chip: { kind: "file", path: block.path },
      });
    }
  });

  return pieces;
}

/**
 * Splits a plain string — a thread title, which keeps no structure — into text
 * and chips. Only the shapes a skill invocation leaves in text are recognised:
 * a leading `/command` (`/skill:<name>` for ACP skills) and `$skill` tokens. A
 * slash-invoked skill block keeps its skill glyph in the message, but flattened
 * into a title it is indistinguishable from a plain command and shows `/`.
 */
export function inlinePiecesFromText(text: string): PromptInlinePiece[] {
  const pieces: PromptInlinePiece[] = [];
  let rest = text;
  const { slashCommand, body } = extractLeadingSlashCommand(text);
  if (slashCommand) {
    pieces.push({ kind: "chip", key: "command", chip: commandChip(slashCommand) });
    rest = body;
  }

  let cursor = 0;
  for (const match of rest.matchAll(DOLLAR_SKILL_RE)) {
    const name = match[1]!.replace(TRAILING_NAME_PUNCTUATION_RE, "");
    if (name.length === 0) continue;
    if (match.index > cursor) {
      pieces.push({
        kind: "text",
        key: `text-${cursor}`,
        text: rest.slice(cursor, match.index),
      });
    }
    pieces.push({
      kind: "chip",
      key: `skill-${match.index}-${name}`,
      chip: { kind: "skill", name },
    });
    cursor = match.index + 1 + name.length;
  }
  if (cursor < rest.length) {
    pieces.push({ kind: "text", key: `text-${cursor}`, text: rest.slice(cursor) });
  }
  return pieces;
}

/**
 * One-line form of a message's pieces: browser selector payloads dropped,
 * whitespace runs collapsed to single spaces, the ends trimmed.
 */
export function compactInlinePieces(pieces: PromptInlinePiece[]): PromptInlinePiece[] {
  const collapsed = pieces.flatMap((piece): PromptInlinePiece[] => {
    if (piece.kind === "chip") return [piece];
    const text = collapsePromptText(piece.text);
    return text.length > 0 ? [{ ...piece, text }] : [];
  });
  const first = collapsed[0];
  if (first?.kind === "text") collapsed[0] = { ...first, text: first.text.trimStart() };
  const last = collapsed.at(-1);
  if (last?.kind === "text") {
    collapsed[collapsed.length - 1] = { ...last, text: last.text.trimEnd() };
  }
  return collapsed.filter((piece) => piece.kind === "chip" || piece.text.length > 0);
}

/** Whether any piece is a chip. */
export function hasChipPiece(pieces: readonly PromptInlinePiece[]): boolean {
  return pieces.some((piece) => piece.kind === "chip");
}
