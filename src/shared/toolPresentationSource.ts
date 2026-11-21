import {
  emptyToolTextPart,
  isStructuredJsonText,
  prettyStructuredJson,
  safeToolJson,
  toolTextPart,
  type ToolTextPart,
} from "./toolTextFormatting";
import { stripAnsiPreservingLayout } from "./ansi";

/** Read-only paths into canonical data; presentation never copies large bodies. */
export type ToolValuePath = readonly (string | number)[];

export interface ToolValueSource {
  readonly root: "payload" | "streams";
  readonly path: ToolValuePath;
  readonly format: "value" | "json" | "text-list" | "terminal";
  readonly accept?: "string" | "non-string" | "scalar" | "object" | undefined;
  /** Generic projection of each array element, only for `text-list`. */
  readonly eachPath?: ToolValuePath | undefined;
}

export type ToolTextSource =
  | ToolValueSource
  | { readonly firstNonempty: readonly ToolValueSource[] };

export interface ToolPresentationDocument {
  readonly payload?: unknown;
  readonly streams?: Readonly<Record<string, string>>;
}

export function resolveToolTextSource(
  source: ToolTextSource,
  document: ToolPresentationDocument,
): ToolTextPart {
  if ("firstNonempty" in source) {
    for (const alternative of source.firstNonempty) {
      const part = resolveValueSource(alternative, document);
      if (part.text.length > 0) return part;
    }
    return emptyToolTextPart();
  }
  return resolveValueSource(source, document);
}

/** Own properties include framework reactive proxies, but exclude prototypes. */
export function readToolValuePath(value: unknown, path: ToolValuePath): unknown {
  for (const key of path) {
    if (Array.isArray(value)) {
      const index = typeof key === "number" ? key : Number(key);
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= value.length ||
        String(index) !== String(key)
      )
        return undefined;
      value = value[index];
      continue;
    }
    if (value === null || typeof value !== "object" || !Object.hasOwn(value, key)) return undefined;
    value = (value as Record<string | number, unknown>)[key];
  }
  return value;
}

function resolveValueSource(
  source: ToolValueSource,
  document: ToolPresentationDocument,
): ToolTextPart {
  const value = readToolValuePath(document[source.root], source.path);
  if (value === undefined || value === null || !accepts(value, source.accept))
    return emptyToolTextPart();
  if (source.format === "terminal")
    return typeof value === "string"
      ? { text: stripAnsiPreservingLayout(value), language: "plain" }
      : emptyToolTextPart();
  if (source.format === "text-list") {
    if (!Array.isArray(value)) return emptyToolTextPart();
    const parts = value.flatMap((element) => {
      const text = readToolValuePath(element, source.eachPath ?? []);
      return typeof text === "string" && text.length > 0 ? [prettyStructuredJson(text)] : [];
    });
    return parts.length === 0
      ? emptyToolTextPart()
      : {
          text: parts.join("\n\n"),
          language: parts.every(isStructuredJsonText) ? "json" : "plain",
        };
  }
  if (source.format === "json") return { text: safeToolJson(value), language: "json" };
  if (typeof value === "object") return { text: safeToolJson(value), language: "json" };
  return typeof value === "string"
    ? toolTextPart(prettyStructuredJson(value))
    : {
        text: String(value),
        language: "plain",
      };
}

function accepts(value: unknown, kind: ToolValueSource["accept"]): boolean {
  switch (kind) {
    case "string":
      return typeof value === "string";
    case "non-string":
      return typeof value !== "string";
    case "scalar":
      return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
    case "object":
      return typeof value === "object";
    case undefined:
      return true;
  }
}
