import { createHash } from "node:crypto";
import { mkdirSync, realpathSync } from "node:fs";
import { basename, join } from "node:path";

/** Bind a new managed session to its evidence run without deleting prior owners. */
export function reserveQualificationSessionRoot(input: {
  readonly parent: string;
  readonly armRoot: string;
  readonly cellId: string;
  readonly evidenceDir: string;
}): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(input.cellId)) {
    throw new Error("Invalid qualification cell id");
  }
  const run = createHash("sha256")
    .update(realpathSync(input.evidenceDir))
    .digest("hex")
    .slice(0, 16);
  const arm = basename(input.armRoot)
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .slice(0, 80);
  if (!arm) throw new Error("Missing qualification arm name");
  const sessionRoot = join(input.parent, `${arm}-${input.cellId}-${run}`);
  mkdirSync(input.parent, { recursive: true });
  // EEXIST is an admission failure, including a symlink or an unfinished owner.
  // A changed label or repeated invocation never authorizes removing evidence.
  mkdirSync(sessionRoot, { mode: 0o700 });
  return sessionRoot;
}
