import type { ProjectPathRef } from "./parseProjectPathRef";

/** Internal links carry explicit file/folder identity, independent of path heuristics. */
export const AUTO_PATH_FILE_PREFIX = "poracode:path:";
export const AUTO_PATH_FOLDER_PREFIX = "poracode:folder:";
export const AUTO_PATH_FILE_HREF_PREFIX = "https://poracode.local/path/";
export const AUTO_PATH_FOLDER_HREF_PREFIX = "https://poracode.local/folder/";

export function pathRefUrl(ref: ProjectPathRef): string {
  const target =
    ref.kind === "file"
      ? `${ref.path}${
          ref.line !== undefined
            ? `:${ref.line}${ref.endLine !== undefined ? `-${ref.endLine}` : ""}`
            : ""
        }`
      : ref.path;
  // Encode parentheses too: even an unmatched one in a filename must be opaque
  // to Markdown's link-destination parser.
  const encoded = encodeURIComponent(target).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${ref.kind === "file" ? AUTO_PATH_FILE_HREF_PREFIX : AUTO_PATH_FOLDER_HREF_PREFIX}${encoded}`;
}

export function parsePathRefUrl(href: string): ProjectPathRef | null {
  const prefix = [
    AUTO_PATH_FILE_HREF_PREFIX,
    AUTO_PATH_FOLDER_HREF_PREFIX,
    AUTO_PATH_FILE_PREFIX,
    AUTO_PATH_FOLDER_PREFIX,
  ].find((candidate) => href.startsWith(candidate));
  if (!prefix) return null;
  const encoded = href.slice(prefix.length);
  let path: string;
  try {
    path = decodeURIComponent(encoded);
  } catch {
    path = encoded;
  }
  if (!path) return null;
  if (prefix === AUTO_PATH_FOLDER_HREF_PREFIX || prefix === AUTO_PATH_FOLDER_PREFIX) {
    return { kind: "folder", path };
  }
  const match = path.match(/^(.+):(\d+)(?:-(\d+))?$/);
  return match
    ? {
        kind: "file",
        path: match[1]!,
        line: Number.parseInt(match[2]!, 10),
        ...(match[3] ? { endLine: Number.parseInt(match[3], 10) } : {}),
      }
    : { kind: "file", path };
}
