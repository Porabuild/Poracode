import { constants } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import {
  ENVIRONMENT_STORE_FORMAT_VERSION,
  ENVIRONMENT_STORE_MAX_ENVIRONMENTS,
  ENVIRONMENT_STORE_MAX_FILE_BYTES,
  environmentStoreFileSchema,
  type EnvironmentRecord,
} from "@/shared/environments";
import { EnvironmentStoreFormatError, EnvironmentStoreLimitError } from "./environmentStoreErrors";

/** The host-owned environment store lives at the leased data root. */
export const ENVIRONMENT_STORE_FILE_NAME = "environments.json";

export function environmentsFilePath(dataRoot: string): string {
  return join(dataRoot, ENVIRONMENT_STORE_FILE_NAME);
}

// A regular file may be replaced by a FIFO before open. Nonblocking admission
// reaches stat without waiting for a peer; a pre-stat check alone would race.
// Node does not expose O_NONBLOCK on Windows, which has no filesystem FIFOs.
const READ_FLAGS = constants.O_RDONLY | (process.platform === "win32" ? 0 : constants.O_NONBLOCK);

/**
 * Read `environments.json` with a hard byte bound. Returns `undefined` for a
 * missing file (an empty store). A file over {@link ENVIRONMENT_STORE_MAX_FILE_BYTES}
 * refuses with a typed limit error before any unbounded allocation; a
 * non-regular file refuses as corrupt. The file is never modified here.
 */
export async function readEnvironmentStoreFileText(path: string): Promise<string | undefined> {
  let file: FileHandle;
  try {
    file = await open(path, READ_FLAGS);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw new EnvironmentStoreFormatError("corrupt");
    if (stat.size > ENVIRONMENT_STORE_MAX_FILE_BYTES) {
      throw new EnvironmentStoreLimitError("file-bytes", ENVIRONMENT_STORE_MAX_FILE_BYTES);
    }
    const bytes = Buffer.alloc(Math.min(stat.size, ENVIRONMENT_STORE_MAX_FILE_BYTES) + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset);
      if (bytesRead === 0) return bytes.subarray(0, offset).toString("utf8");
      offset += bytesRead;
    }
    // Filling the extra byte means the file grew past the bound after the stat.
    throw new EnvironmentStoreLimitError("file-bytes", ENVIRONMENT_STORE_MAX_FILE_BYTES);
  } finally {
    await file.close();
  }
}

/**
 * Refuse anything a correct writer cannot have produced: duplicate environment
 * ids, or one legacy connection id adopted by two environments (which would
 * silently merge two child data mappings).
 */
function assertIdentityInvariants(records: readonly EnvironmentRecord[]): void {
  const environmentIds = new Set<string>();
  const legacyConnectionIds = new Set<string>();
  for (const record of records) {
    if (environmentIds.has(record.environmentId)) {
      throw new EnvironmentStoreFormatError("corrupt");
    }
    environmentIds.add(record.environmentId);
    for (const legacyConnectionId of record.legacyConnectionIds) {
      if (legacyConnectionIds.has(legacyConnectionId)) {
        throw new EnvironmentStoreFormatError("corrupt");
      }
      legacyConnectionIds.add(legacyConnectionId);
    }
  }
}

/**
 * Parse `environments.json`. Format 1 is the only readable generation; an
 * absent/unknown marker, a malformed record, or an invariant violation is
 * `corrupt`. A numeric marker greater than 1 is `future-format`. A registry
 * over {@link ENVIRONMENT_STORE_MAX_ENVIRONMENTS} refuses with a typed limit
 * error. Every refusal leaves the file untouched.
 */
export function parseEnvironmentStoreFile(text: string): readonly EnvironmentRecord[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new EnvironmentStoreFormatError("corrupt");
  }
  const formatVersion =
    typeof raw === "object" && raw !== null && "formatVersion" in raw
      ? (raw as { formatVersion: unknown }).formatVersion
      : undefined;
  if (typeof formatVersion === "number" && Number.isFinite(formatVersion) && formatVersion > 1) {
    throw new EnvironmentStoreFormatError("future-format");
  }
  if (formatVersion !== ENVIRONMENT_STORE_FORMAT_VERSION) {
    throw new EnvironmentStoreFormatError("corrupt");
  }
  if (
    typeof raw === "object" &&
    raw !== null &&
    "environments" in raw &&
    Array.isArray((raw as { environments: unknown }).environments) &&
    (raw as { environments: unknown[] }).environments.length > ENVIRONMENT_STORE_MAX_ENVIRONMENTS
  ) {
    throw new EnvironmentStoreLimitError("environment-count", ENVIRONMENT_STORE_MAX_ENVIRONMENTS);
  }
  const parsed = environmentStoreFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new EnvironmentStoreFormatError("corrupt");
  }
  assertIdentityInvariants(parsed.data.environments);
  return parsed.data.environments;
}

/** Deterministic, validated serialization of a complete store generation. */
export function serializeEnvironmentStoreFile(records: readonly EnvironmentRecord[]): string {
  const environments = [...records].sort((left, right) =>
    left.environmentId < right.environmentId
      ? -1
      : left.environmentId > right.environmentId
        ? 1
        : 0,
  );
  const file = environmentStoreFileSchema.parse({
    formatVersion: ENVIRONMENT_STORE_FORMAT_VERSION,
    environments,
  });
  return `${JSON.stringify(file, null, 2)}\n`;
}
