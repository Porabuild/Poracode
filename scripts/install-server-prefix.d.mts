/**
 * Type surface for `install-server-prefix.mjs` so the vitest suite in
 * `src/server/serverUpgrade.integration.test.ts` imports it typed.
 */
export interface InstallServerPrefixOptions {
  /** Assembled `poracode-server-*.tar.gz` to install. */
  tarball: string;
  /** Prefix receiving `<prefix>/releases/<id>/` and the `<prefix>/current` symlink. */
  prefix: string;
}

export interface InstallServerPrefixResult {
  prefix: string;
  releaseDir: string;
  current: string;
}

export declare function installServerPrefix(
  options: InstallServerPrefixOptions,
): InstallServerPrefixResult;
