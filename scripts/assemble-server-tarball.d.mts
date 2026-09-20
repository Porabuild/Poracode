/**
 * Type surface for `assemble-server-tarball.mjs` (V6 D.2/F.1) so the vitest
 * suite in `src/server/assemble-server-tarball.test.ts` imports it typed.
 */
export interface AssembleServerTarballOptions {
  /** Directory receiving the tarball, `.sha256`, and the staging tree. */
  outDir?: string;
  /** Compiled main-bundle directory carrying the `*.ssh-runtime-manifest.json` union. */
  mainBundleDir?: string;
  /** Prepared native overlay (`prepare-server-native.mjs` output) shipped inside the tarball. */
  overlaySource?: string;
}

export interface AssembleServerTarballResult {
  tarballPath: string;
  sha256: string;
  stageDir: string;
}

export declare function assembleServerTarball(
  options?: AssembleServerTarballOptions,
): AssembleServerTarballResult;
