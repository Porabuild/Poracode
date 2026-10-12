import { isAlias, isMap, isNode, isScalar, parse as parseYaml, parseDocument, visit } from "yaml";
import type { Node, Pair } from "yaml";
import type { DevinPersonaDefinition, DevinPersonaFrontmatter } from "./definitions";

/**
 * Line-based editing of native Devin persona definitions (moved out of
 * `definitions.ts` to keep that parser file single-purpose; both modules
 * re-export the same API surface).
 *
 * The editor replaces only the raw blocks of the managed frontmatter fields an
 * edit supplies, in place, and leaves every other byte of the frontmatter and
 * the body untouched. Faithfulness is grounded in the YAML AST of the raw
 * frontmatter being edited: every root pair's key/value span is drawn from the
 * AST, so a replacement swallows exactly the bytes of the value it replaces
 * and the next root pair — including unknown keys outside the managed-key
 * grammar — always ends the preceding replacement. The root mapping's
 * indentation decides where replacements and appends are emitted (nested keys
 * are never mistaken for root keys), an edited root scalar keeps its anchor so
 * untouched aliases stay resolvable, and any spelling the line editor cannot
 * address faithfully — flow-styled roots, anchored or explicit root keys,
 * multi-line values whose continuations escape the replacement span, or
 * replaced collections carrying anchors referenced outside the replaced block
 * — is refused with an error before malformed content can be returned. The
 * edited frontmatter is re-validated as a backstop, so this API never
 * silently returns a broken document.
 */

export interface DevinPersonaEdit {
  /**
   * Frontmatter fields to set. A field left `undefined` keeps its raw block
   * exactly as written — alias spelling, comments, multiline values, and
   * position included. There is no delete semantics: empty strings and 0 are
   * explicit values, not omissions.
   */
  // max-nesting stays strictly numeric here: edits are Poracode-authored
  // writes and must only serialize valid u32 values, while the parsed
  // frontmatter keeps the raw value for validation.
  fields: Partial<Pick<DevinPersonaFrontmatter, "name" | "description" | "model">> & {
    maxNesting?: number | undefined;
  };
  /**
   * Replacement tools restriction. `undefined` leaves the raw block (either
   * spelling) untouched; an explicitly supplied empty list serializes as
   * `allowed-tools: []` — a real empty restriction, not a removed key. The
   * replacement is emitted under the alias spelling the raw block used.
   */
  allowedTools?: readonly string[] | undefined;
  /** Replacement body; `undefined` leaves it untouched. */
  body?: string | undefined;
}

function toYamlScalar(value: string | number | boolean): string {
  if (typeof value === "string") {
    return /^[\w./ -]+$/.test(value) && value.trim() === value && parseYaml(value) === value
      ? value
      : JSON.stringify(value);
  }
  return String(value);
}

/** Managed frontmatter keys → edit fields; `tools` is an alias of `allowed-tools`. */
const DEVIN_PERSONA_KEY_FIELDS: Record<
  string,
  "name" | "description" | "model" | "allowedTools" | "maxNesting"
> = {
  name: "name",
  description: "description",
  model: "model",
  "allowed-tools": "allowedTools",
  tools: "allowedTools",
  "max-nesting": "maxNesting",
};

/** Fields a supplied-but-absent key appends under, in emission order. */
const DEVIN_PERSONA_EDIT_FIELDS = [
  "name",
  "description",
  "model",
  "maxNesting",
  "allowedTools",
] as const;

function serializeToolsList(alias: "allowed-tools" | "tools", tools: readonly string[]): string {
  return tools.length > 0
    ? `${alias}:\n${tools.map((tool) => `  - ${toYamlScalar(tool)}`).join("\n")}`
    : `${alias}: []`;
}

/** Alias spelling the raw block uses for the tools restriction (`allowed-tools` wins when both appear, matching parse precedence). */
function rawToolsAlias(root: RootMappingSource): "allowed-tools" | "tools" {
  if (root.pairsByName.has("allowed-tools")) return "allowed-tools";
  return root.pairsByName.has("tools") ? "tools" : "allowed-tools";
}

function refuseEdit(reason: string): Error {
  return new Error(`Cannot edit persona definition: ${reason}`);
}

interface RawFrontmatterLines {
  lines: string[];
  /** Offset of each line's start within the raw frontmatter (CRLF inclusive). */
  starts: number[];
}

function splitRawFrontmatterLines(raw: string): RawFrontmatterLines {
  const lines: string[] = [];
  const starts: number[] = [];
  let start = 0;
  for (let newline = raw.indexOf("\n"); newline !== -1; newline = raw.indexOf("\n", start)) {
    const text = raw.slice(start, newline);
    lines.push(text.endsWith("\r") ? text.slice(0, -1) : text);
    starts.push(start);
    start = newline + 1;
  }
  lines.push(raw.slice(start));
  starts.push(start);
  return { lines, starts };
}

function lineIndexOf(starts: readonly number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if ((starts[mid] ?? 0) <= offset) low = mid;
    else high = mid - 1;
  }
  return low;
}

function indentOf(line: string): number {
  let end = 0;
  while (line[end] === " ") end++;
  return end;
}

/** `[start, value-end]` character offsets of a parsed node's source span. */
function nodeSpan(node: unknown): [number, number] | undefined {
  if (!isNode(node) || !Array.isArray(node.range)) return undefined;
  const [start, valueEnd] = node.range;
  return typeof start === "number" && typeof valueEnd === "number" ? [start, valueEnd] : undefined;
}

/**
 * Anchors defined strictly inside a replaced value's subtree. The value's own
 * anchor is deliberately excluded: it is re-emitted on the replacement, so
 * external aliases to it stay resolvable.
 */
function collectInternalAnchors(valueNode: Node): Set<string> {
  const anchors = new Set<string>();
  visit(valueNode, {
    Node: (_key, node) => {
      if (node === valueNode || isAlias(node)) return;
      if (typeof node.anchor === "string") anchors.add(node.anchor);
    },
  });
  return anchors;
}

/** Where a root pair's key line and its value's byte span sit in the raw frontmatter. */
interface RootPairSource {
  pair: Pair;
  /** Resolved scalar key name; `undefined` for non-string keys (never managed). */
  keyName: string | undefined;
  keyLine: number;
  keyCol: number;
  /**
   * Last raw line of the pair's value block (the key line itself when the
   * value ends there). Drawn from the AST, so it bounds a replacement exactly:
   * the next root pair — whatever its key spelling — always survives.
   */
  valueEndLine: number;
}

/**
 * The root mapping as the line editor sees it, derived from the raw
 * frontmatter's AST rather than whitespace guessing.
 */
interface RootMappingSource {
  /** Column the root mapping's keys start at (0 for conventional frontmatter). */
  indent: number;
  /** Every root pair in document order — unknown key spellings included. */
  pairs: readonly RootPairSource[];
  /** Top-level pairs by key name, first occurrence wins. */
  pairsByName: Map<string, RootPairSource>;
  /** Every alias in the document, with its source span. */
  aliases: readonly { name: string; start: number; end: number }[];
}

const EMPTY_ROOT_MAPPING: RootMappingSource = {
  indent: 0,
  pairs: [],
  pairsByName: new Map(),
  aliases: [],
};

/**
 * Ground a line edit in the raw frontmatter's AST: the root mapping indent,
 * every top-level pair's key line and value span (document order, unknown
 * spellings included), flow-style detection, and all aliases. Refuses the
 * edit when the raw frontmatter is not a block-styled mapping the line editor
 * can address faithfully.
 */
function analyzeRootMapping(raw: string, source: RawFrontmatterLines): RootMappingSource {
  const { lines, starts } = source;
  const document = parseDocument(raw);
  const parseError = document.errors[0];
  if (parseError) {
    throw refuseEdit(`the raw frontmatter no longer parses (${parseError.message}).`);
  }
  if (document.contents == null) return EMPTY_ROOT_MAPPING;
  if (!isMap(document.contents)) throw refuseEdit("the frontmatter root is not a mapping.");
  if (document.contents.flow) {
    throw refuseEdit(
      "the root mapping is flow-styled; the line-based editor cannot apply this edit faithfully.",
    );
  }
  const pairs: RootPairSource[] = [];
  const pairsByName = new Map<string, RootPairSource>();
  for (const entry of document.contents.items) {
    const keySpan = nodeSpan(entry.key);
    const keyName =
      isScalar(entry.key) && typeof entry.key.value === "string" ? entry.key.value : undefined;
    const keyLine = keySpan ? lineIndexOf(starts, keySpan[0]) : -1;
    const keyCol =
      keySpan && starts[keyLine] !== undefined ? keySpan[0] - starts[keyLine]! : Number.NaN;
    const valueSpan = nodeSpan(entry.value);
    // Honor the AST boundary even for a zero-length value: an empty value can
    // still own tag/anchor syntax on a following line (`description:` + a
    // standalone `  !!str` / `&d` line), and leaving that line behind folds
    // its bytes into the edited value. `end - 1` stays inside the value's own
    // last line, so the boundary can never reach the next root pair.
    const valueEndLine = valueSpan
      ? Math.max(keyLine, lineIndexOf(starts, valueSpan[1] - 1))
      : keyLine;
    const pairSource: RootPairSource = { pair: entry, keyName, keyLine, keyCol, valueEndLine };
    pairs.push(pairSource);
    if (keyName !== undefined && !pairsByName.has(keyName)) pairsByName.set(keyName, pairSource);
  }
  const first = pairs.find((pairSource) => pairSource.keyLine >= 0);
  const indent = first ? indentOf(lines[first.keyLine] ?? "") : 0;
  const aliases: { name: string; start: number; end: number }[] = [];
  visit(document.contents, {
    Alias: (_key, node) => {
      const span = nodeSpan(node);
      if (span) aliases.push({ name: node.source, start: span[0], end: span[1] });
    },
  });
  return { indent, pairs, pairsByName, aliases };
}

/**
 * A replaced value must be fully covered by its key line plus the
 * continuations the line editor swallows (deeper-indented lines, sequence
 * items at the root indent, blanks, comments). Anything else — a multi-line
 * flow collection or an under-indented continuation — would leave orphan
 * bytes behind the replacement, so the edit is refused instead.
 */
function checkReplaceableValueSpan(
  valueNode: unknown,
  keyLine: number,
  rootIndent: number,
  source: RawFrontmatterLines,
  keyName: string,
): void {
  if (!isNode(valueNode)) return; // empty value: nothing after the colon
  const span = nodeSpan(valueNode);
  if (!span) {
    throw refuseEdit(`cannot edit "${keyName}": the value span cannot be verified.`);
  }
  const [start, end] = span;
  if (end <= start) return; // scalar on the key line
  const endLine = lineIndexOf(source.starts, end - 1);
  for (let index = keyLine + 1; index <= endLine; index++) {
    const line = source.lines[index] ?? "";
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const indent = indentOf(line);
    if (indent > rootIndent) continue;
    if (indent === rootIndent && /^-(?:[ \t]|$)/.test(line.slice(rootIndent))) continue;
    throw refuseEdit(
      `cannot edit "${keyName}": the value spans lines the line-based editor cannot replace faithfully (multi-line flow or under-indented continuation).`,
    );
  }
}

/**
 * Replacing a value drops every anchor defined inside it. Refuse when any of
 * those anchors is referenced by an alias outside the replaced span — the
 * edit would return a document with unresolved aliases. Aliases inside the
 * replaced span disappear together with their anchors, and aliases to the
 * value's own anchor are safe because that anchor is preserved on the
 * replacement.
 */
function checkInternalAnchorsUnreferenced(
  valueNode: unknown,
  aliases: RootMappingSource["aliases"],
  keyName: string,
): void {
  if (!isNode(valueNode)) return;
  const internal = collectInternalAnchors(valueNode);
  if (internal.size === 0) return;
  const span = nodeSpan(valueNode);
  if (!span) {
    throw refuseEdit(`cannot edit "${keyName}": anchor references cannot be verified.`);
  }
  const [start, end] = span;
  const referenced = [...internal].filter((name) =>
    aliases.some((alias) => alias.name === name && (alias.start < start || alias.start >= end)),
  );
  if (referenced.length > 0) {
    const names = referenced.map((name) => `"${name}"`).join(", ");
    throw refuseEdit(
      `cannot edit "${keyName}": replacing it would drop anchor(s) ${names} referenced outside the replaced block, leaving unresolved aliases.`,
    );
  }
}

/**
 * Verify a replaced managed key can be edited faithfully by the line editor:
 * its key line is a simple root-indent spelling, its value's lines are fully
 * swallowed by the replacement, and anchors inside the replaced value are not
 * referenced outside it. Returns the value's own anchor to preserve, if any.
 */
function checkedReplacement(
  keyName: string,
  source: RootPairSource,
  root: RootMappingSource,
  raw: RawFrontmatterLines,
): string | undefined {
  const line = raw.lines[source.keyLine] ?? "";
  const prefix = line.slice(0, source.keyCol);
  const spelling = new RegExp(
    `^["']?${keyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']?[ \t]*:`,
  );
  if (
    source.keyCol !== root.indent ||
    prefix.trim() !== "" ||
    !spelling.test(line.slice(source.keyCol))
  ) {
    throw refuseEdit(
      `cannot edit "${keyName}": unsupported key spelling; the line-based editor cannot replace it faithfully.`,
    );
  }
  const valueNode: unknown = source.pair.value;
  checkReplaceableValueSpan(valueNode, source.keyLine, root.indent, raw, keyName);
  checkInternalAnchorsUnreferenced(valueNode, root.aliases, keyName);
  const anchor =
    isNode(valueNode) && !isAlias(valueNode) && typeof valueNode.anchor === "string"
      ? valueNode.anchor
      : undefined;
  return anchor;
}

/** Re-emit a replaced value's own anchor on the replacement's first line. */
function withPreservedAnchor(
  field: string,
  emitted: string[],
  anchor: string | undefined,
): string[] {
  if (!anchor) return emitted;
  return [emitted[0]!.replace(/^([A-Za-z][\w-]*:)/, `$1 &${anchor}`), ...emitted.slice(1)];
}

/**
 * Backstop: an edited frontmatter must parse and resolve. Nothing above
 * should be able to produce a violation, but a broken result is refused here
 * rather than returned.
 */
function validateEditedFrontmatter(frontmatter: string): void {
  const document = parseDocument(frontmatter);
  const error = document.errors[0];
  if (error) {
    throw refuseEdit(
      `the edited frontmatter does not parse (${error.message}); refusing to return malformed content.`,
    );
  }
  try {
    document.toJS();
  } catch (cause) {
    throw refuseEdit(
      `the edited frontmatter does not resolve (${cause instanceof Error ? cause.message : String(cause)}); refusing to return malformed content.`,
    );
  }
}

/**
 * Apply an edit to a definition and return the new file content. Supplied
 * fields replace only their own key blocks, in place; every omitted managed
 * key keeps its raw block verbatim (alias spelling, comments, multiline
 * values), as do unknown keys. Replacement spans are the root pairs' own
 * AST-drawn key/value spans, so a replacement ends where its value ends and
 * the next root pair — including unknown keys outside the managed-key
 * grammar — is never swallowed. A supplied tools list replaces the one
 * logical restriction under the alias the file already uses; keys not present
 * in the raw block append after it. Blank and comment separator lines inside
 * a replaced span survive replacement; sequence items remain part of their
 * field across those separators.
 *
 * Replacements and appends are emitted at the root mapping's own indentation,
 * and an edited root scalar keeps its anchor. Unsupported spellings are
 * refused with an error before any content is returned (see the module docs).
 */
export function serializeDevinPersonaDefinition(
  definition: DevinPersonaDefinition,
  edit: DevinPersonaEdit,
): string {
  const eol = definition.rawFrontmatter.includes("\r\n") ? "\r\n" : "\n";
  const raw = splitRawFrontmatterLines(definition.rawFrontmatter);
  // Edits that leave the frontmatter untouched are a byte-identical passthrough.
  const touchesFrontmatter =
    edit.fields.name !== undefined ||
    edit.fields.description !== undefined ||
    edit.fields.model !== undefined ||
    edit.fields.maxNesting !== undefined ||
    edit.allowedTools !== undefined;
  const root = touchesFrontmatter
    ? analyzeRootMapping(definition.rawFrontmatter, raw)
    : EMPTY_ROOT_MAPPING;
  const rootIndent = root.indent;
  const supplied = new Map<string, string[]>();
  if (edit.fields.name !== undefined)
    supplied.set("name", [`name: ${toYamlScalar(edit.fields.name)}`]);
  if (edit.fields.description !== undefined)
    supplied.set("description", [`description: ${toYamlScalar(edit.fields.description)}`]);
  if (edit.fields.model !== undefined)
    supplied.set("model", [`model: ${toYamlScalar(edit.fields.model)}`]);
  if (edit.fields.maxNesting !== undefined)
    supplied.set("maxNesting", [`max-nesting: ${edit.fields.maxNesting}`]);
  if (edit.allowedTools !== undefined) {
    // One logical field with two YAML spellings: replace whichever the file used.
    const alias = rawToolsAlias(root);
    supplied.set("allowedTools", serializeToolsList(alias, edit.allowedTools).split("\n"));
  }
  // Managed fields already present in the raw block must be replaceable
  // before any byte changes; anchors on their values are preserved.
  const preserved = new Map<string, string>();
  for (const pairSource of root.pairs) {
    const { keyName } = pairSource;
    if (keyName === undefined) continue;
    const field = DEVIN_PERSONA_KEY_FIELDS[keyName];
    if (field === undefined || !supplied.has(field)) continue;
    const anchor = checkedReplacement(keyName, pairSource, root, raw);
    if (anchor && !preserved.has(field)) preserved.set(field, anchor);
  }
  const indentLines = (emitted: string[]): string[] =>
    rootIndent === 0 ? emitted : emitted.map((line) => `${" ".repeat(rootIndent)}${line}`);
  const emit = (field: string, emitted: string[]): string[] =>
    indentLines(withPreservedAnchor(field, emitted, preserved.get(field)));
  const lines: string[] = [];
  const replaced = new Set<string>();
  // Root block-mapping pairs never share a key line.
  const pairAtKeyLine = new Map<number, RootPairSource>();
  for (const pairSource of root.pairs) pairAtKeyLine.set(pairSource.keyLine, pairSource);
  let index = 0;
  while (index < raw.lines.length) {
    const pairSource = pairAtKeyLine.get(index);
    const field =
      pairSource?.keyName !== undefined ? DEVIN_PERSONA_KEY_FIELDS[pairSource.keyName] : undefined;
    if (pairSource && field !== undefined && supplied.has(field)) {
      if (!replaced.has(field)) {
        replaced.add(field);
        lines.push(...emit(field, supplied.get(field)!));
      }
      // Comments do not end a YAML value: lists can continue after a comment
      // or blank line, so those separators inside the replaced value's span
      // are kept. Everything else in the span belongs to the replaced value
      // and is dropped; the next root pair starts a fresh span.
      for (
        let kept = pairSource.keyLine + 1;
        kept <= pairSource.valueEndLine && kept < raw.lines.length;
        kept++
      ) {
        const spanLine = raw.lines[kept] ?? "";
        const trimmed = spanLine.trim();
        if (trimmed === "" || trimmed.startsWith("#")) lines.push(spanLine);
      }
      index = pairSource.valueEndLine + 1;
      continue;
    }
    lines.push(raw.lines[index] ?? "");
    index++;
  }
  // Fields supplied but absent from the raw block append after it.
  for (const field of DEVIN_PERSONA_EDIT_FIELDS) {
    if (supplied.has(field) && !replaced.has(field))
      lines.push(...emit(field, supplied.get(field)!));
  }
  const frontmatter = lines.join(eol);
  const body = edit.body !== undefined ? edit.body : definition.body;
  if (touchesFrontmatter) validateEditedFrontmatter(frontmatter);
  return `---${eol}${frontmatter}${eol}---${eol}${body}`;
}

/** New definition file content for `create` flows. */
export function createDevinPersonaContent(fields: {
  name: string;
  description: string;
  model?: string | undefined;
  allowedTools?: readonly string[] | undefined;
  maxNesting?: number | undefined;
  body?: string | undefined;
}): string {
  const lines = [
    `name: ${toYamlScalar(fields.name)}`,
    `description: ${toYamlScalar(fields.description)}`,
  ];
  if (fields.model !== undefined) lines.push(`model: ${toYamlScalar(fields.model)}`);
  // An explicitly supplied empty list serializes as a real empty restriction.
  if (fields.allowedTools !== undefined)
    lines.push(serializeToolsList("allowed-tools", fields.allowedTools));
  if (fields.maxNesting !== undefined) lines.push(`max-nesting: ${fields.maxNesting}`);
  return `---\n${lines.join("\n")}\n---\n${fields.body ?? ""}`;
}
