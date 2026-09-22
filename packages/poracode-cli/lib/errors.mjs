/**
 * The launcher's failure vocabulary. Every error carries a stable `code` and
 * an actionable hint so `npx poracode` failures are self-explaining.
 */
export class PoracodeLauncherError extends Error {
  constructor(code, message, hint) {
    super(message);
    this.name = "PoracodeLauncherError";
    this.code = code;
    this.hint = hint;
  }
}

export function unsupportedTarget(target, available) {
  return new PoracodeLauncherError(
    "PORACODE_TARGET_UNSUPPORTED",
    `Poracode has no published standalone runtime for ${target}.`,
    `Published targets: ${available.length > 0 ? available.join(", ") : "none yet"}. ` +
      "Windows standalone is not supported; use the Poracode desktop app or WSL. " +
      "macOS standalone is published only when the release matrix includes it.",
  );
}

export function checksumMismatch(url, expected, actual) {
  return new PoracodeLauncherError(
    "PORACODE_ARTIFACT_CHECKSUM_MISMATCH",
    `Refusing to install the runtime from ${url}: sha256 ${actual} does not match the pinned ${expected}.`,
    "The download or the pinned manifest is wrong. Do not bypass this check; report the release.",
  );
}

export function downloadFailed(url, cause) {
  const error = new PoracodeLauncherError(
    "PORACODE_RUNTIME_DOWNLOAD_FAILED",
    `The Poracode runtime download failed: ${url} (${cause instanceof Error ? cause.message : String(cause)}).`,
  );
  error.cause = cause;
  return error;
}

export function offlineNoCache(url, cacheDir) {
  return new PoracodeLauncherError(
    "PORACODE_RUNTIME_UNAVAILABLE",
    `The Poracode runtime could not be downloaded from ${url} and no verified runtime is cached.`,
    `Cache path: ${cacheDir}. Check network access, or install a verified tarball with ` +
      "PORACODE_SERVER_TARBALL and PORACODE_SERVER_TARBALL_SHA256.",
  );
}

export function installCancelled(lockDir) {
  return new PoracodeLauncherError(
    "PORACODE_RUNTIME_INSTALL_CANCELLED",
    "The Poracode runtime install was cancelled before it finished.",
    `Nothing was deleted by the cancelled wait. The install lock is ${lockDir}; re-run poracode to retry.`,
  );
}

export function cacheTampered(runtimeDir, detail) {
  return new PoracodeLauncherError(
    "PORACODE_RUNTIME_CACHE_TAMPERED",
    `The cached Poracode runtime at ${runtimeDir} does not match its install record (${detail}).`,
    `Remove ${runtimeDir} and run again to reinstall the verified runtime.`,
  );
}

/**
 * The cache path exists but holds no install record this generation can read
 * (an unknown future generation, a corrupt marker, or markerless content). It
 * is never replaced or deleted; a bad or newer entry fails closed instead of
 * being overwritten.
 */
export function cacheUnreadable(runtimeDir, detail) {
  return new PoracodeLauncherError(
    "PORACODE_RUNTIME_CACHE_UNREADABLE",
    `The Poracode runtime cache path ${runtimeDir} holds no readable install record (${detail}).`,
    `Nothing was deleted. Remove ${runtimeDir} and run again to reinstall the verified runtime.`,
  );
}

/**
 * The install lock stayed busy for the whole wait. The lock is only a
 * duplicate-work optimization: `ensureRuntime` records this and installs
 * through its independently safe publication path instead of failing.
 */
export function installLockTimeout(lockDir, cause) {
  const error = new PoracodeLauncherError(
    "PORACODE_RUNTIME_INSTALL_LOCK_TIMEOUT",
    `Timed out waiting for another Poracode runtime install (${lockDir}).`,
    `If no install is running, remove the lock directory and retry. An install proceeds ` +
      "concurrently, verified, when the lock cannot be taken.",
  );
  if (cause) error.cause = cause;
  return error;
}

/**
 * The lock record is not a generation this launcher understands (a future
 * format, an interim format, or an unreadable file). It is never reclaimed and
 * never deleted; `ensureRuntime` proceeds without the lock optimization.
 */
export function installLockForeign(lockDir) {
  return new PoracodeLauncherError(
    "PORACODE_RUNTIME_INSTALL_LOCK_FOREIGN",
    `The runtime install lock at ${lockDir} is not an owner record this launcher understands.`,
    "It may belong to a different or newer Poracode generation, so it is never deleted or " +
      "replaced. The install continues without the lock optimization.",
  );
}
