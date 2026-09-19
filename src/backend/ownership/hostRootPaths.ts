import { existsSync, lstatSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";

/** First owned-host layout. This is independent of the remote wire protocol. */
export const HOST_ROOT_LAYOUT_VERSION = 1;
export const HOST_ROOT_MANIFEST_FILE = "host-root.json";
export const HOST_ROOT_SUFFIX = ".host-v1";

export interface HostRootPaths {
  /** Legacy/default BASE_DIR input. New hosts never use it as writable state. */
  readonly profileNamespace: string;
  readonly dataRoot: string;
  /** Electron's device state is separate from both legacy and server state. */
  readonly electronUserDataRoot: string;
  /** Stable lease identity outside every directory an import may replace. */
  readonly leasePath: string;
  readonly ownerRecordPath: string;
  /**
   * Data-custody fence held by the backend that writes the owned database
   * (`hostDataFence.ts`). Shared by both root mappings, like the lease.
   */
  readonly dataFencePath: string;
}

/** A mapped sibling must not redirect writes behind a different root's lease. */
export function assertHostRootDirectories(paths: HostRootPaths): void {
  for (const [path, name] of [
    [paths.dataRoot, "owned root"],
    [paths.electronUserDataRoot, "client root"],
  ] as const) {
    try {
      const entry = lstatSync(path);
      if (entry.isSymbolicLink()) {
        throw new Error(`The Poracode ${name} cannot be a symbolic link.`);
      }
      if (!entry.isDirectory()) throw new Error(`The Poracode ${name} must be a directory.`);
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") {
        throw error;
      }
    }
  }
}

/** Resolve existing ancestors so symlink spellings identify the same owner. */
export function canonicalHostPath(input: string): string {
  if (!isAbsolute(input)) throw new Error("Poracode profile namespaces must be absolute paths.");
  const suffix: string[] = [];
  let ancestor = resolve(input);
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) throw new Error("The profile namespace has no existing ancestor.");
    suffix.unshift(ancestor.slice(parent.length).replace(/^[\\/]+/u, ""));
    ancestor = parent;
  }
  if (!statSync(ancestor).isDirectory()) {
    throw new Error("The Poracode profile namespace must resolve to a directory.");
  }
  return resolve(realpathSync.native(ancestor), ...suffix);
}

/**
 * Map a profile namespace to its owned `.host-v1` sibling. Both entry
 * bootstraps — the standalone server and, since the V5 data-root
 * unification, the desktop-managed host — resolve their data root through
 * this one mapping. `resolvePoracodePaths` remains a literal-root helper
 * for backend, supervisor, and worker callers: it never applies the
 * mapping again.
 */
export function resolveHostRootPaths(profileNamespace: string): HostRootPaths {
  const canonical = canonicalHostPath(profileNamespace);
  if (canonical === parse(canonical).root) {
    throw new Error("A filesystem root cannot be a Poracode profile namespace.");
  }
  if (
    canonical.endsWith(HOST_ROOT_SUFFIX) ||
    existsSync(join(canonical, HOST_ROOT_MANIFEST_FILE))
  ) {
    throw new Error(
      "PORACODE_BASE_DIR selects the original profile namespace, not an owned .host-v1 root. " +
        "Use the namespace recorded in host-root.json to avoid nesting data roots.",
    );
  }
  const paths: HostRootPaths = {
    profileNamespace: canonical,
    dataRoot: `${canonical}${HOST_ROOT_SUFFIX}`,
    electronUserDataRoot: `${canonical}.client-v1`,
    leasePath: `${canonical}.host-owner.sqlite`,
    ownerRecordPath: `${canonical}.host-owner.json`,
    dataFencePath: `${canonical}.host-data.sqlite`,
  };
  assertHostRootDirectories(paths);
  return paths;
}

/**
 * The desktop-managed host mapping. Since the V5 data-root unification
 * (plan 1.3) the desktop owns the SAME `.host-v1` sibling the standalone
 * server owns: one data lineage per profile namespace, one lease, one
 * fence, one root layout. The historical desktop mapping that used the
 * plain profile directory as its writable root is promoted into the owned
 * sibling automatically on first managed launch
 * (`promoteDesktopRoot.ts`); the plain directory is preserved untouched as
 * the pre-promotion copy.
 *
 * The function stays a separate named entry (rather than every caller
 * switching to `resolveHostRootPaths`) so the desktop admission, attach
 * probe and backend fork keep one explicit spelling of "the root mapping
 * the desktop process owns".
 */
export function resolveDesktopHostRootPaths(profileNamespace: string): HostRootPaths {
  return resolveHostRootPaths(profileNamespace);
}
