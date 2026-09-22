import { join, resolve } from "node:path";
import { z } from "zod";
import { readBoundedRuntimeFile } from "@/shared/readBoundedRuntimeFile";
import { runtimeDigestSchema, RUNTIME_MANIFEST_MAX_BYTES } from "@/shared/runtimeCodeManifest";
import { RUNTIME_BUILD_SOURCE_HASH } from "@/shared/runtimeBuildIdentity";
import { regularArchiveExistsAsync, sha256FileAsync } from "./runtimeBundleFilesAsync";
import { sshRuntimeVersion, type SshRuntimeBundle } from "./runtimeBundleShared";

/**
 * Manifest for the preassembled immutable SSH runtime archive (C3/S3).
 *
 * The release pipeline writes this next to the archive it staged from the
 * current runtime declaration. The loader refuses to guess:
 * - a manifest that exists but is malformed or of an unknown generation is a
 *   loud packaging failure (it must never be silently ignored);
 * - `sourceHash` must equal this build's runtime declaration, otherwise the
 *   archive is *stale* and the caller rebuilds in the worker;
 * - the archive must be a regular file whose bytes hash to `archiveSha256`.
 *
 * `hash` is the staged-directory hash the remote install/launch protocol uses;
 * it cannot be recomputed from the archive bytes, so the archive bytes are
 * pinned separately by `archiveSha256`.
 */
export const SSH_RUNTIME_ARCHIVE_MANIFEST_VERSION = 1 as const;
export const SSH_RUNTIME_ARCHIVE_MANIFEST_FILE = "manifest.json";
/** Bounded integrity read for the archive bytes (64 MiB). */
export const SSH_RUNTIME_ARCHIVE_MAX_BYTES = 64 * 1024 * 1024;

const manifestSchema = z.strictObject({
  formatVersion: z.literal(SSH_RUNTIME_ARCHIVE_MANIFEST_VERSION),
  archive: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u),
  hash: runtimeDigestSchema,
  archiveSha256: runtimeDigestSchema,
  sourceHash: runtimeDigestSchema,
});

export interface PreassembledSshRuntimeArchiveResult {
  readonly bundle: SshRuntimeBundle | null;
  /** Present when the archive exists but does not match this build. */
  readonly staleReason?: string;
}

/**
 * Resolve the immutable release archive for this build.
 *
 * `null` means the release pipeline did not ship one (development checkout), or
 * shipped one built from different sources; either way the caller stages the
 * bundle in the worker. Malformed or byte-mismatched archives never fall back
 * silently.
 */
export async function readPreassembledSshRuntimeArchive(
  archiveDir: string | undefined,
  signal?: AbortSignal,
): Promise<PreassembledSshRuntimeArchiveResult> {
  if (!archiveDir) return { bundle: null };
  let raw: Buffer;
  try {
    raw = await readBoundedRuntimeFile(
      join(archiveDir, SSH_RUNTIME_ARCHIVE_MANIFEST_FILE),
      RUNTIME_MANIFEST_MAX_BYTES,
      signal,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { bundle: null };
    throw error;
  }
  const manifest = manifestSchema.parse(JSON.parse(raw.toString("utf8")) as unknown);
  if (manifest.sourceHash !== RUNTIME_BUILD_SOURCE_HASH) {
    return {
      bundle: null,
      staleReason: `Preassembled SSH runtime archive was built from ${manifest.sourceHash}.`,
    };
  }
  const archivePath = resolve(archiveDir, manifest.archive);
  if (!(await regularArchiveExistsAsync(archivePath))) {
    throw new Error("Preassembled SSH runtime archive is missing its archive file.");
  }
  const digest = await sha256FileAsync(archivePath, SSH_RUNTIME_ARCHIVE_MAX_BYTES, signal);
  if (digest !== manifest.archiveSha256) {
    throw new Error("Preassembled SSH runtime archive does not match its manifest.");
  }
  return {
    bundle: { archivePath, hash: manifest.hash, version: sshRuntimeVersion() },
  };
}
