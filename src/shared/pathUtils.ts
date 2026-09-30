/** Last path segment, handling both forward-slash and backslash separators. */
export function getBasename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/**
 * Whether two paths name the same folder. A trailing separator and the choice
 * of `\` or `/` are cosmetic everywhere; case is not. Windows folder paths are
 * case-insensitive, POSIX ones are not — a case-sensitive volume genuinely has
 * `/home/u/Repo` and `/home/u/repo` as two different folders — so the caller
 * passes the rule in. It has to, because this same comparison runs in the main
 * process, where the rule comes from `process.platform`, and in the renderer,
 * where it comes from the bridge's `isWindows()`. Two copies of it drifted
 * apart once already.
 */
export function isSameFolderPath(
  left: string | undefined,
  right: string | undefined,
  caseInsensitive: boolean,
): boolean {
  if (!left || !right) return false;
  const normalize = (value: string) => value.replace(/[\\/]+$/u, "").replace(/\\/gu, "/");
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  return caseInsensitive
    ? normalizedLeft.localeCompare(normalizedRight, undefined, { sensitivity: "accent" }) === 0
    : normalizedLeft === normalizedRight;
}

/** Splits "src/main/db.ts" into { dirWithSlash: "src/main/", basename: "db.ts" }. */
export function splitPath(path: string): { dirWithSlash: string; basename: string } {
  const m = path.match(/^(.*[\\/])?([^\\/]*)$/);
  return { dirWithSlash: m?.[1] ?? "", basename: m?.[2] ?? path };
}
