import path from "node:path";

export function resolveTargetDirectory(
  argv: readonly string[],
  initCwd: string | undefined,
  cwd: string,
) {
  return path.resolve(argv[2] || initCwd || cwd);
}
