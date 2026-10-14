import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import type { PoracodePaths } from "@/shared/poracodePaths";

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
export function saveUploadedAttachmentFile(
  paths: PoracodePaths,
  payload: { threadId: string; data: Uint8Array; fileName: string },
): string {
  const threadDir = getThreadAttachmentDir(paths, payload.threadId);
  mkdirSync(threadDir, { recursive: true });
  const sanitizedName = Array.from(sanitizeAttachmentPathPart(payload.fileName))
    .map((character) => (character.charCodeAt(0) < 32 ? "-" : character))
    .join("")
    .replace(/[. ]+$/g, "")
    .slice(0, 160);
  const originalName = sanitizedName || "attachment";
  const extension = extname(originalName);
  const stem = originalName.slice(0, originalName.length - extension.length) || "attachment";
  let filePath = join(threadDir, originalName);
  let suffix = 2;
  while (existsSync(filePath)) {
    filePath = join(threadDir, `${stem} (${suffix})${extension}`);
    suffix += 1;
  }
  writeFileSync(filePath, payload.data);
  return filePath;
}
