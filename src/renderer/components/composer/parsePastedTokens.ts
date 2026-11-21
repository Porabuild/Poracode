import type { AgentSlashCommand, PromptSegment } from "@/shared/contracts";
import { skillSegmentFromSlashCommand, threadMentionLabel } from "@/shared/promptContent";
import { isSkillCommand, slashCommandDisplayId } from "../thread/slashCommandMatching";
import type {
  CrewMentionItem,
  McpMentionItem,
  PluginMentionItem,
  ThreadMentionItem,
} from "./MentionInput";
import { isLikelyInlineFilePath } from "./serializeMentions";

export type ParsedPastePiece =
  | { kind: "text"; content: string }
  | { kind: "slash_command"; command: AgentSlashCommand }
  | { kind: "plugin"; item: PluginMentionItem; skill: Extract<PromptSegment, { kind: "skill" }> }
  | { kind: "mcp"; item: McpMentionItem }
  | { kind: "thread"; item: ThreadMentionItem }
  | { kind: "file"; path: string; isDirectory: boolean };

export interface ParsePastedTokensOptions {
  /** True when nothing precedes the paste range in the editor. */
  atEditorStart: boolean;
  /** True when the character immediately before the paste point allows a `$`/`@` token to start. */
  startsAtTokenBoundary: boolean;
  /** True when whitespace or a line break already follows the paste range in the editor. */
  followedByWhitespace: boolean;
  slashCommands?: readonly AgentSlashCommand[] | undefined;
  mcpMentions?: readonly McpMentionItem[] | undefined;
  pluginMentions?: readonly PluginMentionItem[] | undefined;
  threadMentions?: readonly ThreadMentionItem[] | undefined;
  crewMentions?: readonly CrewMentionItem[] | undefined;
}

export interface ParsePastedTokensResult {
  pieces: ParsedPastePiece[];
  /** MCP server ids that should be enabled for matched plugins or disabled MCP mentions. */
  enableMcpServerIds: string[];
}

const LEADING_SLASH_COMMAND_RE = /^\/([A-Za-z][A-Za-z0-9_.:-]*)(?=\s|$)/u;
const ACP_SKILL_PREFIX_RE = /^skill:/iu;
const TOKEN_CONTINUATION_RE = /[\p{L}\p{N}_/\\-]/u;
const WORD_OR_DIGIT_RE = /[\p{L}\p{N}]/u;
const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//iu;
const SIMPLE_TRAILING_PUNCTUATION = new Set([",", ".", ";", ":", "!", "?", '"', "'"]);
const OPENING_PUNCTUATION = new Set(["(", "[", "{", "'", '"']);
const MATCHING_OPENER: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

export function isTokenStartBoundaryChar(ch: string): boolean {
  return /\s/u.test(ch) || OPENING_PUNCTUATION.has(ch);
}

function isAtTokenStart(text: string, index: number, startsAtTokenBoundary: boolean): boolean {
  if (index === 0) return startsAtTokenBoundary;
  return isTokenStartBoundaryChar(text[index - 1]!);
}

function isAtTokenEnd(text: string, end: number): boolean {
  if (end >= text.length) return true;
  const next = text[end]!;
  if (TOKEN_CONTINUATION_RE.test(next)) return false;
  if (next === "." && end + 1 < text.length && WORD_OR_DIGIT_RE.test(text[end + 1]!)) {
    return false;
  }
  return true;
}

function pushText(pieces: ParsedPastePiece[], content: string): void {
  if (!content) return;
  const last = pieces.at(-1);
  if (last?.kind === "text") {
    last.content += content;
    return;
  }
  pieces.push({ kind: "text", content });
}

function findFencedCodeEnd(text: string, start: number): number | null {
  if (start > 0 && text[start - 1] !== "\n") return null;
  const fenceChar = text[start];
  if (fenceChar !== "`" && fenceChar !== "~") return null;
  let fenceLen = 0;
  while (text[start + fenceLen] === fenceChar) fenceLen += 1;
  if (fenceLen < 3) return null;
  const firstNewline = text.indexOf("\n", start + fenceLen);
  if (firstNewline === -1) return null;
  let lineStart = firstNewline + 1;
  while (lineStart < text.length) {
    const lineEnd = text.indexOf("\n", lineStart);
    const end = lineEnd === -1 ? text.length : lineEnd;
    const line = text.slice(lineStart, end).trimEnd();
    let count = 0;
    while (line[count] === fenceChar) count += 1;
    if (count >= fenceLen && count === line.length) {
      return lineEnd === -1 ? text.length : lineEnd + 1;
    }
    if (lineEnd === -1) break;
    lineStart = lineEnd + 1;
  }
  return null;
}

function findInlineCodeEnd(text: string, start: number): number | null {
  if (text[start] !== "`") return null;
  let ticks = 0;
  while (text[start + ticks] === "`") ticks += 1;
  const closing = "`".repeat(ticks);
  let searchFrom = start + ticks;
  const paragraphEnd = text.indexOf("\n\n", searchFrom);
  const limit = paragraphEnd === -1 ? text.length : paragraphEnd;
  while (searchFrom < limit) {
    const found = text.indexOf(closing, searchFrom);
    if (found === -1 || found + ticks > limit) return null;
    const beforeTick = found > start + ticks && text[found - 1] === "`";
    const afterTick = text[found + ticks] === "`";
    if (!beforeTick && !afterTick) {
      return found + ticks;
    }
    searchFrom = found + 1;
  }
  return null;
}

function matchLeadingSlashCommand(
  text: string,
  commands: readonly AgentSlashCommand[],
): { command: AgentSlashCommand; end: number } | null {
  const match = LEADING_SLASH_COMMAND_RE.exec(text);
  if (!match) return null;
  const rawToken = match[1]!;
  const lower = rawToken.toLowerCase();
  const exact = commands.find(
    (command) =>
      slashCommandDisplayId(command).toLowerCase() === lower || command.id.toLowerCase() === lower,
  );
  if (exact) return { command: exact, end: 1 + rawToken.length };
  if (ACP_SKILL_PREFIX_RE.test(rawToken)) {
    const stripped = rawToken.slice(rawToken.indexOf(":") + 1).toLowerCase();
    if (stripped.length > 0) {
      const skill = commands.find(
        (command) =>
          isSkillCommand(command) && slashCommandDisplayId(command).toLowerCase() === stripped,
      );
      if (skill) return { command: skill, end: 1 + rawToken.length };
    }
  }
  return null;
}

interface SkillCandidate {
  labelLower: string;
  length: number;
  command: AgentSlashCommand;
}

function buildSkillCandidates(commands: readonly AgentSlashCommand[]): SkillCandidate[] {
  const candidates: SkillCandidate[] = [];
  for (const command of commands) {
    if (!isSkillCommand(command)) continue;
    const display = slashCommandDisplayId(command);
    if (display) {
      candidates.push({ labelLower: display.toLowerCase(), length: display.length, command });
    }
    if (command.id && command.id.toLowerCase() !== display.toLowerCase()) {
      candidates.push({ labelLower: command.id.toLowerCase(), length: command.id.length, command });
    }
  }
  candidates.sort((a, b) => b.length - a.length);
  return candidates;
}

type NamedMentionCandidate = {
  labelLower: string;
  length: number;
  priority: number;
} & (
  | { kind: "plugin"; item: PluginMentionItem; skill: Extract<PromptSegment, { kind: "skill" }> }
  | { kind: "mcp"; item: McpMentionItem }
  | { kind: "crew"; item: CrewMentionItem }
  | { kind: "thread"; item: ThreadMentionItem }
);

function buildNamedMentionCandidates(options: ParsePastedTokensOptions): NamedMentionCandidate[] {
  const candidates: NamedMentionCandidate[] = [];
  const pushLabels = (
    labels: readonly string[],
    priority: number,
    entry:
      | {
          kind: "plugin";
          item: PluginMentionItem;
          skill: Extract<PromptSegment, { kind: "skill" }>;
        }
      | { kind: "mcp"; item: McpMentionItem }
      | { kind: "crew"; item: CrewMentionItem }
      | { kind: "thread"; item: ThreadMentionItem },
  ) => {
    const seen = new Set<string>();
    for (const raw of labels) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const lower = trimmed.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      candidates.push({ labelLower: lower, length: trimmed.length, priority, ...entry });
    }
  };

  for (const item of options.pluginMentions ?? []) {
    const skill = skillSegmentFromSlashCommand(item.command);
    if (!skill) continue;
    pushLabels([item.name, ...(item.searchAliases ?? [])], 0, { kind: "plugin", item, skill });
  }
  for (const item of options.mcpMentions ?? []) {
    pushLabels([item.name, ...(item.searchAliases ?? [])], 1, { kind: "mcp", item });
  }
  for (const item of options.crewMentions ?? []) {
    pushLabels([item.label], 2, { kind: "crew", item });
  }
  for (const item of options.threadMentions ?? []) {
    const label = threadMentionLabel(item);
    pushLabels(label === item.threadId ? [label] : [label, item.threadId], 3, {
      kind: "thread",
      item,
    });
  }

  candidates.sort((a, b) => b.length - a.length || a.priority - b.priority);
  return candidates;
}

function hasUnmatchedCloser(text: string, closer: string): boolean {
  const opener = MATCHING_OPENER[closer];
  if (!opener) return false;
  let balance = 0;
  for (let index = 0; index < text.length; index++) {
    const ch = text[index]!;
    if (ch === opener) balance += 1;
    else if (ch === closer) balance -= 1;
  }
  return balance < 0;
}

function trimTrailingPathPunctuation(raw: string): string {
  let end = raw.length;
  while (end > 0) {
    const ch = raw[end - 1]!;
    if (SIMPLE_TRAILING_PUNCTUATION.has(ch)) {
      end -= 1;
      continue;
    }
    if (ch in MATCHING_OPENER && hasUnmatchedCloser(raw.slice(0, end), ch)) {
      end -= 1;
      continue;
    }
    break;
  }
  return raw.slice(0, end);
}

function matchFileMention(
  text: string,
  atIndex: number,
): { path: string; isDirectory: boolean; end: number } | null {
  let tokenEnd = atIndex + 1;
  while (tokenEnd < text.length && !/\s/u.test(text[tokenEnd]!) && text[tokenEnd] !== "@") {
    tokenEnd += 1;
  }
  const raw = text.slice(atIndex + 1, tokenEnd);
  const path = trimTrailingPathPunctuation(raw);
  if (!path || URL_SCHEME_RE.test(path)) return null;
  const trimmedSlashes = path.replace(/[\\/]+$/u, "");
  if (
    !trimmedSlashes ||
    trimmedSlashes === "." ||
    trimmedSlashes === ".." ||
    trimmedSlashes === "~"
  ) {
    return null;
  }
  if (!isLikelyInlineFilePath(path)) return null;
  const isDirectory = path.endsWith("/") || path.endsWith("\\");
  return { path, isDirectory, end: atIndex + 1 + path.length };
}

/**
 * Parse pasted plain text into composer chips and literal text segments.
 * Leading `/command`, inline `$skill`, and inline `@mention` (plugin, MCP,
 * thread, or file path) convert to chips when they match the active composer
 * catalogs or the inline file-path heuristic. Code fences and inline backtick
 * spans stay literal text.
 */
export function parsePastedTokens(
  text: string,
  options: ParsePastedTokensOptions,
): ParsePastedTokensResult {
  const pieces: ParsedPastePiece[] = [];
  const enableMcpIds = new Set<string>();
  const slashCommands = options.slashCommands ?? [];
  const skillCandidates = buildSkillCandidates(slashCommands);
  const namedMentions = buildNamedMentionCandidates(options);

  let cursor = 0;
  let textStart = 0;

  if (options.atEditorStart && text.startsWith("/") && slashCommands.length > 0) {
    const leading = matchLeadingSlashCommand(text, slashCommands);
    if (leading) {
      pieces.push({ kind: "slash_command", command: leading.command });
      cursor = leading.end;
      textStart = leading.end;
    }
  }

  while (cursor < text.length) {
    const ch = text[cursor]!;

    if (ch === "`" || ch === "~") {
      const fenceEnd = findFencedCodeEnd(text, cursor);
      if (fenceEnd !== null) {
        cursor = fenceEnd;
        continue;
      }
      if (ch === "`") {
        const inlineEnd = findInlineCodeEnd(text, cursor);
        if (inlineEnd !== null) {
          cursor = inlineEnd;
          continue;
        }
      }
      cursor += 1;
      continue;
    }

    if (
      ch === "$" &&
      skillCandidates.length > 0 &&
      isAtTokenStart(text, cursor, options.startsAtTokenBoundary)
    ) {
      const matched = skillCandidates.find(
        (candidate) =>
          cursor + 1 + candidate.length <= text.length &&
          text.slice(cursor + 1, cursor + 1 + candidate.length).toLowerCase() ===
            candidate.labelLower &&
          isAtTokenEnd(text, cursor + 1 + candidate.length),
      );
      if (matched) {
        pushText(pieces, text.slice(textStart, cursor));
        pieces.push({ kind: "slash_command", command: matched.command });
        cursor += 1 + matched.length;
        textStart = cursor;
        continue;
      }
    }

    if (ch === "@" && isAtTokenStart(text, cursor, options.startsAtTokenBoundary)) {
      const named = namedMentions.find(
        (candidate) =>
          cursor + 1 + candidate.length <= text.length &&
          text.slice(cursor + 1, cursor + 1 + candidate.length).toLowerCase() ===
            candidate.labelLower &&
          isAtTokenEnd(text, cursor + 1 + candidate.length),
      );
      if (named) {
        if (named.kind === "crew") {
          cursor += 1 + named.length;
          continue;
        }
        pushText(pieces, text.slice(textStart, cursor));
        if (named.kind === "plugin") {
          pieces.push({ kind: "plugin", item: named.item, skill: named.skill });
          named.item.enablesMcpServerIds?.forEach((id) => enableMcpIds.add(id));
        } else if (named.kind === "mcp") {
          pieces.push({ kind: "mcp", item: named.item });
          if (!named.item.enabled) enableMcpIds.add(named.item.id);
        } else {
          pieces.push({ kind: "thread", item: named.item });
        }
        cursor += 1 + named.length;
        textStart = cursor;
        continue;
      }

      const file = matchFileMention(text, cursor);
      if (file) {
        pushText(pieces, text.slice(textStart, cursor));
        pieces.push({ kind: "file", path: file.path, isDirectory: file.isDirectory });
        cursor = file.end;
        textStart = cursor;
        continue;
      }
    }

    cursor += 1;
  }

  pushText(pieces, text.slice(textStart));

  const lastPiece = pieces.at(-1);
  if (lastPiece && lastPiece.kind !== "text" && !options.followedByWhitespace) {
    pieces.push({ kind: "text", content: " " });
  }

  return { pieces, enableMcpServerIds: [...enableMcpIds] };
}
