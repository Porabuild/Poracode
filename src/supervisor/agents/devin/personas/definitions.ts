import { parseDocument } from "yaml";
import {
  classifyDevinPersonaMaxNesting,
  DEVIN_PERSONA_MAX_NESTING_U32_MAX,
  type DevinPersonaMaxNestingScalar,
} from "./nesting";
export type { DevinPersonaMaxNestingScalar } from "./nesting";

// Editing lives in `editing.ts`; the API surface stays importable from here
// so existing callers are unaffected.
export { createDevinPersonaContent, serializeDevinPersonaDefinition } from "./editing";
export type { DevinPersonaEdit } from "./editing";

/**
 * Native Devin persona (custom subagent profile) definitions — plan §4
 * "Native personas and custom child profiles".
 *
 * A persona is a markdown file with YAML frontmatter, exactly as the native
 * CLI reads it (`docs.devin.ai/cli/subagents`): project `.devin/agents/<name>.md`
 * or `.devin/agents/<name>/AGENT.md` (AGENT.md > AGENTS.md > agent.md >
 * agents.md), project `.agents/agents/`, and the global Devin config root
 * (`~/.config/devin/agents`, `%APPDATA%\devin\agents`). Plugins can also ship
 * subagents, but their installed inventory is not a documented fixed path, so
 * the scan covers only the verified roots. There is no `devin agents list`
 * command: Poracode enumerates by scanning, and a scanned candidate is NOT
 * proof a session loaded it (`devin doctor` reports names for its own invocation).
 *
 * These modules parse, validate, and edit definitions while preserving every
 * unknown frontmatter key and the original body — user definitions are never
 * rewritten during scans. Parsing and validation live here; editing lives in
 * `editing.ts` and is re-exported below.
 */

/** Built-in subagent profiles a custom name must not collide with. */
export const DEVIN_BUILTIN_PERSONA_NAMES = ["subagent_explore", "subagent_general"] as const;

/** File names a persona directory may use, in the native precedence order. */
export const DEVIN_PERSONA_DIR_FILES = ["AGENT.md", "AGENTS.md", "agent.md", "agents.md"] as const;

export type DevinPersonaOrigin = "project" | "global" | "plugin";

export interface DevinPersonaFrontmatter {
  /** Frontmatter name; overrides the path id and must not hit built-ins. */
  name: string | undefined;
  description: string | undefined;
  model: string | undefined;
  /** `allowed-tools` (alias `tools`). True restriction; cannot grant ask_user_question. */
  allowedTools: readonly string[];
  /**
   * `max-nesting` raw frontmatter value (as the YAML document resolves it).
   * Native u32 semantics are carried by
   * {@link DevinPersonaFrontmatter.maxNestingScalar}; this stays the verbatim
   * parsed value — including values native rejects — for lossless visibility.
   * Programmatically supplied values must be u32 numbers and are validated as
   * such when no classification is present.
   */
  maxNesting: unknown;
  /**
   * Native classification of the `max-nesting` scalar (see
   * {@link DevinPersonaMaxNestingScalar}), captured from the same single
   * frontmatter parse — never a second parse. Present only on definitions
   * produced by `parseDevinPersonaDefinition`; frontmatter constructed
   * programmatically leaves it `undefined`, and validation falls back to a
   * numeric u32 check on the raw `maxNesting` value. In-memory parse state
   * only: nothing here crosses a wire or persisted format.
   */
  maxNestingScalar?: DevinPersonaMaxNestingScalar | undefined;
  /** Raw unknown keys, preserved for lossless round-trips. */
  unknown: Record<string, unknown>;
}

export interface DevinPersonaDefinition {
  /** Effective id: frontmatter `name` when set, else the path id. */
  id: string;
  pathId: string;
  origin: DevinPersonaOrigin;
  /** Absolute file path of the winning definition file. */
  filePath: string;
  frontmatter: DevinPersonaFrontmatter;
  body: string;
  /** Raw frontmatter block (without delimiters), the lossless edit base. */
  rawFrontmatter: string;
}

export type DevinPersonaParseResult =
  | { status: "ok"; definition: DevinPersonaDefinition }
  | { status: "malformed"; reason: string };

/**
 * Minimal frontmatter split: everything between the first `---` pair is YAML;
 * the remainder is the body. Definitions without frontmatter are malformed
 * natively (skipped with a doctor warning) and reported as such.
 */
export function splitDevinPersonaMarkdown(content: string):
  | {
      rawFrontmatter: string;
      body: string;
    }
  | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!match) return undefined;
  return { rawFrontmatter: match[1] ?? "", body: content.slice(match[0].length) };
}

export function parseDevinPersonaDefinition(input: {
  content: string;
  pathId: string;
  filePath: string;
  origin: DevinPersonaOrigin;
}): DevinPersonaParseResult {
  const split = splitDevinPersonaMarkdown(input.content);
  if (!split) {
    return {
      status: "malformed",
      reason: `No YAML frontmatter block; Devin skips this definition at runtime (${input.filePath}).`,
    };
  }
  // One AST parse feeds both the plain record and the native scalar
  // classification — a plain JS parse alone cannot express native u32 scalar
  // semantics (float spellings, tags, and quoting are collapsed).
  const document = parseDocument(split.rawFrontmatter);
  if (document.errors.length > 0) {
    return {
      status: "malformed",
      reason: `Unparseable frontmatter: ${document.errors[0]!.message}`,
    };
  }
  let data: unknown;
  try {
    data = document.toJS();
  } catch (error) {
    return {
      status: "malformed",
      reason: `Unparseable frontmatter: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { status: "malformed", reason: "Frontmatter is not a mapping." };
  }
  const record = data as Record<string, unknown>;
  const known = new Set(["name", "description", "model", "allowed-tools", "tools", "max-nesting"]);
  const unknown: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!known.has(key)) unknown[key] = value;
  }
  const toolsRaw = record["allowed-tools"] ?? record["tools"];
  const allowedTools = Array.isArray(toolsRaw)
    ? toolsRaw.filter((entry): entry is string => typeof entry === "string")
    : [];
  const nestingRaw = record["max-nesting"];
  // Kept raw, not narrowed to a number: non-u32 values must reach validation
  // (native rejects them with CFG005) instead of silently defaulting to 0.
  const definition: DevinPersonaDefinition = {
    id: typeof record.name === "string" && record.name.trim() ? record.name.trim() : input.pathId,
    pathId: input.pathId,
    origin: input.origin,
    filePath: input.filePath,
    frontmatter: {
      name: typeof record.name === "string" ? record.name : undefined,
      description: typeof record.description === "string" ? record.description : undefined,
      model: typeof record.model === "string" ? record.model : undefined,
      allowedTools,
      maxNesting: nestingRaw,
      maxNestingScalar: classifyDevinPersonaMaxNesting(document),
      unknown,
    },
    body: split.body,
    rawFrontmatter: split.rawFrontmatter,
  };
  return { status: "ok", definition };
}

export type DevinPersonaIssueSeverity = "error" | "warning";

export interface DevinPersonaIssue {
  code:
    | "builtin-name-collision"
    | "missing-description"
    | "invalid-max-nesting"
    | "ungrantable-tool"
    | "duplicate-name"
    | "scan-truncated";
  severity: DevinPersonaIssueSeverity;
  message: string;
}

/**
 * Fallback u32 check on the raw parsed value, used only for frontmatter built
 * programmatically (no AST classification available).
 */
function isRawValueU32(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= DEVIN_PERSONA_MAX_NESTING_U32_MAX)
  );
}

/**
 * Validate one definition. Mirrors native semantics: a built-in name
 * collision is skipped with a warning at runtime (so it can never load), a
 * non-u32 `max-nesting` breaks loading (CFG005), and `ask_user_question` can
 * never be granted through `allowed-tools`.
 */
export function validateDevinPersonaDefinition(
  definition: DevinPersonaDefinition,
): readonly DevinPersonaIssue[] {
  const issues: DevinPersonaIssue[] = [];
  if (
    definition.frontmatter.name !== undefined &&
    (DEVIN_BUILTIN_PERSONA_NAMES as readonly string[]).includes(definition.frontmatter.name)
  ) {
    issues.push({
      code: "builtin-name-collision",
      severity: "error",
      message: `Name "${definition.frontmatter.name}" collides with a built-in subagent profile; Devin skips this definition.`,
    });
  }
  if (!definition.frontmatter.description?.trim()) {
    issues.push({
      code: "missing-description",
      severity: "warning",
      message: "No description: the agent cannot meaningfully select this profile.",
    });
  }
  // Native u32 (CFG005 "expected u32"): absent or null-resolving scalars
  // default to 0; only a plain unsigned integer source (decimal or 0x hex) in
  // u32 range loads — quoting, tags, and float spellings are decided by the
  // scalar's source text, captured at parse time in `maxNestingScalar`.
  // Frontmatter built programmatically (no AST) falls back to the numeric
  // check on the raw value.
  const nestingScalar = definition.frontmatter.maxNestingScalar;
  const nestingInvalid = nestingScalar
    ? nestingScalar.kind === "invalid"
    : !isRawValueU32(definition.frontmatter.maxNesting);
  if (nestingInvalid) {
    issues.push({
      code: "invalid-max-nesting",
      severity: "error",
      message:
        "max-nesting must be an integer between 0 and 4294967295 (u32); 0 disables nested spawning.",
    });
  }
  if (definition.frontmatter.allowedTools.includes("ask_user_question")) {
    issues.push({
      code: "ungrantable-tool",
      severity: "warning",
      message: "allowed-tools cannot grant ask_user_question; the native CLI ignores it here.",
    });
  }
  return issues;
}

/**
 * Same-name definitions are never blindly merged: the catalog keeps the
 * highest-precedence definition and reports the shadowed ones.
 */
export function validateDevinPersonaCatalog(
  entries: readonly { definition: DevinPersonaDefinition }[],
): readonly DevinPersonaIssue[] {
  const byId = new Map<string, DevinPersonaDefinition>();
  const issues: DevinPersonaIssue[] = [];
  for (const entry of entries) {
    const existing = byId.get(entry.definition.id);
    if (existing) {
      issues.push({
        code: "duplicate-name",
        severity: "warning",
        message: `Persona "${entry.definition.id}" from ${entry.definition.filePath} is shadowed by ${existing.filePath} (earlier root wins).`,
      });
      continue;
    }
    byId.set(entry.definition.id, entry.definition);
  }
  return issues;
}
