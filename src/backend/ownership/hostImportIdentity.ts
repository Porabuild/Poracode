import { statSync, type Stats } from "node:fs";
import { join } from "node:path";
import type { HostRootPaths } from "./hostRootPaths";

function existingIdentity(path: string): Stats | undefined {
  try {
    return statSync(path);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
      return undefined;
    throw error;
  }
}

/** Path canonicalization cannot distinguish bind mounts. Inspect identities
 * without opening any descriptor on a protected or SQLite-locked file. */
export function assertDistinctHostImportSource(paths: HostRootPaths, source: string): void {
  const roots = [paths.profileNamespace, paths.dataRoot, paths.electronUserDataRoot];
  const directory = statSync(source);
  const database = statSync(join(source, "state.sqlite"));
  const comparisons = [
    { source: directory, protected: roots },
    {
      source: database,
      protected: [...roots.map((root) => join(root, "state.sqlite")), paths.leasePath],
    },
  ];
  for (const comparison of comparisons) {
    for (const path of comparison.protected) {
      const target = existingIdentity(path);
      if (target && target.dev === comparison.source.dev && target.ino === comparison.source.ino) {
        throw new Error(
          "Offline backup physically aliases protected Poracode state; copy it to an independent directory first.",
        );
      }
    }
  }
}
