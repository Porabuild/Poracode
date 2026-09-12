import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { resolvePoracodePaths, type PoracodePaths } from "@/shared/poracodePaths";

const PERSISTED_STAGING_ATTACHMENT_PREFIXES = ["draft-", "remote-", "handoff-"] as const;

function ensureBaseDirectories(paths: PoracodePaths): void {
  mkdirSync(paths.baseDir, { recursive: true });
  mkdirSync(paths.worktreesDir, { recursive: true });
  mkdirSync(paths.attachmentsDir, { recursive: true });
  mkdirSync(paths.logsDir, { recursive: true });
  mkdirSync(paths.cacheDir, { recursive: true });
}

export function preparePoracodeDataRoot(baseDir?: string): PoracodePaths {
  const paths = resolvePoracodePaths(baseDir);
  ensureBaseDirectories(paths);
  return paths;
}

/**
 * Remove attachment subdirectories that don't belong to any known thread.
 * Call after the database is initialized.
 */
export function cleanupOrphanedAttachments(attachmentsDir: string, validThreadIds: string[]): void {
  if (!existsSync(attachmentsDir)) return;

  const validDirNames = new Set(validThreadIds.map((id) => id.replace(/:/g, "-").slice(0, 12)));

  let entries: string[];
  try {
    entries = readdirSync(attachmentsDir);
  } catch (error) {
    console.warn("[attachments] failed to read attachments directory for cleanup:", error);
    return;
  }

  for (const entry of entries) {
    // Composer attachments may be staged before a durable thread id exists.
    // Their directory keeps the sanitized staging id (`draft:…`, projected
    // `remote:…`, or `handoff:…`) even after the resulting user message is
    // persisted. Keep those directories because the message and provider turn
    // continue to reference the original absolute file path.
    if (PERSISTED_STAGING_ATTACHMENT_PREFIXES.some((prefix) => entry.startsWith(prefix))) {
      continue;
    }
    if (!validDirNames.has(entry)) {
      rmSync(join(attachmentsDir, entry), { recursive: true, force: true });
    }
  }
}
