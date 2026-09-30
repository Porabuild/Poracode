/** Last path segment, handling both forward-slash and backslash separators. */
export function getBasename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** True when `path` points at a Markdown file the editor can preview. */
export function isMarkdownFile(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return ext === "md" || ext === "mdx";
}

/** Splits "src/main/db.ts" into { dirWithSlash: "src/main/", basename: "db.ts" }. */
export function splitPath(path: string): { dirWithSlash: string; basename: string } {
  const m = path.match(/^(.*[\\/])?([^\\/]*)$/);
  return { dirWithSlash: m?.[1] ?? "", basename: m?.[2] ?? path };
}
