import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { WslStagingFileRequest } from "./protocol";

/**
 * Content identity for a staged file set. The hash names the deploy
 * directory, so identical bytes share one install and different bytes can
 * never collide into (or overwrite) each other. Async-only: the synchronous
 * variant existed for the removed synchronous deploy path.
 */
export async function stagingContentKeyAsync(
  files: readonly WslStagingFileRequest[],
): Promise<string> {
  const digest = createHash("sha256");
  for (const file of ordered(files)) {
    digest.update(file.relDest);
    digest.update("\0");
    digest.update(await readFile(file.src));
    digest.update("\0");
  }
  return digest.digest("hex");
}

function ordered(files: readonly WslStagingFileRequest[]): WslStagingFileRequest[] {
  return [...files].sort((left, right) =>
    left.relDest < right.relDest ? -1 : left.relDest > right.relDest ? 1 : 0,
  );
}
