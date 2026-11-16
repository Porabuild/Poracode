import type {
  CommandExecutionPayload,
  FileChangePayload,
  WebSearchPayload,
} from "@/shared/contracts";
import type { TranslateFn } from "../../desktop/i18n";
import {
  analyzeEditToolGroup,
  deriveWebSearchDisplay,
  extractAcpAddedFileText,
  extractAcpArgsPart,
  extractAcpDiffResultPart,
  extractAcpResultPart,
  extractAcpResultText,
  extractReadFileResultPart,
  formatCompactionSummary,
  formatDuration,
  getCommandExecutionCollapsedHeader,
  getFileChangeCollapsedHeader,
  getToolCallCollapsedHeader,
  getToolLikePayload,
  i18n,
  isContextCompactionToolCall,
  isReadLikeToolPayload,
  stripAnsiPreservingLayout,
  summarizeToolCalls,
  type DiffSummary,
  type RuntimeChatItem,
  type ToolDisplay,
} from "../../desktop/presentation";
import { COMMAND_GLYPHS, GLYPH, iconGlyph } from "./glyphs";

export type Tone = "muted" | "danger" | "added" | "removed";
export type MetaPart = { readonly text: string; readonly tone: Tone };
/** `prefix` stays whole; a file renders as `<basename> <muted dir>`, a target truncates from the start. */
export type RowTitle = {
  readonly prefix: string;
  readonly file?: string;
  readonly target?: string;
};
export type BodySection = {
  readonly label: string;
  readonly text: string;
  readonly language?: string;
};
export type ToolBody =
  | { readonly kind: "diff"; readonly text: string; readonly path: string }
  | {
      readonly kind: "code";
      readonly text: string;
      readonly language?: string;
      readonly path?: string;
    }
  | { readonly kind: "sections"; readonly sections: readonly BodySection[] };

export type ToolRowModel = {
  readonly glyph: string;
  readonly title: RowTitle;
  readonly meta: readonly MetaPart[];
  readonly running: boolean;
  readonly error: boolean;
  readonly hasBody: boolean;
  /** Only evaluated while expanded, like the desktop's body extraction. */
  readonly body: () => ToolBody | undefined;
};

const t: TranslateFn = (descriptor) => i18n._(descriptor);

/** The desktop row title separator: `Edit: path` reads `Edit · path`. */
export function normalizeTitle(title: string) {
  return title.replace(/: /u, " · ");
}

function titleOf(display: Pick<ToolDisplay, "title" | "parts">): RowTitle {
  if (!display.parts) return { prefix: normalizeTitle(display.title) };
  const prefix = normalizeTitle(display.parts.prefix);
  return display.parts.filePath
    ? { prefix, file: display.parts.path }
    : { prefix, target: display.parts.path };
}

/** The desktop `DiffStat`: `+N` / `-N`, each side hidden when zero. */
export function diffStat(summary: DiffSummary | undefined): MetaPart[] {
  if (!summary) return [];
  return [
    ...(summary.added > 0 ? [{ text: `+${summary.added}`, tone: "added" as const }] : []),
    ...(summary.removed > 0 ? [{ text: `-${summary.removed}`, tone: "removed" as const }] : []),
  ];
}

const ERROR_META: MetaPart = { text: GLYPH.error, tone: "danger" };

function sections(
  ...entries: [string, { text: string; language?: string }][]
): ToolBody | undefined {
  const list = entries
    .filter(([, part]) => part.text.trim().length > 0)
    .map(([label, part]) => ({
      label,
      text: part.text,
      ...(part.language && part.language !== "plain" ? { language: part.language } : {}),
    }));
  return list.length ? { kind: "sections", sections: list } : undefined;
}

function createContent(payload: FileChangePayload): string | undefined {
  if (payload.path) {
    const added = extractAcpAddedFileText(payload, payload.path);
    if (added !== undefined) return added;
  }
  const args = (payload as { args?: unknown }).args;
  if (!args || typeof args !== "object" || Array.isArray(args)) return undefined;
  const content = (args as Record<string, unknown>).content;
  return typeof content === "string" && content.length > 0 ? content : undefined;
}

function commandRow(item: RuntimeChatItem, inline: boolean): ToolRowModel | undefined {
  const payload = item.payload as CommandExecutionPayload | undefined;
  if (!payload) return undefined;
  const header = getCommandExecutionCollapsedHeader(item, payload);
  const running = item.state !== "completed";
  const failed = header.isPayloadError || (header.exitCode !== undefined && header.exitCode !== 0);
  const output = () => {
    const streamed = stripAnsiPreservingLayout(item.streams.command_output ?? "");
    return streamed.length > 0 ? streamed : extractAcpResultText(payload);
  };
  const meta: MetaPart[] = running
    ? []
    : inline
      ? failed
        ? [ERROR_META]
        : []
      : header.durationMs !== undefined
        ? [{ text: formatDuration(header.durationMs), tone: failed ? "danger" : "muted" }]
        : [];
  return {
    glyph: COMMAND_GLYPHS[header.display.kind],
    title: titleOf(header.display),
    meta,
    running,
    error: !running && failed,
    // Grouped rows show bare output; a standalone row prints the command line first.
    hasBody: inline ? output().length > 0 : true,
    body: () => {
      const text = output();
      if (inline) return { kind: "code", text };
      const command = header.displayCommandLine ? `$ ${header.displayCommandLine}` : "$ (command)";
      return { kind: "code", text: [command, text].filter(Boolean).join("\n\n") };
    },
  };
}

function fileChangeRow(item: RuntimeChatItem, inline: boolean): ToolRowModel | undefined {
  const payload = item.payload as FileChangePayload | undefined;
  if (!payload) return undefined;
  const header = getFileChangeCollapsedHeader(item, payload);
  const running = item.state !== "completed";
  const error = header.payloadStatus === "error";
  const verb =
    header.changeKind === "create" ? "Create" : header.changeKind === "delete" ? "Delete" : "Edit";
  const title: RowTitle = header.hasPath
    ? { prefix: `${verb} · `, file: header.path }
    : header.showsFallback && header.fallbackTitle
      ? { prefix: `${verb} · ${header.fallbackTitle}` }
      : { prefix: inline ? verb : `${verb} file` };
  const content = () => (header.changeKind === "create" ? createContent(payload) : undefined);
  const stream = item.streams.file_change_output;
  return {
    glyph: GLYPH.fileChange,
    title,
    meta: running ? [] : error ? [ERROR_META] : diffStat(header.diffSummary),
    running,
    error,
    hasBody: header.hasDiffText || header.hasArgContent || !!stream || header.hasAuxFields,
    body: () => {
      const diff = header.hasDiffText ? extractAcpDiffResultPart(payload).text : undefined;
      if (diff) return { kind: "diff", text: diff, path: payload.path };
      const text = content() ?? stream;
      if (text) return { kind: "code", text, path: payload.path };
      return sections(
        ["args", extractAcpArgsPart(payload)],
        ["result", extractAcpResultPart(payload)],
      );
    },
  };
}

function webSearchRow(item: RuntimeChatItem): ToolRowModel | undefined {
  const payload = item.payload as WebSearchPayload | undefined;
  if (!payload) return undefined;
  const display = deriveWebSearchDisplay(payload, t);
  const running = item.state !== "completed";
  const count = display.resultCount;
  return {
    glyph: GLYPH.web,
    title: titleOf(display),
    meta:
      running || count == null
        ? []
        : [{ text: `${count} ${count === 1 ? "result" : "results"}`, tone: "muted" }],
    running,
    error: false,
    hasBody: display.hasDetails,
    body: () =>
      sections(["query", extractAcpArgsPart(payload)], ["results", extractAcpResultPart(payload)]),
  };
}

function toolCallRow(item: RuntimeChatItem): ToolRowModel | undefined {
  const payload = getToolLikePayload(item);
  if (!payload?.name) return undefined;
  if (isContextCompactionToolCall(item)) {
    const running = item.state !== "completed";
    return {
      glyph: GLYPH.compaction,
      title: {
        prefix: running
          ? "Compacting context"
          : (formatCompactionSummary(payload, t) ?? "Context compacted"),
      },
      meta: [],
      running,
      error: false,
      hasBody: false,
      body: () => undefined,
    };
  }
  const header = getToolCallCollapsedHeader(item, payload);
  const running = item.state !== "completed" || header.payloadStatus === "running";
  const error = !running && header.payloadStatus === "error";
  return {
    glyph: iconGlyph(header.display.Icon),
    title: titleOf(header.display),
    meta: running ? [] : error ? [ERROR_META] : diffStat(header.diffSummary),
    running,
    error,
    hasBody: header.hasAuxDetails || header.hasDiffText || header.hasReadResult,
    body: () => {
      if (header.hasDiffText) {
        const path = header.display.parts?.filePath ? header.display.parts.path : "";
        return { kind: "diff", text: extractAcpDiffResultPart(payload).text, path };
      }
      if (header.hasReadResult && isReadLikeToolPayload(payload)) {
        const part = extractReadFileResultPart(payload);
        return { kind: "code", text: part.text, language: part.language };
      }
      return sections(
        ["args", extractAcpArgsPart(payload)],
        ["result", extractAcpResultPart(payload)],
      );
    },
  };
}

/**
 * One tool-like row. `inline` follows the rows inside a desktop tool-call
 * group; otherwise the standalone accordion row for the same item.
 */
export function toolRow(item: RuntimeChatItem, inline = false): ToolRowModel | undefined {
  switch (item.type) {
    case "command_execution":
      return commandRow(item, inline);
    case "file_change":
      return fileChangeRow(item, inline);
    case "web_search":
      return webSearchRow(item);
    default:
      return toolCallRow(item);
  }
}

export type GroupHeader =
  | {
      readonly kind: "same-file";
      readonly count: number;
      readonly file: string;
      readonly meta: MetaPart[];
    }
  | {
      readonly kind: "sections";
      readonly sections: readonly {
        readonly glyph: string;
        readonly count: number;
        readonly label: string;
        readonly meta: MetaPart[];
        readonly running: boolean;
      }[];
    };

/** The desktop tool-call group header: a same-file edit summary or one section per category. */
export function groupHeader(items: readonly RuntimeChatItem[]): GroupHeader {
  const { sameFile } = analyzeEditToolGroup(items);
  if (sameFile)
    return {
      kind: "same-file",
      count: sameFile.count,
      file: sameFile.path,
      meta: diffStat(sameFile.diffSummary),
    };
  return {
    kind: "sections",
    sections: summarizeToolCalls(items).map((section) => ({
      glyph: iconGlyph(section.Icon),
      count: section.count,
      label: section.label,
      meta: diffStat(section.diffSummary),
      running: section.hasRunning === true,
    })),
  };
}
