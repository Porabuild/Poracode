import { isAbsolute, relative } from "node:path";

/** Lexical containment; callers resolve filesystem links before using it. */
export function relativePathInside(
  root: string,
  target: string,
  paths: Pick<typeof import("node:path"), "relative" | "isAbsolute"> = { relative, isAbsolute },
): string | undefined {
  const candidate = paths.relative(root, target);
  if (!candidate || paths.isAbsolute(candidate) || candidate.split(/[\\/]/u)[0] === "..") {
    return undefined;
  }
  return candidate;
}
