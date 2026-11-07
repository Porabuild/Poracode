import { fileNameFromPath } from "./promptContent";
import { chatVideoFilePath } from "./chatVideo";
import { getBasename } from "./pathUtils";

export interface ChatFileSource {
  src: string;
  name?: string;
  mimeType?: string;
}

/**
 * Artifact extensions a plain markdown `[…](…)` link may render as a download
 * card. Source-looking references (.ts/.js/.md/…) stay editor path chips;
 * canonical typed file blocks bypass this list because they explicitly declare
 * a file.
 */
const CHAT_DOWNLOAD_EXTENSIONS = new Set([
  "zip",
  "tar",
  "gz",
  "tgz",
  "bz2",
  "xz",
  "7z",
  "rar",
  "pdf",
  "doc",
  "docx",
  "odt",
  "rtf",
  "ppt",
  "pptx",
  "odp",
  "xls",
  "xlsx",
  "ods",
  "csv",
  "tsv",
  "epub",
  "txt",
  "apk",
  "aab",
  "ipa",
  "dmg",
  "pkg",
  "exe",
  "msi",
  "deb",
  "rpm",
]);

function fileExtension(path: string): string {
  const name = fileNameFromPath(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Artifact-extension classification for plain markdown links. */
export function isChatDownloadPath(path: string, mimeType?: string): boolean {
  if (mimeType === "application/octet-stream" || mimeType === "application/pdf") return true;
  return CHAT_DOWNLOAD_EXTENSIONS.has(fileExtension(path));
}

/**
 * Safety gate for a file card source — independent of artifact classification.
 * Permits bare filesystem paths (Windows drives, POSIX, UNC) plus `file://`
 * and canonical `poracode-local://local/` URLs only; never a foreign
 * canonical authority, an opaque scheme (javascript:/data:/blob:), or a
 * web URL, which keeps its external-link behavior.
 */
export function isChatFileSource(src: string): boolean {
  if (!src) return false;
  for (const char of src) {
    const code = char.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) return false;
  }
  if (/^[a-z][a-z\d+.-]*:/iu.test(src) && !/^[a-z]:[\\/]/iu.test(src)) {
    // UNC shares legitimately carry a `file://` host; only the canonical
    // scheme pins its authority to `local`.
    if (!/^(file:\/\/|poracode-local:\/\/local(?:[/?#]|$))/iu.test(src)) return false;
  }
  return true;
}

/**
 * Decoded local filesystem path for a safe file source, exactly once —
 * literal raw percent signs in on-disk names are preserved, never double
 * decoded. Returns undefined for malformed URL encodings and unsafe refs.
 */
export function chatFileLocalPath(src: string): string | undefined {
  if (!isChatFileSource(src)) return undefined;
  return chatVideoFilePath(src);
}

/** A plain-markdown file card: safe local ref AND an artifact-type path. */
export function isChatDownloadSource(src: string, mimeType?: string): boolean {
  const path = chatFileLocalPath(src);
  return path !== undefined && isChatDownloadPath(path, mimeType);
}

/** Display basename for a card: the decoded name, never raw URL encoding. */
export function chatFileName(src: string, name?: string): string {
  const explicit = name?.trim();
  if (explicit) return explicit;
  const path = chatFileLocalPath(src) ?? src;
  return getBasename(path) || path;
}
