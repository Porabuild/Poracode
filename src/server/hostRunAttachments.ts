import { constants, type BigIntStats } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import { deriveLocationFromPath } from "@/shared/createProject";
import { HOST_RUN_MAX_FILES, HOST_RUN_MAX_FILE_BYTES } from "@/shared/contracts/hostRun";

type FileIdentity = Pick<BigIntStats, "dev" | "ino" | "size" | "mtimeNs" | "ctimeNs">;
export interface RunAttachmentSource {
  path: string;
  identity: FileIdentity;
}

function identity(info: FileIdentity): FileIdentity {
  const { dev, ino, size, mtimeNs, ctimeNs } = info;
  return { dev, ino, size, mtimeNs, ctimeNs };
}
function sameFile(left: FileIdentity, right: FileIdentity): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}
async function openFile(path: string, assertActive: () => void) {
  assertActive();
  if (!isAbsolute(path) || deriveLocationFromPath(path, process.platform).kind === "wsl")
    throw new Error(
      "Run files must be absolute native paths on this host; no WSL fallback was attempted.",
    );
  const link = await lstat(path, { bigint: true });
  assertActive();
  if (!link.isFile())
    throw new Error("Run files must be regular files, not symlinks or directories.");
  const file = await open(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | constants.O_NONBLOCK,
  );
  try {
    assertActive();
    const info = await file.stat({ bigint: true });
    assertActive();
    if (!info.isFile() || !sameFile(link, info))
      throw new Error("A run file changed during opening. Prepare the run again.");
    return { file, info };
  } catch (error) {
    await file.close();
    throw error;
  }
}

export async function inspectRunAttachments(
  files: readonly string[],
  assertActive: () => void,
): Promise<RunAttachmentSource[]> {
  if (!files.length || files.length > HOST_RUN_MAX_FILES)
    throw new Error(`Attach from 1 to ${HOST_RUN_MAX_FILES} files per run.`);
  const sources: RunAttachmentSource[] = [];
  let total = 0n;
  for (const path of files) {
    const { file, info } = await openFile(path, assertActive);
    try {
      total += info.size;
      if (total > BigInt(HOST_RUN_MAX_FILE_BYTES))
        throw new Error("Run files exceed the 20 MiB total limit. Select fewer or smaller files.");
      sources.push({ path, identity: identity(info) });
    } finally {
      await file.close();
    }
  }
  assertActive();
  return sources;
}

export async function readRunAttachments(
  sources: readonly RunAttachmentSource[],
  assertActive: () => void,
): Promise<Array<{ fileName: string; data: Buffer }>> {
  const uploads: Array<{ fileName: string; data: Buffer }> = [];
  let total = 0n;
  for (const source of sources) {
    const { file, info } = await openFile(source.path, assertActive);
    try {
      if (!sameFile(source.identity, info))
        throw new Error("A selected run file changed after preparation. Prepare the run again.");
      total += info.size;
      if (total > BigInt(HOST_RUN_MAX_FILE_BYTES))
        throw new Error("Run files exceed the 20 MiB total limit. Select fewer or smaller files.");
      const data = Buffer.allocUnsafe(Number(info.size));
      let offset = 0;
      while (offset < data.length) {
        assertActive();
        const { bytesRead } = await file.read(data, offset, data.length - offset, offset);
        assertActive();
        if (!bytesRead) break;
        offset += bytesRead;
      }
      const after = await file.stat({ bigint: true });
      assertActive();
      if (offset !== data.length || !sameFile(source.identity, after))
        throw new Error("A selected run file changed while reading. Prepare the run again.");
      uploads.push({ fileName: basename(source.path), data });
    } finally {
      await file.close();
    }
  }
  assertActive();
  return uploads;
}
