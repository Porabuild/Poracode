import type { ProjectPathRef } from "./parseProjectPathRef";

/** Internal links carry explicit file/folder identity, independent of path heuristics. */
export const AUTO_PATH_FILE_PREFIX = "poracode:path:";
export const AUTO_PATH_FOLDER_PREFIX = "poracode:folder:";
export const AUTO_PATH_FILE_HREF_PREFIX = "https://poracode.local/path/";
export const AUTO_PATH_FOLDER_HREF_PREFIX = "https://poracode.local/folder/";

const VERSIONED_PATH_PREFIX = "v2/";
const VERSIONED_PATH_MARKER_RE = /^v\d+(?:[/?])/;

/**
 * Version 2 keeps the path in its own encoded URL segment and line metadata
 * in query fields. Older links encoded `path[:line[-endLine]]` as one payload,
 * so their file paths remain necessarily heuristic when read back.
 */
export function pathRefUrl(ref: ProjectPathRef): string {
  const prefix = ref.kind === "file" ? AUTO_PATH_FILE_HREF_PREFIX : AUTO_PATH_FOLDER_HREF_PREFIX;
  const query =
    ref.kind === "file" && ref.line !== undefined
      ? `?line=${encodeURIComponent(String(ref.line))}${
          ref.endLine !== undefined ? `&endLine=${encodeURIComponent(String(ref.endLine))}` : ""
        }`
      : "";
  return `${prefix}${VERSIONED_PATH_PREFIX}${encodePath(ref.path)}${query}`;
}

export function parsePathRefUrl(href: string): ProjectPathRef | null {
  const matched = matchPathRefPrefix(href);
  if (!matched) return null;

  const { kind, encoded } = matched;
  if (encoded.startsWith(VERSIONED_PATH_PREFIX)) {
    return parseVersionedPathRef(encoded, kind);
  }
  // A version marker with a different version must not fall through to the
  // legacy suffix heuristic and become an unintended file action.
  if (VERSIONED_PATH_MARKER_RE.test(encoded)) return null;

  // Keep the pre-v2 decoder contract: malformed legacy percent escapes are
  // exposed as their raw payload rather than changing the stored-link meaning.
  const path = decodeComponent(encoded) ?? encoded;
  if (!path) return null;
  if (kind === "folder") return { kind: "folder", path };

  return parseLegacyFileRef(path);
}

function encodePath(path: string): string {
  // Encode parentheses too: even an unmatched one in a filename must be opaque
  // to Markdown's link-destination parser.
  return encodeURIComponent(path).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function decodeComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function matchPathRefPrefix(href: string): { kind: "file" | "folder"; encoded: string } | null {
  if (href.startsWith(AUTO_PATH_FILE_HREF_PREFIX)) {
    return { kind: "file", encoded: href.slice(AUTO_PATH_FILE_HREF_PREFIX.length) };
  }
  if (href.startsWith(AUTO_PATH_FOLDER_HREF_PREFIX)) {
    return { kind: "folder", encoded: href.slice(AUTO_PATH_FOLDER_HREF_PREFIX.length) };
  }
  if (href.startsWith(AUTO_PATH_FILE_PREFIX)) {
    return { kind: "file", encoded: href.slice(AUTO_PATH_FILE_PREFIX.length) };
  }
  if (href.startsWith(AUTO_PATH_FOLDER_PREFIX)) {
    return { kind: "folder", encoded: href.slice(AUTO_PATH_FOLDER_PREFIX.length) };
  }
  return null;
}

function parseVersionedPathRef(encoded: string, kind: "file" | "folder"): ProjectPathRef | null {
  const queryIndex = encoded.indexOf("?");
  const encodedPath = encoded.slice(
    VERSIONED_PATH_PREFIX.length,
    queryIndex < 0 ? undefined : queryIndex,
  );
  if (!encodedPath || encodedPath.includes("#")) return null;

  const path = decodeComponent(encodedPath);
  if (!path) return null;

  if (queryIndex < 0) {
    return { kind, path };
  }
  if (kind === "folder") return null;

  const fields = parseQuery(encoded.slice(queryIndex + 1));
  if (!fields || [...fields.keys()].some((key) => key !== "line" && key !== "endLine")) {
    return null;
  }

  const lineText = fields.get("line");
  const endLineText = fields.get("endLine");
  if (lineText === undefined && endLineText !== undefined) return null;
  if (lineText === undefined) return { kind: "file", path };

  const line = parseLineNumber(lineText);
  if (line === null) return null;
  if (endLineText === undefined) return { kind: "file", path, line };
  const endLine = parseLineNumber(endLineText);
  if (endLine === null) return null;
  return {
    kind: "file",
    path,
    line,
    endLine,
  };
}

function parseQuery(query: string): Map<string, string> | null {
  if (!query) return null;
  const fields = new Map<string, string>();
  for (const field of query.split("&")) {
    const separator = field.indexOf("=");
    if (separator <= 0) return null;
    const key = decodeComponent(field.slice(0, separator));
    const value = decodeComponent(field.slice(separator + 1));
    if (!key || value === null || fields.has(key)) return null;
    fields.set(key, value);
  }
  return fields;
}

function parseLegacyFileRef(path: string): ProjectPathRef {
  const match = path.match(/^(.+):(\d+)(?:-(\d+))?$/);
  return match
    ? {
        kind: "file",
        path: match[1]!,
        line: Number.parseInt(match[2]!, 10),
        ...(match[3] ? { endLine: Number.parseInt(match[3]!, 10) } : {}),
      }
    : { kind: "file", path };
}

function parseLineNumber(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const line = Number(value);
  return Number.isSafeInteger(line) ? line : null;
}
