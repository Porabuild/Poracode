import { randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

/**
 * The dedicated persistent origin secret that binds forward child-origin
 * ownership (`deriveForwardOwner`) to this host. Deliberately separate from the
 * operator-supplied relay password, which may have low entropy: a public HMAC
 * keyed by that password would enable offline guesses, so ownership is keyed by
 * this 32-byte random secret instead.
 *
 * Storage is a versioned JSON document at `<baseDir>/forward-origin-secret.v1.json`
 * (mode 0600). Rotation changes every derived owner label, so the file is never
 * silently regenerated or upgraded: a corrupt document or an unknown future
 * version fails loudly with the path (never the secret value) and the operator
 * opts into a new identity by deleting the file.
 */
export const FORWARD_ORIGIN_SECRET_FILE = "forward-origin-secret.v1.json";
export const FORWARD_ORIGIN_SECRET_FILE_VERSION = 1;

/** Canonical base64url of exactly 32 random bytes (`randomBytes(32).toString("base64url")`). */
const ORIGIN_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const originSecretFileSchema = z.object({
  version: z.literal(FORWARD_ORIGIN_SECRET_FILE_VERSION),
  originSecret: z.string().regex(ORIGIN_SECRET_PATTERN),
});

function isCanonicalOriginSecret(value: string): boolean {
  if (!ORIGIN_SECRET_PATTERN.test(value)) return false;
  const key = Buffer.from(value, "base64url");
  return key.length === 32 && key.toString("base64url") === value;
}

/** Reads the persisted secret, or `null` when no file exists yet. Anything else
 * that prevents a trustworthy read — unparsable JSON, wrong shape, unknown
 * version, non-canonical secret — throws without echoing file contents. */
function readPersistedOriginSecret(path: string): string | null {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(`The forward origin secret file at ${path} could not be read.`, {
      cause: error,
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(
      `The forward origin secret file at ${path} is corrupt; delete it to provision a new secret.`,
    );
  }
  const result = originSecretFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `The forward origin secret file at ${path} has an unsupported format; delete it to provision a new secret.`,
    );
  }
  if (!isCanonicalOriginSecret(result.data.originSecret)) {
    throw new Error(
      `The forward origin secret file at ${path} does not hold a canonical 32-byte origin secret.`,
    );
  }
  return result.data.originSecret;
}

/**
 * Creates `path` exclusively with the given contents. The temp file is written
 * with 0600 and hard-linked into place, so exactly one concurrent creator wins:
 * a loser sees `EEXIST` from the atomic `link` and must use the winner's file
 * rather than a secret of its own. `link` is atomic on POSIX and NTFS.
 */
function createExclusively(path: string, contents: string): "created" | "exists" {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  const fd = openSync(tmp, "wx", 0o600);
  try {
    writeSync(fd, contents);
    closeSync(fd);
  } catch (error) {
    try {
      closeSync(fd);
    } catch {
      // already closed
    }
    rmSync(tmp, { force: true });
    throw error;
  }
  try {
    linkSync(tmp, path);
    return "created";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return "exists";
    throw error;
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      // best-effort cleanup
    }
  }
}

/**
 * Returns this host's persistent forward origin secret, creating it on first
 * use. Concurrent callers (desktop relaunch overlapping shutdown, headless
 * server plus CLI) converge on the single winner's secret instead of each
 * generating their own. Best-effort tightens the file to 0600 on read so a
 * profile copied with looser permissions is repaired rather than persisted.
 */
export function readOrCreateForwardOriginSecret(baseDir: string): string {
  const path = join(baseDir, FORWARD_ORIGIN_SECRET_FILE);
  const existing = readPersistedOriginSecret(path);
  if (existing) {
    try {
      chmodSync(path, 0o600);
    } catch {
      // Non-POSIX filesystems ignore the mode; the data dir's own permissions
      // remain the boundary (same trust model as the headless secret key).
    }
    return existing;
  }

  const originSecret = randomBytes(32).toString("base64url");
  const contents = `${JSON.stringify(
    { version: FORWARD_ORIGIN_SECRET_FILE_VERSION, originSecret },
    null,
    2,
  )}\n`;
  if (createExclusively(path, contents) === "exists") {
    // Another process provisioned the secret while we generated ours.
    const winner = readPersistedOriginSecret(path);
    if (winner) return winner;
  }
  return originSecret;
}
