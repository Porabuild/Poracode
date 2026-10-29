import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import type { PoracodePaths } from "@/shared/poracodePaths";

const pendingDirectories = new Map<string, number>();

/** Keep pre-creation copies owned until their thread row is committed. */
export function retainThreadAttachmentDirectory(threadId: string): () => void {
  const name = getThreadAttachmentDirName(threadId);
  pendingDirectories.set(name, (pendingDirectories.get(name) ?? 0) + 1);
  return () => {
    const remaining = pendingDirectories.get(name)! - 1;
    if (remaining === 0) pendingDirectories.delete(name);
    else pendingDirectories.set(name, remaining);
  };
}

export function pendingAttachmentDirectoryNames(): Iterable<string> {
  return pendingDirectories.keys();
}

export function sanitizeAttachmentPathPart(value: string): string {
  return value.replace(/[<>:"/\\|?*]/g, "-");
}

/** Shared by writers and reclamation. Preserve the existing on-disk naming format. */
export function getThreadAttachmentDirName(threadId: string): string {
  const pathPart = sanitizeAttachmentPathPart(threadId).slice(0, 12);
  return pathPart === "." || pathPart === ".." ? "--" : pathPart;
}

export function getThreadAttachmentDir(paths: PoracodePaths, threadId: string): string {
  return join(paths.attachmentsDir, getThreadAttachmentDirName(threadId));
}

/** Persist a browser-selected file under the host's attachment root. */
export async function saveUploadedAttachmentFile(
  paths: PoracodePaths,
  payload: { threadId: string; data: Uint8Array; fileName: string },
): Promise<string> {
  const release = retainThreadAttachmentDirectory(payload.threadId);
  try {
    const threadDir = getThreadAttachmentDir(paths, payload.threadId);
    await mkdir(threadDir, { recursive: true });
    const sanitizedName = Array.from(sanitizeAttachmentPathPart(payload.fileName))
      .map((character) => (character.charCodeAt(0) < 32 ? "-" : character))
      .join("")
      .replace(/[. ]+$/g, "")
      .slice(0, 160);
    const originalName = sanitizedName || "attachment";
    const extension = extname(originalName);
    const stem = originalName.slice(0, originalName.length - extension.length) || "attachment";
    // Exclusive-create keeps the unique-name guarantee under concurrent saves
    // now that the write no longer serializes on the event loop.
    for (let suffix = 1; ; suffix += 1) {
      const filePath =
        suffix === 1
          ? join(threadDir, originalName)
          : join(threadDir, `${stem} (${suffix})${extension}`);
      try {
        await writeFile(filePath, payload.data, { flag: "wx" });
        return filePath;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
  } finally {
    release();
  }
}
