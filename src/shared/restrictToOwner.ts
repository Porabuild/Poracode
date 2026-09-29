import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { windowsSystemTool } from "./windowsSystemTool";

/**
 * POSIX file modes (0o600/0o700) are a silent no-op on Windows, where access is
 * governed by inherited ACLs. `restrictToOwner` closes that gap: on win32 it
 * strips inheritance and grants full control to the current user's SID only.
 * On every other platform it does nothing (the mode bits already apply).
 *
 * The SID comes from `whoami /user`, is resolved once, and reaches `icacls` as
 * an argv element only; nothing is ever interpolated into a shell.
 */

export const RESTRICT_TO_OWNER_TIMEOUT_MS = 10_000;

const SID_PATTERN = /S-1-\d+(?:-\d+)+/u;

/** Synchronous argv-only exec seam; returns stdout, throws on failure/timeout. */
export type OwnerAclExec = (
  file: string,
  args: readonly string[],
  options: { readonly timeout: number },
) => string;

export interface RestrictToOwnerDeps {
  readonly platform?: NodeJS.Platform;
  readonly exec?: OwnerAclExec;
  readonly isDirectory?: (path: string) => boolean;
}

export interface RestrictToOwnerOptions {
  /** Apply `/T` so existing children are rewritten too (directories only). */
  readonly recursive?: boolean;
}

export type RestrictToOwnerStage = "resolve-sid" | "icacls";

/** Typed failure callers can report; never carries file contents. */
export class RestrictToOwnerError extends Error {
  readonly code = "OWNER_ACL_FAILED";

  constructor(
    readonly path: string,
    readonly stage: RestrictToOwnerStage,
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(message, options);
    this.name = "RestrictToOwnerError";
  }
}

export const defaultOwnerAclExec: OwnerAclExec = (file, args, options) =>
  execFileSync(file, [...args], {
    encoding: "utf8",
    timeout: options.timeout,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

let cachedOwnerSid: string | undefined;

/** Test seam: forget the process-wide SID cache. */
export function resetOwnerSidCacheForTests(): void {
  cachedOwnerSid = undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Current user's SID via `whoami /user /fo csv /nh`, cached for the process. */
export function resolveCurrentUserSid(exec: OwnerAclExec = defaultOwnerAclExec): string {
  if (cachedOwnerSid !== undefined) return cachedOwnerSid;
  let output: string;
  try {
    output = exec(windowsSystemTool("whoami"), ["/user", "/fo", "csv", "/nh"], {
      timeout: RESTRICT_TO_OWNER_TIMEOUT_MS,
    });
  } catch (error) {
    throw new RestrictToOwnerError(
      "",
      "resolve-sid",
      `Could not resolve the current user SID: ${messageOf(error)}`,
      { cause: error },
    );
  }
  const sid = SID_PATTERN.exec(output)?.[0];
  if (sid === undefined) {
    throw new RestrictToOwnerError(
      "",
      "resolve-sid",
      "Could not resolve the current user SID: whoami returned no SID.",
    );
  }
  cachedOwnerSid = sid;
  return sid;
}

function pathIsDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Restrict `path` to the current user. No-op off Windows; throws a
 * `RestrictToOwnerError` on Windows when the SID or `icacls` step fails, so
 * secret-bearing callers fail closed instead of leaving inherited access.
 */
export function restrictToOwner(
  path: string,
  deps: RestrictToOwnerDeps = {},
  options: RestrictToOwnerOptions = {},
): void {
  if ((deps.platform ?? process.platform) !== "win32") return;
  const exec = deps.exec ?? defaultOwnerAclExec;
  let sid: string;
  try {
    sid = resolveCurrentUserSid(exec);
  } catch (error) {
    if (error instanceof RestrictToOwnerError) {
      throw new RestrictToOwnerError(path, error.stage, error.message, { cause: error.cause });
    }
    throw error;
  }
  const directory = (deps.isDirectory ?? pathIsDirectory)(path);
  // Directories carry an inheritable ACE so files created later stay private.
  const grant = directory ? `*${sid}:(OI)(CI)(F)` : `*${sid}:(F)`;
  const args = [path, "/inheritance:r", "/grant:r", grant];
  if (directory && options.recursive === true) args.push("/T");
  try {
    exec(windowsSystemTool("icacls"), args, { timeout: RESTRICT_TO_OWNER_TIMEOUT_MS });
  } catch (error) {
    throw new RestrictToOwnerError(
      path,
      "icacls",
      `Could not restrict ${path} to the current user: ${messageOf(error)}`,
      { cause: error },
    );
  }
}
